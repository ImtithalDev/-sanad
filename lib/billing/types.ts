export type CreateCheckoutParams = {
  userId: string;
  plan: string;
  priceCents: number;
  currency: string;
  successUrl: string;
  backUrl: string;
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  providerSessionId: string; // the provider's invoice/session id — stored in checkout_sessions
};

export type ChargeTokenParams = {
  token: string;
  amountCents: number;
  currency: string;
  callbackUrl: string;
  // A caller-generated idempotency key. The SAME key must always produce the
  // SAME charge outcome at the provider — this is what makes a renewal job
  // retry-safe: if our own request times out and the cron retries with the
  // same key, the provider returns the original result instead of charging
  // twice. See lib/billing/renewal.ts for how this is derived.
  idempotencyKey: string;
};

export type ChargeTokenResult = {
  providerPaymentId: string;
  status: string; // provider-specific ("paid", "failed", "initiated", ...)
};

export type ParsedWebhookEvent = {
  eventId: string;
  eventType: string;
  payload: unknown;
};

// Every payment provider in this app is used only through this interface —
// the same reasoning as lib/ai/types.ts in Phase 7. Swapping providers later
// means writing one new class, not touching the checkout/webhook/renewal
// route handlers.
export interface PaymentProvider {
  readonly name: string;
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;
  chargeToken(params: ChargeTokenParams): Promise<ChargeTokenResult>;
  // Takes the RAW request body — never a parsed/re-serialized object, since
  // some providers (GitHub, Stripe) sign the exact bytes; Moyasar's own
  // scheme (see moyasar.ts) instead embeds a shared secret inside the JSON
  // body itself, so this method parses the body internally.
  verifyWebhookSignature(rawBody: string): boolean;
  parseWebhookEvent(rawBody: string): ParsedWebhookEvent;
}
