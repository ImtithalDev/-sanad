import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getPaymentProvider } from "@/lib/billing/get-provider";
import { getPlanLimits } from "@/lib/billing/get-plan-limits";
import { renewalIdempotencyKey, currentBillingPeriodKey } from "@/lib/billing/renewal";

export const runtime = "nodejs";

const GRACE_PERIOD_ATTEMPTS = 3;
const GRACE_PERIOD_DAYS = 7;

// Intended to be invoked by an external scheduler (Vercel Cron, Supabase
// Scheduled Functions, or any cron caller that can set a header) once a day.
// Authorization here is a shared secret, not a user session - there is no
// legitimate reason for a browser to ever call this route, and it performs
// real charges, so it is treated with the same suspicion as the webhook
// route rather than as an internal convenience endpoint.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (provided !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const provider = getPaymentProvider();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  const { data: dueSubscriptions, error: fetchError } = await serviceClient.rpc("subscriptions_due_for_renewal");
  if (fetchError) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const results: Array<{ user_id: string; outcome: string }> = [];

  for (const sub of dueSubscriptions ?? []) {
    // No saved token - cannot attempt a headless charge. Left exactly where
    // it is rather than guessed at; a token only exists if the checkout
    // that produced it actually saved one, which is unconfirmed for the
    // hosted Invoice flow (see moyasar.ts) - this is the most visible
    // real-world symptom of that open question, not a bug in this loop.
    if (!sub.payment_token) {
      results.push({ user_id: sub.user_id, outcome: "skipped_no_token" });
      continue;
    }

    const limits = await getPlanLimits(sub.plan);
    if (!limits) {
      results.push({ user_id: sub.user_id, outcome: "skipped_unknown_plan" });
      continue;
    }

    const idempotencyKey = renewalIdempotencyKey(sub.user_id, currentBillingPeriodKey());

    let chargeResult;
    try {
      chargeResult = await provider.chargeToken({
        token: sub.payment_token,
        amountCents: limits.price_cents,
        currency: limits.currency,
        callbackUrl: `${siteUrl}/api/billing/webhook`,
        idempotencyKey,
      });
    } catch {
      // Provider unreachable / config error - treated as a failed attempt
      // for this cycle; the next scheduled run retries with the SAME
      // idempotency key, so nothing is double-charged if the charge had
      // actually gone through before this catch fired.
      chargeResult = { providerPaymentId: idempotencyKey, status: "failed" };
    }

    const succeeded = chargeResult.status === "paid";
    const newPeriodEnd = succeeded ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

    const { error: processError } = await serviceClient.rpc("process_renewal_webhook_event", {
      p_provider: provider.name,
      p_provider_event_id: chargeResult.providerPaymentId,
      p_event_type: succeeded ? "renewal_paid" : "renewal_failed",
      p_payload: { charge_result: chargeResult, idempotency_key: idempotencyKey },
      p_user_id: sub.user_id,
      p_succeeded: succeeded,
      p_new_period_end: newPeriodEnd,
      p_grace_period_attempts: GRACE_PERIOD_ATTEMPTS,
      p_grace_period_days: GRACE_PERIOD_DAYS,
    });

    results.push({ user_id: sub.user_id, outcome: processError ? "process_error" : succeeded ? "renewed" : "past_due_or_expired" });
  }

  return NextResponse.json({ processed: results.length, results });
}
