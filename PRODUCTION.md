# Sanad — Production Configuration Guide

This consolidates setup steps scattered across the phase-by-phase README into
one place. It does not repeat the phase-by-phase verification detail — see
`README.md` for that.

## 1. Environment variables (see `.env.example` for the full annotated list)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Project Settings → API. **Server-only** — used exclusively by `lib/supabase/service-role.ts`, imported only by the billing webhook route. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Your real domain in production |
| `AI_PROVIDER` | No (default `anthropic`) | |
| `ANTHROPIC_API_KEY` | Yes, for AI features | Server-only |
| `ANTHROPIC_MODEL` | No (default `claude-sonnet-4-6`) | |
| `PAYMENT_PROVIDER` | No (default `moyasar`) | |
| `MOYASAR_SECRET_KEY` | Yes, for billing | Server-only |
| `MOYASAR_WEBHOOK_SECRET` | Yes, for billing | Server-only — must match the `shared_secret` used when registering the webhook in Moyasar's dashboard/API |
| `CRON_SECRET` | Yes, for recurring billing | Server-only — set as `x-cron-secret` header by your scheduler |

## 2. Supabase setup, in order

1. Create a Supabase project.
2. Run every file in `supabase/migrations/` **in filename order** (`0001` → `0006`) — each depends on tables/functions from the ones before it. Use the SQL Editor or `supabase db push` if using the CLI.
3. Confirm all 15 tables have RLS enabled (Table Editor shows a lock icon) — this should already be true from the migrations, but is worth a manual glance before going live.
4. In Auth settings, add your production domain's `/auth/callback` to Redirect URLs.

## 3. Payment provider (Moyasar) setup

1. Create a Moyasar merchant account.
2. Get the Secret Key (Settings → API Keys).
3. Register a webhook (Settings → Webhooks, or `POST /v1/webhooks`) pointing at `https://yourdomain.com/api/billing/webhook`, selecting at minimum `payment_paid`, `payment_failed`, `payment_refunded`, `payment_voided`. Set a `shared_secret` — this exact value becomes `MOYASAR_WEBHOOK_SECRET`.
4. **Before relying on recurring billing**, confirm with Moyasar (dashboard settings or support) whether the hosted Invoice checkout page can be configured to save a reusable card token, or whether the checkout flow needs to change to a direct Payment API call with `source.save_card: true`. This is the one unresolved design question in the billing system — see the README's Phase 8 fixes section.
5. Set up the renewal cron: a daily scheduled call to `POST https://yourdomain.com/api/billing/cron/renew-subscriptions` with header `x-cron-secret: <CRON_SECRET>`. Vercel Cron, Supabase Scheduled Functions, or any external scheduler that can set a header will work.

## 4. Deployment steps (Vercel, as the reference target)

1. `npm install` (pulls in `@supabase/ssr`, `zod`, `puppeteer-core`, `@sparticuz/chromium`, etc.)
2. Set all environment variables from section 1 in the Vercel project settings.
3. The PDF routes (`.../pdf/route.ts`) and the billing webhook/cron routes declare `export const runtime = "nodejs"` — Chromium and the service-role client cannot run on the Edge runtime; confirm your deployment doesn't override this.
4. Chromium via `@sparticuz/chromium` needs a higher function memory/timeout than Vercel's default — raise both for the PDF routes specifically.
5. Deploy. Then:
   - Test signup → email confirmation → login for real.
   - Test PDF generation for a real quote/invoice, Arabic and English.
   - Test a real Moyasar checkout in test mode, confirm the webhook fires and the plan updates.
   - Trigger the renewal cron route manually once to confirm it runs without error (it will report `skipped_no_token` for any subscription without a saved token, which is expected until item 4 above is resolved).

## 5. Production security checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is not set as a `NEXT_PUBLIC_` variable anywhere
- [ ] `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY` are all server-only env vars, not exposed to the client bundle
- [ ] The webhook endpoint is served over HTTPS only (required — Moyasar's verification scheme sends the secret in the body, not a cryptographic signature, so transport security is what actually protects it)
- [ ] The renewal cron endpoint's `CRON_SECRET` is a long random value, not guessable
- [ ] RLS is confirmed enabled on all 15 tables (see section 2, step 3)
- [ ] A second real test-user account cannot see/edit/delete the first account's clients, quotes, invoices, or share links
- [ ] Revoking a public share link actually stops the old URL from working
