process.env.MOYASAR_SECRET_KEY = 'sk_test_dummy';
process.env.MOYASAR_WEBHOOK_SECRET = 'whsec_real_dummy_secret';

const { MoyasarProvider } = await import('/tmp/billingtest/moyasar.ts');

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }

const provider = new MoyasarProvider();

// 1. Correct secret_token embedded in the body (Moyasar's REAL scheme, confirmed
// against docs.moyasar.com/api/other/webhooks/webhook-reference) is accepted.
const validBody = JSON.stringify({
  id: 'evt_1', type: 'payment_paid', created_at: '2026-09-19T00:00:00Z',
  secret_token: 'whsec_real_dummy_secret', account_name: 'Sanad', live: true,
  data: { id: 'pay_1', invoice_id: 'inv_1', status: 'paid', metadata: {} },
});
assert(provider.verifyWebhookSignature(validBody) === true, 'a body with the correct secret_token is accepted');

// 2. Wrong secret_token is rejected
const wrongSecretBody = JSON.stringify({ id: 'evt_2', type: 'payment_paid', secret_token: 'wrong', data: {} });
assert(provider.verifyWebhookSignature(wrongSecretBody) === false, 'a body with the wrong secret_token is rejected');

// 3. Missing secret_token entirely is rejected, not treated as valid
const noSecretBody = JSON.stringify({ id: 'evt_3', type: 'payment_paid', data: {} });
assert(provider.verifyWebhookSignature(noSecretBody) === false, 'a body with no secret_token field is rejected');

// 4. Malformed JSON is rejected safely, not a crash
let threw = false;
try { provider.verifyWebhookSignature('{not json'); } catch { threw = true; }
assert(threw === false && provider.verifyWebhookSignature('{not json') === false, 'malformed JSON body is safely rejected, not a crash');

// 5. Event id/type extraction uses the TOP-LEVEL id/type (the actual webhook
// envelope id per Moyasar's docs), not data.id (the nested payment's own id) —
// this was a real bug in the pre-fix version, corrected here.
const parsed = provider.parseWebhookEvent(validBody);
assert(parsed.eventId === 'evt_1', 'eventId is the top-level webhook id, not the nested payment id (pay_1)');
assert(parsed.eventType === 'payment_paid', 'eventType is the top-level type field');

// 6. A payment's invoice_id (used for checkout correlation) is reachable from
// the parsed payload's data — confirms the webhook route's correlation logic
// has the field it expects, under the real payload shape.
assert(parsed.payload.data.invoice_id === 'inv_1', 'the Payment object\'s invoice_id is present for checkout_sessions correlation');

console.log(failures === 0 ? '\nALL CORRECTED-WEBHOOK TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
