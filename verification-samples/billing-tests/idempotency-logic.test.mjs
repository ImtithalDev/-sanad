// Simulates the exact control flow of process_payment_webhook_event() from
// 0006_billing.sql: an in-memory stand-in for the (provider, provider_event_id)
// unique constraint, used to verify the DEDUP LOGIC ITSELF (insert-first,
// treat-conflict-as-duplicate) is correct — not a substitute for running the
// real function against Postgres, which still requires a live database.
class FakeEventStore {
  constructor() { this.seen = new Set(); this.subscriptionWrites = 0; }
  insertEvent(provider, eventId) {
    const key = `${provider}:${eventId}`;
    if (this.seen.has(key)) throw new Error('unique_violation');
    this.seen.add(key);
  }
  processEvent(provider, eventId, applyEffect) {
    try {
      this.insertEvent(provider, eventId);
    } catch {
      return 'duplicate'; // mirrors the `exception when unique_violation` branch
    }
    applyEffect(); // mirrors sync_subscription_from_webhook running inside the same function
    return 'processed';
  }
}

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }

const store = new FakeEventStore();

// First delivery of a real event: processed exactly once, subscription updated once.
const r1 = store.processEvent('moyasar', 'pay_123', () => store.subscriptionWrites++);
assert(r1 === 'processed', 'first delivery of a new event is processed');
assert(store.subscriptionWrites === 1, 'subscription was updated exactly once after the first delivery');

// Provider retries the SAME event (network hiccup, at-least-once delivery guarantee).
const r2 = store.processEvent('moyasar', 'pay_123', () => store.subscriptionWrites++);
assert(r2 === 'duplicate', 'a retried delivery of the same event id is detected as a duplicate');
assert(store.subscriptionWrites === 1, 'the subscription was NOT updated a second time — no double-application');

// A different event for the same underlying payment (e.g. a distinct id) is a genuinely new event.
const r3 = store.processEvent('moyasar', 'pay_124', () => store.subscriptionWrites++);
assert(r3 === 'processed', 'a genuinely different event id is processed normally, not blocked by unrelated dedup state');
assert(store.subscriptionWrites === 2, 'subscription updated again for the genuinely new event');

// Ten rapid-fire retries of the same id: exactly one processed, nine duplicates, one net effect.
const results = [];
for (let i = 0; i < 10; i++) {
  results.push(store.processEvent('moyasar', 'pay_999', () => store.subscriptionWrites++));
}
assert(results.filter(r => r === 'processed').length === 1, '10 rapid retries of one event id: exactly 1 is processed');
assert(results.filter(r => r === 'duplicate').length === 9, '10 rapid retries of one event id: exactly 9 are duplicates');

console.log(failures === 0 ? '\nALL IDEMPOTENCY LOGIC TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
