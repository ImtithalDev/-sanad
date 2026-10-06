import crypto from "crypto";
import type {
  PaymentProvider,
  CreateCheckoutParams,
  CreateCheckoutResult,
  ChargeTokenParams,
  ChargeTokenResult,
  ParsedWebhookEvent,
} from "../types";
import { BillingProviderConfigError, BillingProviderUnavailableError } from "../errors";

const MOYASAR_API_BASE = "https://api.moyasar.com/v1";

// ============================================================================
// VERIFIED against Moyasar's official documentation (docs.moyasar.com),
// fetched and read directly during this fix — corrected from an earlier,
// unverified assumption. Two real corrections this revision makes:
//
// 1. WEBHOOK VERIFICATION IS NOT HMAC-OVER-HEADER. Moyasar's account-level
//    Webhook Object (docs.moyasar.com/api/other/webhooks/webhook-reference)
//    embeds a `secret_token` field INSIDE the JSON body itself — the value
//    you supplied when registering the webhook (`shared_secret` at creation
//    time, POST /v1/webhooks). There is no `x-moyasar-signature` header and
//    no HMAC computation. Verification is: parse the body, compare
//    `body.secret_token` to your stored secret with a timing-safe check.
//    This is a weaker scheme than HMAC-over-raw-body (the secret isn't
//    cryptographically bound to the specific payload — anyone who obtains
//    the secret_token value once can construct arbitrary fake events), so
//    the webhook endpoint MUST be served over HTTPS only and the secret
//    treated as sensitive, rotated if ever suspected leaked. This is not an
//    improvised workaround — it is what Moyasar's own docs specify.
//
// 2. THE WEBHOOK OBJECT'S OWN `id` IS THE IDEMPOTENCY KEY — not the
//    payment's id nested inside `data`. The Webhook Object table lists:
//    id (event's unique id), type, created_at, secret_token, account_name,
//    live, data. `data` is a Payment object for payment_* events, which has
//    ITS OWN `id` plus an `invoice_id` field ("Invoice ID that this payment
//    is used to pay") — that `invoice_id` is what correlates a payment_paid
//    event back to the Invoice created at checkout (stored as
//    checkout_sessions.provider_session_id), not `data.id`.
//
// Still NOT verified (no live Moyasar account exists in this environment):
// the exact Invoice-creation response shape end-to-end, real webhook
// delivery, and whether Moyasar's HOSTED invoice checkout page automatically
// captures a reusable card token (needed for the renewal job) — the
// documented, GUARANTEED way to get a token is `source.save_card: true` on
// a direct Payment API call, which requires building a custom card-entry
// form rather than using the hosted Invoice page. This is flagged again in
// lib/billing/renewal.ts, since it affects whether recurring billing can
// actually run without a checkout-flow change.
// ============================================================================

export class MoyasarProvider implements PaymentProvider {
  readonly name = "moyasar";

  private getSecretKey(): string {
    const key = process.env.MOYASAR_SECRET_KEY;
    if (!key) throw new BillingProviderConfigError("MOYASAR_SECRET_KEY is not configured");
    return key;
  }

  private getWebhookSecret(): string {
    const secret = process.env.MOYASAR_WEBHOOK_SECRET;
    if (!secret) throw new BillingProviderConfigError("MOYASAR_WEBHOOK_SECRET is not configured");
    return secret;
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.getSecretKey()}:`).toString("base64")}`;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    // Fields per docs.moyasar.com/api/invoices/01-create-invoice: amount,
    // currency, description (all required), callback_url, success_url,
    // back_url, expired_at (all optional). Invoice creation does NOT
    // document a settable `metadata` field, unlike direct Payment creation —
    // so correlation back to our own user/plan uses the returned invoice
    // `id` (stored in checkout_sessions), not metadata.
    const res = await fetch(`${MOYASAR_API_BASE}/invoices`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: this.authHeader() },
      body: JSON.stringify({
        amount: params.priceCents,
        currency: params.currency,
        description: `Sanad — ${params.plan} plan subscription`,
        success_url: params.successUrl,
        back_url: params.backUrl,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new BillingProviderUnavailableError(`Moyasar invoice creation failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return { checkoutUrl: data.url, providerSessionId: data.id };
  }

  async chargeToken(params: ChargeTokenParams): Promise<ChargeTokenResult> {
    // Per docs.moyasar.com/api/payments/01-create-payment and the
    // tokenization guide: source.type "token" + the saved token id charges
    // the card without customer interaction. `given_id` is Moyasar's own
    // documented idempotency mechanism (docs.moyasar.com/api/idempotency):
    // retrying this exact request with the same given_id after a network
    // failure returns the ORIGINAL payment result instead of charging again
    // — this is what makes the renewal job safe to retry.
    // 3DS is set to false here specifically because this is a headless,
    // merchant-initiated renewal charge with no customer present to
    // complete an interactive 3DS challenge — if Moyasar required 3DS on a
    // token charge regardless of this flag, this renewal architecture would
    // not work unmodified and would need a different flow (e.g. an email
    // asking the customer to re-authenticate). This has NOT been confirmed
    // against a live account; flagged in the Phase 8 report as unverified.
    const res = await fetch(`${MOYASAR_API_BASE}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: this.authHeader() },
      body: JSON.stringify({
        given_id: params.idempotencyKey,
        amount: params.amountCents,
        currency: params.currency,
        description: "Sanad subscription renewal",
        callback_url: params.callbackUrl,
        source: { type: "token", token: params.token, "3ds": false, manual: false },
      }),
    });

    if (res.status >= 500) {
      throw new BillingProviderUnavailableError(`Moyasar renewal charge failed (${res.status})`);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A 4xx here is a real outcome (e.g. "Payment is already created" if
      // given_id collided with a DIFFERENT payment — a bug in our own
      // idempotency-key derivation, not a transient failure) — surfaced as
      // a failed charge rather than thrown, so the renewal job can record
      // it and move the subscription toward past_due/expired normally.
      return { providerPaymentId: data.id ?? params.idempotencyKey, status: data.status ?? "failed" };
    }

    return { providerPaymentId: data.id, status: data.status };
  }

  verifyWebhookSignature(rawBody: string): boolean {
    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return false;
    }

    const received = parsed?.secret_token;
    if (typeof received !== "string" || received.length === 0) return false;

    const expected = this.getWebhookSecret();

    // Timing-safe comparison even though this isn't an HMAC — a plain `===`
    // string comparison in V8 short-circuits at the first differing
    // character, which is exactly the kind of timing side-channel
    // timingSafeEqual exists to close.
    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(received, "utf8");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    const payload = JSON.parse(rawBody);
    // Per the Webhook Object reference: `id` and `type` are top-level
    // fields on the envelope itself, not nested inside `data`.
    return {
      eventId: payload?.id,
      eventType: payload?.type ?? "unknown",
      payload,
    };
  }
}
