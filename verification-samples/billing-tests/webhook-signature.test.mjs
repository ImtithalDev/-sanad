process.env.MOYASAR_SECRET_KEY = 'sk_test_dummy';
process.env.MOYASAR_WEBHOOK_SECRET = 'whsec_test_dummy_secret';

const { MoyasarProvider } = await import('/tmp/billingtest/moyasar.ts');
const crypto = await import('node:crypto');

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }

const provider = new MoyasarProvider();
const secret = process.env.MOYASAR_WEBHOOK_SECRET;

// 1. A correctly signed payload is accepted
const body1 = JSON.stringify({ type: 'payment_paid', data: { id: 'pay_123', metadata: { user_id: 'u1', plan: 'pro' } } });
const validSig = crypto.createHmac('sha256', secret).update(body1, 'utf8').digest('hex');
assert(provider.verifyWebhookSignature(body1, validSig) === true, 'correctly signed payload is accepted');

// 2. Tampering with the body after signing invalidates it (the whole point of signing)
const tamperedBody = JSON.stringify({ type: 'payment_paid', data: { id: 'pay_123', metadata: { user_id: 'ATTACKER', plan: 'business' } } });
assert(provider.verifyWebhookSignature(tamperedBody, validSig) === false, 'tampered body is rejected even with the original valid signature attached');

// 3. A forged signature (attacker guessing / using a wrong secret) is rejected
const forgedSig = crypto.createHmac('sha256', 'wrong-secret').update(body1, 'utf8').digest('hex');
assert(provider.verifyWebhookSignature(body1, forgedSig) === false, 'signature computed with the wrong secret is rejected');

// 4. Missing signature header is rejected, not treated as valid
assert(provider.verifyWebhookSignature(body1, null) === false, 'missing signature header is rejected');
assert(provider.verifyWebhookSignature(body1, '') === false, 'empty signature header is rejected');

// 5. A signature of different length doesn't crash timingSafeEqual (would throw if lengths mismatched and we didn't guard)
let threw = false;
try { provider.verifyWebhookSignature(body1, 'short'); } catch { threw = true; }
assert(threw === false, 'a shorter-than-expected signature is safely rejected, not a crash');

// 6. Replay: the SAME valid signature+body pair verifies true every time (this is expected and correct —
// signature verification alone does not provide replay protection; idempotency is handled separately by
// the database's unique (provider, provider_event_id) constraint, tested at the SQL level, not here).
assert(provider.verifyWebhookSignature(body1, validSig) === true, 'replaying the identical valid request still verifies as authentic (expected — dedup happens at the DB layer, not here)');

// 7. parseWebhookEvent extracts the fields the webhook route depends on
const parsed = provider.parseWebhookEvent(body1);
assert(parsed.eventId === 'pay_123', 'parseWebhookEvent extracts the correct event id for idempotency keying');
assert(parsed.eventType === 'payment_paid', 'parseWebhookEvent extracts the correct event type');

console.log(failures === 0 ? '\nALL WEBHOOK SIGNATURE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
