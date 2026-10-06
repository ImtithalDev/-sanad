import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/billing/get-provider";
import { getPlanLimits } from "@/lib/billing/get-plan-limits";
import { BillingProviderConfigError, BillingProviderUnavailableError } from "@/lib/billing/errors";

const requestSchema = z.object({
  plan: z.enum(["pro", "business"]), // "free" is never checked out — it's the default, not a purchase
});

const PENDING_REUSE_WINDOW_MINUTES = 30;

// This route does exactly one thing: ask the payment provider to create a
// checkout session and hand the user its URL. It NEVER writes to
// `subscriptions` — that only happens in app/api/billing/webhook/route.ts,
// after the provider has confirmed a real payment. A user completing (or
// even just visiting) this checkout flow and returning to the app changes
// nothing about their plan until a verified webhook says otherwise.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error_code: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error_code: "invalid_request" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error_code: "invalid_request" }, { status: 400 });
  }

  // Duplicate-click protection: reuse a still-pending checkout for the same
  // plan created recently rather than creating a second Invoice at the
  // provider for every click of "Upgrade." Moyasar's own idempotency
  // mechanism (given_id) is documented for the Payments API, not the
  // Invoices API, so this is an application-level guard rather than a
  // provider-level one — it prevents checkout clutter, not a double charge
  // (no charge has happened yet at this point regardless).
  const reuseSince = new Date(Date.now() - PENDING_REUSE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("checkout_sessions")
    .select("checkout_url")
    .eq("user_id", user.id)
    .eq("plan", parsed.data.plan)
    .eq("status", "pending")
    .gte("created_at", reuseSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.checkout_url) {
    return NextResponse.json({ checkoutUrl: existing.checkout_url });
  }

  const limits = await getPlanLimits(parsed.data.plan);
  if (!limits) {
    return NextResponse.json({ error_code: "unknown_plan" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  try {
    const provider = getPaymentProvider();
    const checkout = await provider.createCheckout({
      userId: user.id,
      plan: parsed.data.plan,
      priceCents: limits.price_cents,
      currency: limits.currency,
      successUrl: `${siteUrl}/dashboard/billing?checkout=return`,
      backUrl: `${siteUrl}/dashboard/billing?checkout=cancelled`,
    });

    // Recorded BEFORE redirecting the user anywhere, so the webhook handler
    // has something to reconcile against even if the user never returns to
    // this tab (e.g. they complete payment on their phone).
    const { error: insertError } = await supabase.from("checkout_sessions").insert({
      user_id: user.id,
      plan: parsed.data.plan,
      provider: provider.name,
      provider_session_id: checkout.providerSessionId,
      checkout_url: checkout.checkoutUrl,
      status: "pending",
    });
    if (insertError) {
      return NextResponse.json({ error_code: "checkout_record_failed" }, { status: 500 });
    }

    return NextResponse.json({ checkoutUrl: checkout.checkoutUrl });
  } catch (err) {
    if (err instanceof BillingProviderConfigError) {
      return NextResponse.json({ error_code: "provider_not_configured" }, { status: 503 });
    }
    if (err instanceof BillingProviderUnavailableError) {
      return NextResponse.json({ error_code: "provider_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error_code: "unknown_error" }, { status: 500 });
  }
}
