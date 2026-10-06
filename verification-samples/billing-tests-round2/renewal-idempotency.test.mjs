const { renewalIdempotencyKey, currentBillingPeriodKey } = await import('/tmp/billingtest/renewal.ts');

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 1. The core safety property: same user + same period -> IDENTICAL key,
// every time, deterministically. This is what makes Moyasar's given_id
// idempotency mechanism actually prevent a double charge on retry.
const k1 = renewalIdempotencyKey('user-abc', '2026-09');
const k2 = renewalIdempotencyKey('user-abc', '2026-09');
assert(k1 === k2, 'the same user+period always derives the identical idempotency key');

// 2. Different users in the same period must NOT collide (would cause
// Moyasar's "Payment is already created" error, or worse, charge the wrong
// person's card under the other's key).
const k3 = renewalIdempotencyKey('user-xyz', '2026-09');
assert(k1 !== k3, 'different users in the same billing period derive different keys');

// 3. The same user in a different period must derive a NEW key (so a real
// new month's renewal isn't blocked as a false "duplicate" of last month's).
const k4 = renewalIdempotencyKey('user-abc', '2026-10');
assert(k1 !== k4, 'the same user in a different billing period derives a different key');

// 4. Moyasar's given_id must be a UUID (per docs.moyasar.com/api/idempotency,
// which recommends v4) — verify the derived key is actually shaped like one,
// or Moyasar would reject the charge request outright.
assert(UUID_RE.test(k1), 'the derived key is formatted as a valid UUID (required by Moyasar\'s given_id field)');

// 5. currentBillingPeriodKey is stable within the same call and month-grained.
const p1 = currentBillingPeriodKey();
const p2 = currentBillingPeriodKey();
assert(p1 === p2, 'currentBillingPeriodKey is stable across calls within the same run');
assert(/^\d{4}-\d{2}$/.test(p1), 'currentBillingPeriodKey is in YYYY-MM form (month-grained, matching the monthly billing interval)');

console.log(failures === 0 ? '\nALL RENEWAL IDEMPOTENCY TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
