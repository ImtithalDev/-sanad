# Phase 8 billing verification scripts

- `webhook-signature.test.mjs` — imports and runs the ACTUAL, unmodified
  `lib/billing/providers/moyasar.ts` (via Node's native TypeScript
  stripping), with real HMAC-SHA256 computation. Verifies: valid signatures
  are accepted, tampered bodies are rejected even with a stolen-looking
  signature, wrong-secret signatures are rejected, missing/empty headers are
  rejected, mismatched-length signatures don't crash, and event
  id/type extraction is correct.
- `idempotency-logic.test.mjs` — a plain-JS simulation of the exact
  insert-first, catch-unique-violation control flow implemented in
  `process_payment_webhook_event()` (0006_billing.sql). Verifies 10 rapid
  retries of one event id produce exactly 1 "processed" and 9 "duplicate"
  results, with the underlying effect (subscription update) applied exactly
  once. This tests the CONTROL FLOW logic in isolation, not the real
  Postgres function — running the actual SQL against a live database is
  still required (see the main README's Phase 8 report).

Neither script calls a real payment provider or a real Supabase project.
