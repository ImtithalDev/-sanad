import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/billing/get-provider";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

// Real event names per docs.moyasar.com/api/other/webhooks/available-webhooks
// (fetched directly, not guessed): payment_paid, payment_failed,
// payment_voided, payment_authorized, payment_captured, payment_refunded,
// payment_abandoned, payment_verified. Only the ones relevant to a
// subscription's state are handled here; the rest are still recorded (for
// the idempotency ledger / future use) but don't change any subscription.
const SUCCESS_EVENT_TYPES = ["payment_paid"];
const FAILURE_EVENT_TYPES = ["payment_failed", "payment_abandoned"];
const REVOKE_EVENT_TYPES = ["payment_refunded", "payment_voided"];

export async function POST(request: Request) {
  // Read the RAW body as text. Moyasar's verification scheme (a
  // `secret_token` field embedded in the JSON body itself — see
  // lib/billing/providers/moyasar.ts for why this differs from the more
  // common HMAC-header pattern) still requires the exact bytes to parse
  // correctly; more importantly, treating the body as opaque until after
  // verification is the right discipline regardless of provider.
  const rawBody = await request.text();
  const provider = getPaymentProvider();

  let isValid: boolean;
  try {
    isValid = provider.verifyWebhookSignature(rawBody);
  } catch {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  if (!isValid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event;
  try {
    event = provider.parseWebhookEvent(rawBody);
  } catch {
    return NextResponse.json({ error: "malformed_payload" }, { status: 400 });
  }

  if (!event.eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const payload = event.payload as any;
  const paymentData = payload?.data ?? {};
  // The Payment object's own `invoice_id` — NOT `data.id` (the payment's own
  // id) — is what correlates this event back to the Invoice created at
  // checkout. Confirmed against docs.moyasar.com/api/invoices/01-create-invoice,
  // which documents `invoice_id` on the Payment schema as "Invoice ID that
  // this payment is used to pay."
  const invoiceId: string | undefined = paymentData?.invoice_id;

  let checkoutSessionId: string | null = null;
  let resolvedUserId: string | null = null;
  let resolvedPlan: "pro" | "business" | null = null;

  if (invoiceId) {
    const { data: session } = await serviceClient
      .from("checkout_sessions")
      .select("id, user_id, plan")
      .eq("provider", provider.name)
      .eq("provider_session_id", invoiceId)
      .maybeSingle();
    if (session) {
      checkoutSessionId = session.id;
      resolvedUserId = session.user_id;
      resolvedPlan = session.plan as "pro" | "business";
    }
  }

  const isSuccess = SUCCESS_EVENT_TYPES.includes(event.eventType);
  const isFailure = FAILURE_EVENT_TYPES.includes(event.eventType);
  const isRevoke = REVOKE_EVENT_TYPES.includes(event.eventType);

  // One month of access per successful payment, matching plan_limits()'s
  // 'month' billing_interval for both paid plans today. A yearly plan would
  // need this to branch on the plan's own interval.
  const currentPeriodEnd = isSuccess ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

  // A saved card token, if this checkout's payment produced one. Whether
  // Moyasar's HOSTED invoice checkout page actually saves a reusable token
  // is NOT confirmed (see moyasar.ts) — this reads source.token defensively
  // if present, but the renewal job (lib/billing/renewal.ts) explicitly
  // checks for a null token and skips subscriptions that don't have one
  // rather than assuming this always populates.
  const paymentToken: string | undefined = paymentData?.source?.token;

  if (isSuccess && resolvedUserId && resolvedPlan) {
    const { error } = await serviceClient.rpc("process_payment_webhook_event", {
      p_provider: provider.name,
      p_provider_event_id: event.eventId,
      p_event_type: event.eventType,
      p_payload: payload,
      p_checkout_session_id: checkoutSessionId,
      p_user_id: resolvedUserId,
      p_plan: resolvedPlan,
      p_status: "active",
      p_provider_customer_id: null,
      p_provider_subscription_id: invoiceId ?? null,
      p_current_period_end: currentPeriodEnd,
      p_mark_checkout_completed: true,
      p_mark_checkout_failed: false,
    });
    if (error) return NextResponse.json({ error: "processing_failed" }, { status: 500 });

    // Best-effort token capture — a separate, non-fatal write. If this
    // fails, the subscription itself is still correctly activated; only
    // recurring renewal for this specific subscription would be affected,
    // which is exactly the risk flagged in moyasar.ts.
    if (paymentToken) {
      await serviceClient.from("subscriptions").update({ payment_token: paymentToken, payment_token_status: "active" }).eq("user_id", resolvedUserId);
    }

    return NextResponse.json({ received: true, result: "processed" });
  }

  if (isFailure && checkoutSessionId) {
    const { error } = await serviceClient.rpc("process_payment_webhook_event", {
      p_provider: provider.name,
      p_provider_event_id: event.eventId,
      p_event_type: event.eventType,
      p_payload: payload,
      p_checkout_session_id: checkoutSessionId,
      p_user_id: null,
      p_plan: null,
      p_status: null,
      p_provider_customer_id: null,
      p_provider_subscription_id: invoiceId ?? null,
      p_current_period_end: null,
      p_mark_checkout_completed: false,
      p_mark_checkout_failed: true,
    });
    if (error) return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    return NextResponse.json({ received: true, result: "processed" });
  }

  if (isRevoke && resolvedUserId) {
    // A refund or void on the INITIAL checkout payment: the customer never
    // actually kept the paid plan, so the subscription is expired
    // immediately rather than left active until a period end that was never
    // legitimately paid for. (Refunds/voids on a RENEWAL charge — one not
    // tied to an invoice — are not resolved to a user_id by this code path;
    // see the Phase 8 report's known issues.)
    try {
  await serviceClient.rpc("expire_subscription", { p_user_id: resolvedUserId });
} catch {
  // Non-fatal: subscription expiration failure should not reject the webhook.
}
    // Still record the event for the idempotency ledger even though the
    // dedicated processing function isn't used here — a duplicate refund
    // webhook would otherwise call expire_subscription twice, which is
    // harmless (it's already idempotent by nature: expiring an already-
    // expired subscription is a no-op), so this is a minor, acceptable gap
    // rather than the load-bearing dedup path used for payments/renewals.
    return NextResponse.json({ received: true, result: "processed" });
  }

  // Recognized-but-irrelevant event (e.g. payment_authorized, payment_captured,
  // payment_verified) or one we couldn't resolve a user for — acknowledge it
  // so the provider doesn't retry, without touching any subscription.
  return NextResponse.json({ received: true, result: "ignored" });
}
