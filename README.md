# Sanad — Phase 2: Auth + Next.js Scaffold

## What was built
- Next.js 14 App Router project wired to Supabase Auth via `@supabase/ssr`
- Signup, login, logout, password-reset request, password-update pages — each with real loading/error/success states, no mocked responses
- `middleware.ts` — refreshes the session on every request and enforces route protection server-side (`/dashboard/*` redirects to `/login` if there's no session; auth pages redirect signed-in users to `/dashboard`)
- `/auth/callback` route — exchanges the code from the confirmation/reset email for a real session, server-side
- Dashboard is a Server Component that queries `business_profiles` directly (RLS-scoped) and renders a real empty state for new users, not fake numbers
- RTL/LTR foundation: `<html dir>` is set server-side from a locale cookie (defaults to `ar`); full language switcher lands in Phase 12
- Zero secrets in client code: the service-role key isn't referenced anywhere in `app/` or any `"use client"` file

## What was actually tested (and what wasn't)
This sandbox has **no network access**, so I could not run `npm install`, start a real Supabase project, or execute the sign-up → confirm → login → reset flow end-to-end against a live backend. Being direct about that rather than claiming it's verified:

**Done:**
- Full static type/syntax check of every file with `tsc` (loose config, since packages aren't installed here). Result: **zero real errors** — the only errors reported were "cannot find module '@supabase/ssr'/'next'" and "cannot find React namespace," which are expected without `npm install` and are not logic bugs.
- Manual trace of every flow against the Supabase Auth API contract (signUp → emailRedirectTo → callback → session cookie; resetPasswordForEmail → callback → recovery session → updateUser).
- Confirmed no `SUPABASE_SERVICE_ROLE_KEY` reference exists outside `.env.example`.

**NOT tested (needs your Supabase project + `npm install`, which I can't do here):**
- Actual signup → email confirmation → login round trip
- Actual password reset email round trip
- Session persistence across a real browser refresh
- Middleware redirect behavior against a live deployment
- RLS behavior under a second real user account (cross-user access attempt)

**Status: NOT READY** until you run the steps below and I (or you) verify those flows against a live project. I will not say "tested" for anything beyond the static check above.

## How to run this locally
1. `npm install`
2. Create a Supabase project at supabase.com
3. Run `supabase/migrations/0001_init.sql` against it (SQL Editor, or `supabase db push` if using the CLI)
4. Copy `.env.example` to `.env.local` and fill in your project's URL + anon key (Project Settings → API)
5. In Supabase Auth settings, add `http://localhost:3000/auth/callback` to Redirect URLs
6. `npm run dev`, then test signup at `http://localhost:3000/signup`

## Still needs external configuration
- A real Supabase project (URL + anon key + service role key)
- Supabase Auth email templates pointed at your domain once deployed
- `NEXT_PUBLIC_SITE_URL` set to your real domain in production

---

## Phase 3 — Clients module

### What was built
- Full CRUD: create, edit, delete, list, search, detail view
- Search is server-rendered (`?q=` in the URL, debounced client-side input) — shareable/bookmarkable, not a client-only filter
- Document history on the client detail page queries the real `quotes`/`invoices` tables from Phase 1 — genuinely empty today (no quote/invoice UI exists yet), which is a correct empty state, not a stand-in
- "Create quote" / "Create invoice" buttons link to `/dashboard/quotes/new` and `/dashboard/invoices/new` with `?clientId=` — those routes are built in Phase 4/5
- Loading state via Next's `loading.tsx` skeleton; not-found state via `not-found.tsx`; every mutation has its own error and pending state

### User isolation — how it's enforced (defense in depth, two independent layers)
1. **Server Actions never accept a `user_id` from the client.** Every action (`createClientRecord`, `updateClientRecord`, `deleteClientRecord`) calls `supabase.auth.getUser()` itself against the session cookie and uses that id. A tampered form field can't forge identity.
2. **Every write also explicitly filters `.eq("user_id", user.id")`**, and **RLS enforces the same rule again at the database level** independent of application code. If the app-layer check were ever removed by mistake, RLS alone still blocks cross-user access.
3. Update/delete return "not found" (never a different error) whether the row doesn't exist or belongs to another user — so a bad actor probing IDs can't distinguish the two cases.

### What was tested vs. not
**Done (static, in this sandbox):**
- Full `tsc` pass across every file — found and fixed 2 real bugs (duplicate `email` keys in the i18n dictionary that silently overwrote values; a return-type gap around `redirect()` in both write actions) plus one loose FormData type
- Manual trace of the RLS story above against the Phase 1 migration's actual policies

**NOT tested (needs a live Supabase project):**
- An actual second user account confirming it cannot see/edit/delete User A's clients
- Real create → search → edit → delete round trip in a browser
- Debounced search against real data volume

**Status: NOT READY** until run against a live project — same gap as Phase 2, for the same reason (no network in this sandbox).

---

## Phase 4 — Quotes

### What was built
- Atomic write functions in `supabase/migrations/0002_quote_invoice_functions.sql`: `create_quote_with_items`, `update_quote_with_items`, `set_quote_status`, `duplicate_quote`, `convert_quote_to_invoice` — all `security definer`, so a quote and its line items are written all-or-nothing and the document-number sequence increments safely under concurrency (same pattern as Phase 1's `next_document_number`)
- Because `security definer` bypasses RLS inside the function body, **every function re-checks ownership explicitly** for any row it didn't derive from `auth.uid()` itself (`client_id`, `product_id`, the target `quote_id`) — this is the exact class of bug security-definer functions are notorious for, and it's checked, not assumed
- Status lifecycle is a real state machine, not a free-form field: `set_quote_status` only allows draft→sent and sent→{accepted, rejected, expired}; anything else is rejected server-side
- Editing is locked to `draft` status — both in the RPC (authoritative) and in the edit page UI (so the person gets an explanation, not a raw error)
- Full UI: list, new, detail (status actions, duplicate, convert-to-invoice), edit, not-found — all real Supabase queries, no mock data
- Removed the "Create invoice" link from the client detail page since Phase 5 didn't exist yet at that point — no links to unbuilt features

### Static check
`tsc` across every file: clean except the same `@types/react`-not-installed noise from Phases 2–3 (expected without `npm install`, not a real defect). Two real bugs were found and fixed this phase: a `redirect()`/return-type gap in 4 places in `quotes/actions.ts` (cosmetic to TypeScript — `redirect()` throws at runtime so it was never reachable — but now type-correct too).

### What was NOT tested (needs a live Supabase project)
- Whether the RPCs actually execute correctly against real Postgres (plpgsql syntax was written carefully but never run — this sandbox has no database to run it against)
- Concurrent quote creation actually producing sequential, non-colliding document numbers
- The full draft → sent → accepted → convert-to-invoice flow end to end
- A second user account actually being blocked from someone else's quote via RLS + the ownership checks inside the RPCs

**Status: NOT READY** — same reason as every prior phase: nothing has touched a live database yet.

---

## Phase 5 — Invoices

### What was built
- Atomic write functions in `supabase/migrations/0003_invoice_functions.sql`: `create_invoice_with_items`, `update_invoice_with_items` (draft-only), `set_invoice_status`, `delete_draft_invoice`, `duplicate_invoice` — same `security definer` + explicit ownership re-check pattern as Phase 4's quote functions
- Payment-status lifecycle is a real state machine: draft→{sent, cancelled}; sent→{paid, overdue, cancelled}; overdue→{paid, cancelled}; paid and cancelled are terminal. Anything outside that graph is rejected in the database, not just hidden in the UI.
- **Idempotent quote→invoice conversion**, which is the one piece that specifically needed a fix this phase (see below)
- Deleting is only allowed for drafts (nothing has been sent yet); anything past that must be *cancelled* instead, which keeps the record and its document number rather than erasing history
- Full UI: list (search across document number + client name), new, detail (status actions, duplicate, delete-draft, quote-origin banner with a link back to the source quote), edit (draft-only, same lock pattern as quotes), not-found, loading skeleton
- Reused `QuoteForm` for invoices rather than duplicating it — same header/line-item shape, just a different label ("Due date" vs "Expiry date") and a different Server Action bound in. This is why Phase 1–4 code wasn't touched: the shared form was designed generically from the start.
- Re-added the "Create invoice" link on the client detail page now that the route actually exists (it was deliberately removed in Phase 4 to avoid linking to something unbuilt)

### Idempotent conversion — what changed and why
Phase 4's `convert_quote_to_invoice` was already *safe* against duplicates (it raised an exception if the quote had already been converted), but not truly *idempotent* — a client retrying after a dropped network response following an actually-successful first attempt would see an error instead of the same result. This phase's version:
1. Takes `SELECT ... FOR UPDATE` on the quote row first, so two concurrent conversion requests for the same quote can't both pass the "not yet converted" check before either commits
2. If the quote is already converted, **returns the existing invoice id** instead of erroring — same request, same result, no duplicate either way, which is what idempotent actually means

### Static check
Full `tsc` pass across every file in the project (auth, clients, quotes, invoices): clean, only the expected `@types/react`-not-installed noise (same as every prior phase — not a real defect, disappears after `npm install`). No new real errors were introduced by this phase.

### What was checked in code (manual trace, not live execution)
- Every button in the invoice detail/list pages traced to a real Server Action to a real RPC — no dead buttons, no placeholder handlers
- Confirmed `set_invoice_status`'s allowed UI transitions match the database's transition graph exactly (UI never offers a transition the RPC would reject)
- Confirmed RLS was already enabled on `invoices`/`invoice_items` from Phase 1's migration — this phase didn't need to touch that
- Confirmed no server-only value (service role key, user_id) is referenced in any `"use client"` file

### What was NOT tested (needs a live Supabase project)
- Whether the plpgsql in `0003_invoice_functions.sql` actually runs correctly against real Postgres — written carefully, never executed
- The actual idempotency of `convert_quote_to_invoice` under real concurrent requests (the row lock is correct on paper; it hasn't been fired at a real database from two connections at once)
- The full create → sent → paid lifecycle and duplicate/delete flows end to end in a browser
- Search behavior against a realistic number of invoices
- RLS blocking a second real user from another user's invoices

**Status: NOT READY** — same limitation as every phase so far: this sandbox has no network access, so nothing here has run against an actual Supabase project. Everything is written to the same standard as Phases 1–4 and passes every check available without one.

---

## Phase 6 — PDF Generation + Document Sharing

### 1. What was built
- **PDF generation** for both quotes and invoices, in Arabic (RTL) and English (LTR), using a real browser rendering engine (Chromium via Puppeteer) rather than a font-layout PDF library — chosen specifically because Arabic glyph shaping/joining and bidi reordering are exactly the kind of thing font-layout PDF libraries (react-pdf, pdf-lib manual layout) get wrong, while a real browser gets right by construction.
- **One shared HTML template** (`buildDocumentHtml`) feeds three surfaces: the authenticated PDF download, the authenticated print view, and the public share page — so there's a single source of truth for what a document looks like, not three implementations to keep in sync.
- **Public share links**: random 32-byte hex tokens (not the document's internal uuid), owner can create/copy/revoke from the document detail page, a dedicated public page (`/share/[token]`) with no authentication, and a token-gated public PDF route.
- **Sharing actions** wired into both quote and invoice detail pages: Download PDF, Print, copy public link, WhatsApp (`wa.me` deep link), Email (`mailto:` link) — all real, working browser mechanisms; none of them pretend to be an API integration that isn't configured (see section 9).

### 2. Files/components added
- `supabase/migrations/0004_share_links.sql` — `share_tokens` table + RLS + `create_share_link` / `revoke_share_link` / `get_public_document` RPCs, with explicit grants (not relying on Postgres's default-executable-by-PUBLIC behavior)
- `lib/pdf/types.ts`, `lib/pdf/document-template.ts` — the shared template
- `lib/pdf/fetch-owned-document.ts` — owner-authenticated data assembly (RLS + explicit `user_id` filter)
- `lib/pdf/fetch-public-document.ts` — public data assembly, **only** via the token RPC, never touching `quotes`/`invoices` tables directly
- `lib/pdf/render-pdf.ts` — Chromium-based HTML→PDF rendering
- `app/dashboard/quotes/[id]/pdf/route.ts`, `.../print/route.ts` and the matching invoice routes
- `app/share/[token]/page.tsx`, `app/share/[token]/pdf/route.ts` — the public surface
- `components/ShareDialog.tsx`, `components/ShareDocumentViewer.tsx`
- `app/dashboard/share-actions.ts`

### 3. PDF architecture
Route Handler → `fetchOwned*ForDocument()` (RLS-scoped query) → `buildDocumentHtml()` → `renderHtmlToPdf()` (Chromium) → PDF bytes streamed back with `Content-Disposition: attachment`. The route runs on the Node.js runtime (`export const runtime = "nodejs"`), not Edge, because spawning a browser process isn't possible on Edge. In serverless (Vercel/Lambda), `renderHtmlToPdf` uses `@sparticuz/chromium` + `puppeteer-core`; locally it falls back to the full `puppeteer` package. **Neither package is installed in this sandbox** (no network to `npm install` them) — see section 10 for exactly what that means.

### 4. Sharing architecture
- **Download**: client fetches the PDF route as a blob and triggers a save — chosen over a bare `<a href>` so a server-side rendering failure shows an error message instead of silently downloading a broken file.
- **Print**: a dedicated `/print` route returns the same template as raw HTML; the dashboard button opens it in a new tab (browser's native print dialog); the public share page prints via an in-page iframe.
- **Public link**: token created/fetched via `create_share_link` RPC (idempotent — repeat calls return the same active token rather than piling up new ones), copied via the Clipboard API with a graceful no-op if it's unavailable, revoked via `revoke_share_link`.
- **WhatsApp/Email**: `wa.me` and `mailto:` links pre-filled with the share URL. These open the visitor's own WhatsApp/email client — **there is no WhatsApp Business API or transactional email provider integrated**, and nothing in the UI claims otherwise.

### 5. Security model
- A share link is a 32-byte random token in its own table — the public page and public PDF route take **only** the token, never the quote/invoice's internal id, so nothing about the dashboard's URL/id structure leaks.
- `get_public_document(token)` is the **only** function permitted to read a quote/invoice without an owning session, and it's scoped to exactly the one document a valid, non-revoked token points to. `revoke`/`create` are restricted to `authenticated` via explicit `grant`/`revoke` statements — not left to Postgres defaults.
- A revoked or unknown token returns the identical "invalid" response either way (can't distinguish "never existed" from "existed and was revoked").
- The public page lives outside `/dashboard` and outside `middleware.ts`'s protected-route list, and the public PDF route needs no session cookie — verified by inspection that neither reads `cookies()` for authorization.
- No secret (service-role key, etc.) is referenced in any of this phase's code — the public path works entirely through the anon key + the security-definer RPC, the same pattern as every other cross-boundary read in this codebase.

### 6. What was tested (and this is the one phase where real execution was possible)
Unlike every previous phase, part of this one *could* be genuinely executed in this sandbox, because Chromium-based rendering doesn't need Supabase — it needs a browser, and Playwright's Chromium is already installed here for Claude's own tooling. So this was actually done, not just reviewed:
- Loaded the **actual, unmodified** `document-template.ts` (via Node's native TypeScript stripping) with realistic Arabic and English sample data
- Rendered both to real PDF files with a real Chromium instance and visually inspected the output
- **Found a real bug this way**: Arabic-context phone numbers rendered with the `+` sign on the wrong side (`966501234567+` instead of `+966501234567`) due to bidi reordering — fixed by wrapping phone/email/tax-number fields in `dir="ltr"` spans, then **re-rendered and visually confirmed the fix**
- Confirmed with `pdftotext` that the generated PDF contains real, extractable, correctly-shaped Arabic text — not a rasterized image standing in for a document
- Confirmed the English/LTR layout renders correctly with no changes needed

This is real verification of the template and rendering logic — the actual "does Arabic look right in a PDF" question — done with the genuine code, not a mock.

### 7. Static-check result
Full `tsc` pass across the entire project (all six phases): clean, only the same `@types/react`/`@types/node`-not-installed noise seen in every prior phase (expected without `npm install`, not a real defect). No new real errors from this phase.

### 8. Known issues
- The Arabic font (Tajawal) and English font (Inter) are loaded from Google Fonts at render time. This worked in the sandbox test (network available there), but a production serverless function should self-host the font files instead of depending on a live fetch to `fonts.googleapis.com` during PDF generation — a slow or failed font fetch would degrade or break rendering in a way that's invisible until it happens under load. Documented in `document-template.ts`, not yet fixed.
- `renderHtmlToPdf`'s actual two code paths (serverless via `@sparticuz/chromium`, and the Next.js Route Handler wiring around it) have **not** been executed — only the underlying template + a directly-invoked Chromium instance have been. The Route Handlers themselves need a real Next.js server to verify.

### 9. External services/credentials required
- **None for what's built.** PDF generation needs no external API (self-hosted Chromium). WhatsApp/Email sharing use `wa.me` and `mailto:` — universal link schemes, not APIs, and need no credentials.
- **If** real automated sending is wanted later (e.g. actually emailing a client from Sanad's own address, or a WhatsApp Business API integration) that is a materially different, larger feature requiring a transactional email provider (Resend/SendGrid/Postmark) or Meta's WhatsApp Business Platform, and was intentionally **not** built here — this instruction explicitly said not to pretend it exists, so it doesn't.
- Serverless PDF rendering does need `npm install puppeteer-core @sparticuz/chromium` at deploy time, and on Vercel specifically needs the function's memory/timeout raised (Chromium is heavy) — noted in code comments.

### 10. What still requires live verification
- Running an actual `next dev`/`next build` with `puppeteer-core`/`@sparticuz/chromium` installed and confirming the Route Handlers produce a PDF end-to-end through Next.js (not just through a standalone script, which is what was tested)
- The full migration (`0004_share_links.sql`) executing correctly against real Postgres, including the `gen_random_bytes` token generation and the explicit grants
- A real second (anonymous) browser session hitting `/share/[token]` and the public PDF route with no cookies at all
- Revoking a link and confirming the old URL actually stops working
- Font loading behavior in an actual serverless cold start (not this sandbox, which has different network characteristics than a production Lambda/Vercel function)

### 11. Current status
**NOT READY.** This phase has more genuine verification behind it than any previous one — the template and Arabic rendering were actually executed and a real bug was found and fixed — but the Next.js Route Handlers, the database migration, and the public-access path have not been run against a live Supabase project or a real Next.js server. That gap is the same one every phase has had, for the same reason (no network in this sandbox for Supabase/npm), and it isn't closed until you run this against your own project.

---

## Phase 7 — AI Features

### What was built
Four contextual AI features, each a thin, reviewable slice of the existing workflow — not a chatbot:
1. **AI Quote Assistant** — describe a job in plain language, get back a structured draft (line items, quantities, optional suggested prices, notes, terms) that the user reviews, edits per-line (including deselecting items), and explicitly applies to the quote/invoice form. Nothing is saved until the user presses the form's own Save button, which goes through the same Phase 4/5 validation and calculation as manual entry.
2. **Professional Description** — a small "✨" button next to any line-item description turns rough text into a professional sentence; shown as a dismissible suggestion, never auto-applied.
3. **Client Message Assistant** — from the Share panel on a quote/invoice, generate a short WhatsApp/email-ready message (send quote, follow up, send invoice, payment reminder) using the document's real, server-fetched data; the generated text is editable before it's used in the existing `wa.me`/`mailto` links from Phase 6.
4. **Business Terms Assistant** — suggests a short boilerplate clause (payment/quote/delivery terms or service notes) next to the terms field, explicitly framed as a non-legal starting point.

### AI architecture
`Route Handler → runStructuredAIFeature() → AIProvider.generateText() → JSON parse → zod schema validation → typed result`
- **Provider abstraction** (`lib/ai/types.ts`, `lib/ai/get-provider.ts`, `lib/ai/providers/anthropic.ts`): every feature calls the same `AIProvider` interface; only one file in the whole codebase knows Anthropic's specific request/response shape. Switching providers later means adding one class and one `case` in `get-provider.ts` — no feature code changes.
- **Structured output, not free text**: every feature has a zod schema (`lib/ai/schemas.ts`). The provider's raw text is parsed as JSON and validated against that schema server-side; a response that doesn't match is treated as a failure (`AIMalformedResponseError`), never passed through to the client "as is."
- **Four Route Handlers** under `app/api/ai/*`, one per feature. The frontend never talks to Anthropic directly — it only ever calls these.

### Security model
- **API keys are server-side only**: `ANTHROPIC_API_KEY` is read in exactly one file (`lib/ai/providers/anthropic.ts`) — confirmed by grep to appear nowhere else in the codebase and in no `"use client"` file.
- **Every AI endpoint requires authentication**: `runStructuredAIFeature` calls `supabase.auth.getUser()` and throws before reserving usage or calling the provider if there's no session; `client-message` and `business-terms` additionally check auth before touching any business data; `reserve_ai_usage`/`refund_ai_usage` re-check `auth.uid()` inside the database function as a second, independent layer.
- **Data cannot cross accounts**: the Client Message feature does not accept a client name/amount from the request body at all — it re-fetches the document server-side through the same owner-scoped, RLS-backed query the Phase 6 PDF routes use. The Business Terms feature reads `business_type` filtered by the caller's own `user_id`. No AI route accepts another user's data as input.
- **Usage cannot be manipulated from the browser**: usage counting happens only inside `reserve_ai_usage`/`refund_ai_usage`, security-definer Postgres functions keyed off `auth.uid()` from the verified session — calling an AI route directly still goes through the identical reservation check.
- **Prompt-injection containment**: the system prompt is always a hardcoded string; user input only ever appears in the user-role prompt. No AI route can execute a database write — the only DB writes in AI-related code are the fixed reserve/refund calls, unaffected by AI output content.
- **AI-generated content is sanitized before rendering**: confirmed by grep that `dangerouslySetInnerHTML` is not used anywhere in the codebase; AI text renders through normal auto-escaping JSX, and if applied to a quote's notes/terms, passes through the same `escapeHtml()` used for all document text in the Phase 6 PDF template.

### Usage/rate-limit model
`reserve_ai_usage()` atomically checks the caller's plan against a provisional monthly limit (free=10/pro=200/business=1000 — a placeholder, not a final pricing decision) and increments usage inside one row-locked transaction. `refund_ai_usage()` decrements by 1 if the call fails or the response is malformed after reservation — **a failed request costs the user nothing, and a retry after a real failure doesn't double-count.**

### Privacy/data handling
- Quote Assistant: only the free-text job description + locale.
- Improve Description: only the rough line-item text + locale.
- Client Message: client **name only** (not email/phone/address, even though present in the fetched data) + document number, total, currency, relevant date.
- Business Terms: `business_type` only — not business name, address, or tax number.
No passwords, tokens, internal ids, or payment info are ever sent to the AI provider.

### Tests actually executed (real execution against the unmodified source)
- `prompts.ts` — 13 assertions, all passed: Arabic/English system prompts actually differ and target the right language; every feature enforces the JSON-only contract; the quote-draft prompt correctly instructs "suggest null, don't invent a price" and "prices are for review, not final"; the business-terms prompt disclaims being legal advice; the client-message prompt correctly includes only the fields it's given.
- `extractJson()` (the malformed-response guard) — 5 assertions, all passed: correctly unwraps a fenced JSON block, correctly parses clean JSON, and correctly **fails safely** (rather than silently accepting garbage) on truncated JSON, an empty response, and commentary-wrapped JSON.
- Full-project `tsc` static check — clean, only the expected "package not installed"/`@types/node` noise from every prior phase; no new logic errors.

Everything requiring a real Anthropic API key, a live Supabase project, or `npm install` (for `zod`, `next/server`, etc.) was **not** executed.

### Known issues
- `extractJson()` only strips a fenced JSON block, not JSON embedded in surrounding prose — confirmed this fails safely (refunded, clean error) rather than crashing, but means a model that adds commentary despite instructions will fail the request rather than succeed. Reasonable default; a more permissive fallback could be added if real-world testing shows this happening often.
- The 10/200/1000 monthly limits are placeholders proving the mechanism exists, not a pricing decision.
- No UI yet surfaces remaining AI quota for the month.

### Required API keys
`ANTHROPIC_API_KEY` (required — without it every AI route returns a clean `provider_not_configured` 503, not a crash). `AI_PROVIDER`/`ANTHROPIC_MODEL` optional, default to `anthropic`/`claude-sonnet-4-6`.

### Required Supabase configuration
Migration `0005_ai_usage.sql` must be applied (usage-accounting functions + plan-limit lookup) — nothing else changes this phase.

### What still requires live verification
- An actual Anthropic API call succeeding end-to-end through a real Route Handler
- `reserve_ai_usage`/`refund_ai_usage` running against real Postgres under real concurrent requests
- A real over-quota user actually being blocked before the provider is called
- The full UI flow (generate → review → apply → save) in a real browser
- Whether the AI model reliably follows the JSON-only/schema instructions in practice — the tests here verify the prompts ask for this correctly and that the code handles non-compliance safely, not that the model actually complies

### Current status
**NOT READY.** The provider abstraction, structured-output validation, usage accounting, and security boundaries are implemented and reviewed carefully, and two real test scripts against the actual source code passed. But no AI feature has been exercised against a real Anthropic API key or a live Supabase project — the one gap every phase has had, and the one that matters most here, since only a real run can confirm the model's actual output quality and schema compliance in practice.

---

## Phase 8 — Billing & Subscriptions

### What was built
- **Plan configuration**: FREE/PRO/BUSINESS with a single enforced source of truth — the database's `plan_limits(plan)` function (price, currency, billing interval, AI/quote/invoice/client limits) — plus `lib/billing/plans.ts` for display-only copy (names, feature bullet points) that never affects enforcement.
- **Server-authoritative subscription state**: `subscriptions` (from Phase 1) plus this phase's `plan_limits`, `payment_webhook_events`, `checkout_sessions` tables, and the enum gains `expired` alongside the existing `active`/`trialing`/`past_due`/`canceled`.
- **Real checkout architecture**: `POST /api/billing/checkout` creates a Moyasar Invoice (hosted payment page) and records a `checkout_sessions` row — never touches `subscriptions`.
- **Payment provider abstraction**: `PaymentProvider` interface (`lib/billing/types.ts`), one Moyasar implementation, a factory keyed off `PAYMENT_PROVIDER` — same pattern as Phase 7's AI provider abstraction.
- **Webhook endpoint** (`POST /api/billing/webhook`): reads the raw body, verifies the HMAC-SHA256 signature, and only then processes the event through one atomic Postgres function.
- **Idempotent, atomic webhook processing**: `process_payment_webhook_event()` inserts the `(provider, provider_event_id)` row and applies the subscription sync in the *same transaction* — a crash between "recorded" and "applied" can't happen, so a retry after a real failure correctly reprocesses instead of being wrongly treated as a duplicate.
- **Document/client/AI limit enforcement, all server-side**: quote/invoice creation (Phase 4/5 RPCs) now check `plan_limits` before inserting; a `BEFORE INSERT` trigger enforces the client limit; `ai_monthly_limit_for_plan` (Phase 7) now reads from the same `plan_limits` table instead of its own hardcoded numbers.
- **Cancellation/reactivation**: two narrow RPCs that only ever touch `cancel_at_period_end` — never `plan` or `status` — so "access continues until period end" is a structural property, not a UI promise.
- **Paywall UI**: `/dashboard/billing` shows current plan, live usage bars against real limits, and plan comparison cards; hitting a quota inside quote/invoice/client creation shows `PaywallNotice` (explains the limit, links to upgrade) instead of a raw error.
- **Billing portal**: Moyasar has no native customer billing portal (unlike Stripe) — the in-app `/dashboard/billing` page is the portal equivalent, with real, working upgrade/cancel/reactivate actions, not a placeholder.

### Payment provider: Moyasar, and why
Chosen for the product's actual target market (Saudi/GCC small businesses) — Moyasar supports mada, STC Pay, and Apple Pay alongside cards, which materially affects conversion for this audience in a way a GCC-agnostic provider wouldn't. The trade-off, stated plainly: Moyasar is a payment gateway, not a subscription-billing platform like Stripe/Paddle — it has no native recurring-subscription object. This architecture uses Moyasar for the charge and this application's own `checkout_sessions`/webhook flow for subscription state; **a recurring monthly re-charge job (charging a saved card token on renewal) is designed for but not built this phase** — see "Known issues."

### Security (verified by inspection, not just described)
- Grepped the entire codebase: `SUPABASE_SERVICE_ROLE_KEY` and `createServiceRoleClient` are referenced in exactly `lib/supabase/service-role.ts` (its own definition) and `app/api/billing/webhook/route.ts` — nowhere else.
- Grepped for every `.from("subscriptions")` call in the app: the only one outside the webhook/RPC layer is a read-only `select` in `lib/billing/entitlements.ts`. There is no code path anywhere that lets a client write `plan` or `status`.
- The two user-facing RPCs (`cancel_my_subscription`, `reactivate_my_subscription`) only ever set `cancel_at_period_end` — confirmed by reading their bodies, they have no code path that touches `plan` or `status`.
- Webhook route reads `request.text()` (raw bytes) before any parsing — confirmed in code — because verifying a re-serialized/parsed body would break signature checks in ways that look like a broken secret instead of what's actually wrong.
- Signature comparison uses `crypto.timingSafeEqual`, not `===` — prevents a byte-by-byte timing side-channel.
- `dangerouslySetInnerHTML` remains unused anywhere in the codebase (re-confirmed by grep this phase).

### Subscription lifecycle
`free` (default) → `trialing`/`active` (webhook-confirmed payment) → `past_due` (a renewal charge fails, not yet built — see known issues) → `canceled` (user-initiated, via `cancel_at_period_end` reaching the period end) or `expired` (a failed renewal that's never recovered). Cancellation is *always* "stays active until period end, then Free" — never an immediate downgrade — because the cancellation RPC only sets a flag; the actual plan change happens exclusively through the same webhook-driven sync path as an upgrade.

### Entitlements & usage enforcement
`lib/billing/entitlements.ts` reads live counts (clients, this month's quotes/invoices, this month's AI usage) through RLS as the logged-in user, for **display only**. The actual enforcement is independent: `create_quote_with_items`/`create_invoice_with_items` check `plan_limits` before writing; the client-limit trigger fires on every insert regardless of which code path attempts it; `reserve_ai_usage` (Phase 7) now reads the same central limits table. None of these can be bypassed by calling an API route directly — the checks live in the database functions themselves, not in the Next.js layer.

### Cancellation & data preservation
Cancelling never deletes anything — it's a one-column flag flip. No code in this phase (or any prior phase) deletes quotes, invoices, or clients based on subscription state; account deletion remains a separate, not-yet-built feature (Phase 20 in the original plan) with its own explicit user action.

### Tests actually executed (real execution against the unmodified source)
- **`webhook-signature.test.mjs`** — 9 assertions, all passed, against the real `moyasar.ts`: valid signatures accepted; a tampered body rejected even with the original valid signature attached; wrong-secret signatures rejected; missing/empty signature headers rejected; a mismatched-length signature handled safely (no crash); event id/type extraction correct.
- **`idempotency-logic.test.mjs`** — 8 assertions, all passed: simulates the exact insert-first/catch-conflict control flow the SQL function implements; 10 rapid retries of the same event id produce exactly 1 "processed" + 9 "duplicate," with the underlying effect applied exactly once.
- **Plan-tampering/authorization review** — done by code inspection and grep (see "Security" above), not by running requests against a live server, since there is no live server in this sandbox.
- Full-project `tsc` static check — clean, only the same expected "package/@types/node not installed" noise from every prior phase; one new instance this phase (`crypto` needs `@types/node`, same category as `Buffer`/`process`), no new logic errors.

### Static-check result
Clean across all Phase 1–8 files. No real errors.

### Known issues
- **No recurring-renewal job is built.** The webhook activates a subscription for 30 days on a successful payment; nothing in this codebase automatically re-charges the saved card when that period ends. A real deployment needs a scheduled job (Vercel Cron / Supabase Scheduled Function) that finds subscriptions with `current_period_end` in the past and `cancel_at_period_end = false`, attempts a renewal charge via Moyasar's tokenized-card API, and relies on the same webhook path to confirm it. This is architected for (the `checkout_sessions`/webhook/idempotency plumbing is exactly what a renewal would reuse) but not implemented.
- **Moyasar's exact API shapes are unconfirmed.** The Invoice-creation request/response fields and the webhook signature encoding (assumed: HMAC-SHA256, raw body, hex digest, `x-moyasar-signature` header) are based on Moyasar's general documented patterns, not observed against a real account. This must be confirmed against `docs.moyasar.com` before going live — flagged directly in `moyasar.ts`.
- The client-quota trigger's count-then-check is not perfectly race-proof under extreme concurrency (documented in the migration) — an acceptable, explicit trade-off for a client list, never a financial-integrity concern.
- `past_due` status is defined in the schema and considered in `set_invoice_status`-style transition thinking, but nothing currently transitions a subscription into it (that would happen inside the not-yet-built renewal job).

### Required environment variables
`PAYMENT_PROVIDER` (default `moyasar`), `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET` — all server-only, none prefixed `NEXT_PUBLIC_`.

### External accounts/configuration still required
A real Moyasar merchant account, its live secret key and webhook secret, and the webhook URL (`/api/billing/webhook`) registered in Moyasar's dashboard. None of this exists in this sandbox.

### What still requires live verification
- Every line of `0006_billing.sql` actually running against real Postgres
- A real Moyasar checkout completing and its webhook actually reaching and being correctly verified by this app
- Real webhook replay (Moyasar or a manual duplicate POST) actually being deduplicated by the live database, not just the isolated logic test above
- A real over-quota user actually being blocked before a document/client is created
- The full upgrade → pay → webhook → plan-reflected-in-UI loop, end to end, in a browser
- The (unbuilt) renewal job, once written

### Current status
**NOT READY.** The plan/entitlement/enforcement architecture, the webhook security and idempotency design, and the cancellation/data-preservation guarantees are implemented and reviewed carefully, with real, passing tests on every part that could be exercised without a live database or payment account. No payment has been processed, no webhook has been received, and no subscription has changed state against a real system — that gap, consistent with every phase before it, is the one that matters most for a billing system specifically, and it is not closed.

---

## Phase 8 — Post-review fixes (Moyasar verified, past_due, race fix)

This section documents concrete corrections made after review, each grounded in Moyasar's official documentation (fetched and read directly, not assumed) or a real logic/concurrency fix.

### 1. Webhook mechanism corrected (real bug fixed)
The original implementation assumed HMAC-SHA256 over the raw body with an `x-moyasar-signature` header — a reasonable-looking guess, but wrong. Moyasar's actual documented mechanism (`docs.moyasar.com/api/other/webhooks/webhook-reference`): the webhook JSON body itself contains a `secret_token` field (the value you set when registering the webhook). Verification is now: parse the body, timing-safe-compare `body.secret_token` to the stored secret. No header involved. This is a materially different, correct implementation, not a tweak — the previous version would have rejected every real Moyasar webhook.

### 2. Event id / correlation corrected (real bug fixed)
The Webhook Object's own top-level `id` is the idempotency key — not `data.id` (the nested Payment's own id), which is what the code used before. Checkout correlation now uses the Payment object's documented `invoice_id` field against `checkout_sessions.provider_session_id`, replacing an incorrect `data.id` match.

### 3. Quota-exception naming mismatch fixed (real bug found and fixed)
The SQL functions raised `document_limit_exceeded`/`client_limit_exceeded`; the Server Actions checked for `document_quota_exceeded`/`client_quota_exceeded`. These never matched — the paywall UI would never have appeared; users would have seen a raw error instead. Renamed the SQL side to match.

### 4. Client-limit race condition fixed
Replaced the count-then-insert trigger with a locked per-user counter table (`user_counters`, `SELECT ... FOR UPDATE`) — a second concurrent client-creation transaction for the same user now genuinely blocks until the first commits, rather than both reading the same pre-insert count.

### 5. Document-limit race condition fixed (found during this review, not previously reported)
The quote/invoice quota check counted live rows with no locking — the same race class as the client limit. Fixed with a `pg_advisory_xact_lock` scoped to `(user_id, doc_type)`, held for the transaction, serializing concurrent creates for the same user without needing a separate counter table.

### 6. Recurring billing architecture implemented
- `lib/billing/renewal.ts` — a deterministic idempotency-key derivation (`sha256(user_id + billing_period)`, formatted as a v4-shaped UUID per Moyasar's documented `given_id` requirement) so a renewal retry can never double-charge.
- `app/api/billing/cron/renew-subscriptions/route.ts` — a scheduler-only endpoint (shared-secret header, `CRON_SECRET`) that finds due subscriptions, charges their saved token via `chargeToken` (a real `POST /v1/payments` with `source.type: "token"`), and records the outcome atomically via `process_renewal_webhook_event`.
- **Explicitly unresolved**: whether Moyasar's hosted Invoice checkout page (used for the initial subscription purchase) automatically saves a reusable card token. The guaranteed, documented way to get one is `source.save_card: true` on a direct Payment API call, which needs a custom card-entry form rather than the hosted Invoice redirect. The webhook route reads `data.source.token` defensively if present, and the renewal job explicitly skips (not guesses) any subscription with no token. **This is the one open architectural question that determines whether recurring billing works at all without a checkout-flow change**, and it needs a real Moyasar account/dashboard/support conversation to resolve, not more guessing.

### 7. past_due state machine implemented
`active → past_due` (a renewal charge doesn't succeed), `past_due → active` (a subsequent renewal succeeds), `past_due → expired` (3 failed attempts or 7 days in `past_due`, whichever first) — all three transitions live in service-role-only SQL functions (`mark_subscription_past_due`, `mark_subscription_renewed`, `expire_subscription`), never reachable from the browser. Cancellation still returns to Free with access preserved until period end, unrelated to this failure-driven path.

### 8. Duplicate-checkout-click protection added
The checkout route now reuses a still-pending checkout (same user, same plan, created within 30 minutes) instead of creating a new Moyasar Invoice on every click of "Upgrade."

### Tests actually executed this round (real execution against the corrected source)
- `webhook-signature.test.mjs` (original 9 assertions, still passing against the interface shape) superseded in spirit by a second real test file exercising the CORRECTED secret_token-in-body scheme: 7 assertions, all passing — correct secret accepted, wrong secret rejected, missing secret rejected, malformed JSON safely rejected (not a crash), and event id/type/invoice_id extraction all verified against the real documented payload shape.
- `renewal` idempotency-key determinism: 6 assertions, all passing — same user+period always derives the identical key; different users/periods derive different keys; the key is shaped as a valid UUID (required by Moyasar's `given_id`).
- **Whole-codebase quality gate** (grep-based, Part 14 of the audit): searched for TODO/FIXME/mock/fake/placeholder/hardcoded/`dangerouslySetInnerHTML`/leftover `console.*` across every file — every hit was a legitimate false positive (HTML `placeholder=` attributes, comments describing what the code correctly avoids); zero real issues found.
- **IDOR spot-check**: every one of the 10 dynamic `[id]` routes (clients/quotes/invoices × page/edit/pdf/print) confirmed to filter by `user_id` explicitly, not just rely on RLS.
- **RLS coverage cross-check**: all 15 tables created across every migration have a matching `enable row level security` statement — exact 1:1 match, no gaps.
- **Import integrity check**: a script scanned every `@/...` and relative import in every `.ts`/`.tsx` file and confirmed each resolves to a real file — zero broken imports anywhere in the codebase (this check exists specifically because `tsc`'s module-not-found errors are filtered as "expected" throughout this project's reports, which could otherwise hide a real typo'd path; this closes that gap independently).
- Full-project `tsc` static check: clean, same expected noise as every prior phase, zero new real errors.

### Current status of Phase 8 specifically
Every previously-identified issue has a real, implemented fix grounded in either official documentation (webhook mechanism, event correlation) or a concrete concurrency-safety pattern (both race conditions). What remains is exactly what remained before, for the same reason every phase has stated: nothing has executed against a live Moyasar account or a live Supabase project. Additionally, the token-capture question (item 6 above) is a genuinely open design question, not a coding gap — it needs a real account to resolve either way.
