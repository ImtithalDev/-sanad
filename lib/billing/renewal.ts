import crypto from "crypto";

// Deterministic idempotency key for a renewal charge: the SAME user + the
// SAME billing period always derives the SAME key, so if the cron job runs
// twice for the same period (a duplicate cron trigger, a retried HTTP call
// to this route), Moyasar's own idempotency mechanism (given_id — see
// docs.moyasar.com/api/idempotency, fetched and confirmed during this fix)
// returns the ORIGINAL charge result instead of charging the card again.
// This is what "safe recurring renewal without duplicate charges" means
// concretely: the safety net is at the provider, keyed by a value we derive
// the same way every time, not by our own before-charging checks alone.
export function renewalIdempotencyKey(userId: string, periodStart: string): string {
  const hash = crypto.createHash("sha256").update(`renewal:${userId}:${periodStart}`).digest("hex");
  // given_id must be a UUID per Moyasar's docs — format the hash as one.
  return [hash.slice(0, 8), hash.slice(8, 12), "4" + hash.slice(13, 16), "8" + hash.slice(17, 20), hash.slice(20, 32)].join("-");
}

export function currentBillingPeriodKey(): string {
  // One key per calendar month — matches plan_limits().billing_interval
  // being 'month' for both paid plans today. A yearly plan would need its
  // own period-key derivation.
  return new Date().toISOString().slice(0, 7); // "2026-09"
}
