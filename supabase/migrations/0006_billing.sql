-- ============================================================================
-- SANAD — Phase 8: Billing & Subscriptions schema
-- ============================================================================

-- 'expired' covers a subscription whose paid period ended without renewal
-- (distinct from 'cancelled', which is a deliberate user action) — added to
-- the enum Phase 1 already defined, rather than inventing a parallel status
-- column.
alter type public.subscription_status add value if not exists 'expired';

-- ----------------------------------------------------------------------------
-- Central, single-source-of-truth NUMERIC limits per plan. Pricing/naming/
-- feature-flag metadata lives in lib/billing/plans.ts (TypeScript, used for
-- display only); the numbers that are actually ENFORCED live here, in exactly
-- one place, so a limit can never drift between "what the UI says" and "what
-- the database actually allows." NULL means unlimited for that field.
-- ----------------------------------------------------------------------------
create or replace function public.plan_limits(p_plan public.subscription_plan)
returns jsonb
language sql
immutable
as $$
  select case p_plan
    when 'free' then jsonb_build_object(
      'price_cents', 0,
      'currency', 'SAR',
      'billing_interval', 'month',
      'ai_requests_per_month', 10,
      'quotes_per_month', 5,
      'invoices_per_month', 5,
      'max_clients', 10
    )
    when 'pro' then jsonb_build_object(
      'price_cents', 4900,
      'currency', 'SAR',
      'billing_interval', 'month',
      'ai_requests_per_month', 200,
      'quotes_per_month', 100,
      'invoices_per_month', 100,
      'max_clients', 200
    )
    when 'business' then jsonb_build_object(
      'price_cents', 14900,
      'currency', 'SAR',
      'billing_interval', 'month',
      'ai_requests_per_month', 1000,
      'quotes_per_month', null,
      'invoices_per_month', null,
      'max_clients', null
    )
    else jsonb_build_object('price_cents', 0, 'currency', 'SAR', 'billing_interval', 'month', 'ai_requests_per_month', 0, 'quotes_per_month', 0, 'invoices_per_month', 0, 'max_clients', 0)
  end;
$$;

-- Kept as a thin wrapper so Phase 7's reserve_ai_usage doesn't need to change
-- its call site — it now reads from the one central table of numbers instead
-- of carrying its own copy.
create or replace function public.ai_monthly_limit_for_plan(p_plan public.subscription_plan)
returns integer
language sql
immutable
as $$
  select (public.plan_limits(p_plan)->>'ai_requests_per_month')::integer;
$$;

revoke all on function public.plan_limits(public.subscription_plan) from public;
grant execute on function public.plan_limits(public.subscription_plan) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Webhook idempotency. The unique constraint on (provider, provider_event_id)
-- is the actual enforcement mechanism: the webhook route always tries to
-- INSERT the incoming event id first, and a unique-violation means "already
-- processed this exact event" — handled as a fast, safe no-op 200 response,
-- never as a reason to reprocess or double-apply the event's effects.
-- No RLS policies are defined here at all: this table has zero client access
-- of any kind. Only the service-role key (used exclusively inside the
-- webhook route, never in the browser) can read or write it.
-- ----------------------------------------------------------------------------
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb,
  unique (provider, provider_event_id)
);

alter table public.payment_webhook_events enable row level security;
-- Deliberately no policies: RLS enabled with zero policies means even an
-- authenticated user's request is denied by default. Only the service-role
-- key (which bypasses RLS entirely) can touch this table.

-- ----------------------------------------------------------------------------
-- Document limits: enforced INSIDE the same atomic functions that already
-- create quotes/invoices (Phase 4/5), by counting actual rows created this
-- calendar month rather than maintaining a separate counter column — a
-- counter can drift if a request fails after incrementing it; a live count
-- of real rows can't drift, because a failed request never created a row in
-- the first place. Since a single RPC call runs in one transaction, there is
-- no separate "refund" step needed here (unlike Phase 7's AI usage, which
-- spans two separate network calls to an external provider) — if anything
-- later in the function raises an exception, Postgres rolls back the entire
-- call, including any row this same call had inserted.
-- ----------------------------------------------------------------------------
create or replace function public.check_document_limit(p_user_id uuid, p_doc_type text)
returns void
language plpgsql
as $$
declare
  v_plan public.subscription_plan;
  v_limit integer;
  v_count integer;
begin
  -- Advisory lock scoped to this user+document-type, held for the rest of
  -- this transaction (pg_advisory_XACT_lock auto-releases at commit/
  -- rollback — no separate unlock call needed, and it can't be leaked by a
  -- crashed connection). This serializes concurrent create_quote_with_items/
  -- create_invoice_with_items calls for the SAME user so two simultaneous
  -- requests can't both read the same "count so far" before either commits
  -- — the same class of race the client-limit counter table fixes, solved
  -- here with a lock instead of a dedicated counter table since the
  -- underlying count is a real aggregate over existing rows, not something
  -- worth maintaining a running total for.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_doc_type));

  select plan into v_plan from public.subscriptions where user_id = p_user_id;
  if v_plan is null then
    v_plan := 'free';
  end if;

  if p_doc_type = 'quote' then
    v_limit := (public.plan_limits(v_plan)->>'quotes_per_month')::integer;
    select count(*) into v_count from public.quotes
      where user_id = p_user_id and date_trunc('month', created_at) = date_trunc('month', now());
  else
    v_limit := (public.plan_limits(v_plan)->>'invoices_per_month')::integer;
    select count(*) into v_count from public.invoices
      where user_id = p_user_id and date_trunc('month', created_at) = date_trunc('month', now());
  end if;

  if v_limit is not null and v_count >= v_limit then
    raise exception 'document_quota_exceeded';
  end if;
end;
$$;

-- Client limit: a trigger rather than changing Phase 3's Server Action, so
-- that code is not touched unnecessarily (per this phase's instruction) —
-- the limit is enforced at the one place that can never be bypassed no
-- matter what code path performs the insert.
create or replace function public.enforce_client_limit()
returns trigger
language plpgsql
as $$
declare
  v_plan public.subscription_plan;
  v_limit integer;
  v_count integer;
begin
  select plan into v_plan from public.subscriptions where user_id = new.user_id;
  if v_plan is null then
    v_plan := 'free';
  end if;

  v_limit := (public.plan_limits(v_plan)->>'max_clients')::integer;
  if v_limit is null then
    return new; -- unlimited on this plan
  end if;

  select count(*) into v_count from public.clients where user_id = new.user_id;
  if v_count >= v_limit then
    raise exception 'client_quota_exceeded';
  end if;

  return new;
end;
$$;

create trigger enforce_client_limit_trigger
  before insert on public.clients
  for each row execute function public.enforce_client_limit();

-- ----------------------------------------------------------------------------
-- Wire the document-limit check into the existing atomic create functions.
-- Only the top of each function changes (one added check); everything below
-- is identical to the Phase 4/5 versions — no unrelated logic touched.
-- ----------------------------------------------------------------------------
create or replace function public.create_quote_with_items(
  p_client_id uuid,
  p_issue_date date,
  p_expiry_date date,
  p_currency text,
  p_notes text,
  p_terms text,
  p_items jsonb
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_doc_number text;
  v_quote_id uuid;
  v_subtotal bigint := 0;
  v_tax bigint := 0;
  v_discount bigint := 0;
  v_item jsonb;
  v_line_gross bigint;
  v_line_total bigint;
  v_product_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_document_limit(v_user_id, 'quote');

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and user_id = v_user_id
  ) then
    raise exception 'invalid client';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a quote must have at least one line item';
  end if;

  v_doc_number := public.next_document_number(v_user_id, 'quote');

  insert into public.quotes (user_id, client_id, document_number, status, issue_date, expiry_date, currency, notes, terms)
  values (v_user_id, p_client_id, v_doc_number, 'draft', p_issue_date, p_expiry_date, coalesce(p_currency, 'SAR'), p_notes, p_terms)
  returning id into v_quote_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    if v_product_id is not null and not exists (
      select 1 from public.products where id = v_product_id and user_id = v_user_id
    ) then
      raise exception 'invalid product reference';
    end if;

    v_line_gross := round((v_item->>'quantity')::numeric * (v_item->>'unit_price_cents')::numeric)::bigint;
    v_line_total := v_line_gross - coalesce((v_item->>'discount_cents')::bigint, 0);

    v_subtotal := v_subtotal + v_line_gross;
    v_discount := v_discount + coalesce((v_item->>'discount_cents')::bigint, 0);
    v_tax := v_tax + round(v_line_total * coalesce((v_item->>'tax_rate')::numeric, 0) / 100)::bigint;

    insert into public.quote_items
      (quote_id, user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order)
    values (
      v_quote_id, v_user_id, v_product_id,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_cents')::bigint,
      coalesce((v_item->>'discount_cents')::bigint, 0),
      coalesce((v_item->>'tax_rate')::numeric, 0),
      v_line_total,
      coalesce((v_item->>'sort_order')::int, 0)
    );
  end loop;

  update public.quotes
    set subtotal_cents = v_subtotal, discount_cents = v_discount, tax_cents = v_tax, total_cents = v_subtotal - v_discount + v_tax
    where id = v_quote_id;

  return v_quote_id;
end;
$$;

create or replace function public.create_invoice_with_items(
  p_client_id uuid,
  p_issue_date date,
  p_due_date date,
  p_currency text,
  p_notes text,
  p_terms text,
  p_items jsonb
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_doc_number text;
  v_invoice_id uuid;
  v_subtotal bigint := 0;
  v_tax bigint := 0;
  v_discount bigint := 0;
  v_item jsonb;
  v_line_gross bigint;
  v_line_total bigint;
  v_product_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_document_limit(v_user_id, 'invoice');

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and user_id = v_user_id
  ) then
    raise exception 'invalid client';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'an invoice must have at least one line item';
  end if;

  v_doc_number := public.next_document_number(v_user_id, 'invoice');

  insert into public.invoices (user_id, client_id, document_number, status, issue_date, due_date, currency, notes, terms)
  values (v_user_id, p_client_id, v_doc_number, 'draft', p_issue_date, p_due_date, coalesce(p_currency, 'SAR'), p_notes, p_terms)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    if v_product_id is not null and not exists (
      select 1 from public.products where id = v_product_id and user_id = v_user_id
    ) then
      raise exception 'invalid product reference';
    end if;

    v_line_gross := round((v_item->>'quantity')::numeric * (v_item->>'unit_price_cents')::numeric)::bigint;
    v_line_total := v_line_gross - coalesce((v_item->>'discount_cents')::bigint, 0);

    v_subtotal := v_subtotal + v_line_gross;
    v_discount := v_discount + coalesce((v_item->>'discount_cents')::bigint, 0);
    v_tax := v_tax + round(v_line_total * coalesce((v_item->>'tax_rate')::numeric, 0) / 100)::bigint;

    insert into public.invoice_items
      (invoice_id, user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order)
    values (
      v_invoice_id, v_user_id, v_product_id,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_cents')::bigint,
      coalesce((v_item->>'discount_cents')::bigint, 0),
      coalesce((v_item->>'tax_rate')::numeric, 0),
      v_line_total,
      coalesce((v_item->>'sort_order')::int, 0)
    );
  end loop;

  update public.invoices
    set subtotal_cents = v_subtotal, discount_cents = v_discount, tax_cents = v_tax, total_cents = v_subtotal - v_discount + v_tax
    where id = v_invoice_id;

  return v_invoice_id;
end;
$$;

revoke all on function public.check_document_limit(uuid, text) from public;
grant execute on function public.check_document_limit(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- checkout_sessions — tracks an initiated checkout attempt so the webhook
-- handler can resolve which user/plan a provider payment corresponds to, and
-- so the frontend can poll "did my checkout complete" without ever being the
-- thing that decides the answer.
-- ----------------------------------------------------------------------------
create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan public.subscription_plan not null,
  provider text not null,
  provider_session_id text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'failed')),
  created_at timestamptz not null default now()
);

create index checkout_sessions_provider_session_idx on public.checkout_sessions(provider, provider_session_id);
create index checkout_sessions_user_idx on public.checkout_sessions(user_id);

alter table public.checkout_sessions enable row level security;
create policy "checkout_sessions_select_own" on public.checkout_sessions
  for select using (auth.uid() = user_id);
create policy "checkout_sessions_insert_own" on public.checkout_sessions
  for insert with check (auth.uid() = user_id);
-- No update/delete policy for the client: marking a session completed is a
-- service-role-only write from the webhook handler, same reasoning as
-- payment_webhook_events and subscriptions above.

-- ----------------------------------------------------------------------------
-- User-initiated cancellation. This is the ONLY subscription-adjacent write a
-- normal user can ever make, and it deliberately never touches `plan` or
-- `status` — it only records intent (cancel_at_period_end). The actual
-- downgrade to Free happens when the paid period ends with no successful
-- renewal, via the webhook/sync path — never this function — which is what
-- makes "access continues until period end" a structural fact, not a promise
-- the UI happens to keep.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_my_subscription()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.subscriptions
    set cancel_at_period_end = true
    where user_id = v_user_id and status in ('active', 'trialing', 'past_due');
end;
$$;

create or replace function public.reactivate_my_subscription()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.subscriptions
    set cancel_at_period_end = false
    where user_id = v_user_id and status in ('active', 'trialing', 'past_due');
end;
$$;

revoke all on function public.cancel_my_subscription() from public;
grant execute on function public.cancel_my_subscription() to authenticated;
revoke all on function public.reactivate_my_subscription() from public;
grant execute on function public.reactivate_my_subscription() to authenticated;

-- NOTE ON WRITE ACCESS TO subscriptions:
-- Phase 1 already left `subscriptions` with a select-only policy for the
-- owner and no client-side write policy at all — this migration does not
-- change that. Besides the two narrow functions just above (which only ever
-- touch cancel_at_period_end), the only code path in the application that
-- can change `plan`, `status`, or the provider identifiers is the webhook
-- Route Handler calling sync_subscription_from_webhook() using the
-- service-role key. That key bypasses RLS by Supabase design, so the real
-- trust boundary for a plan change is this application's own webhook
-- signature verification (see lib/billing/providers/moyasar.ts), not RLS.
-- sync_subscription_from_webhook itself does not need to be security definer
-- because the webhook route already connects with full (service-role)
-- access; it exists as a function anyway so there is exactly one place that
-- defines what a valid write to `subscriptions` looks like, and the webhook
-- route can't accidentally write a malformed/partial row.
-- ----------------------------------------------------------------------------
create or replace function public.sync_subscription_from_webhook(
  p_user_id uuid,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_provider text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
) returns void
language plpgsql
as $$
begin
  insert into public.subscriptions (user_id, plan, status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end)
  values (p_user_id, p_plan, p_status, p_provider, p_provider_customer_id, p_provider_subscription_id, p_current_period_end, p_cancel_at_period_end)
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    provider = excluded.provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Atomic webhook processing: the idempotency insert and the subscription
-- sync happen in ONE function call (one transaction). This matters because
-- inserting the event-id row and then separately syncing the subscription
-- (as two round-trips from the route handler) would leave a gap where a
-- crash between the two steps records the event as "seen" without ever
-- having applied its effect — a retry would then be wrongly treated as a
-- duplicate and silently dropped. Doing both in one plpgsql function means
-- either both happen or neither does; a retry after a genuine failure will
-- correctly find no existing event row and reprocess from scratch.
-- ----------------------------------------------------------------------------
create or replace function public.process_payment_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_checkout_session_id uuid,
  p_user_id uuid,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_mark_checkout_completed boolean,
  p_mark_checkout_failed boolean
) returns text
language plpgsql
as $$
begin
  begin
    insert into public.payment_webhook_events (provider, provider_event_id, event_type, payload)
    values (p_provider, p_provider_event_id, p_event_type, p_payload);
  exception when unique_violation then
    -- Already processed this exact event (a provider retry, or the event
    -- was delivered more than once) — do nothing further and report it as
    -- a duplicate so the caller can log it distinctly from a fresh event.
    return 'duplicate';
  end;

  if p_user_id is not null and p_plan is not null and p_status is not null then
    perform public.sync_subscription_from_webhook(
      p_user_id, p_plan, p_status, p_provider,
      p_provider_customer_id, p_provider_subscription_id,
      p_current_period_end, false
    );
  end if;

  if p_checkout_session_id is not null then
    if p_mark_checkout_completed then
      update public.checkout_sessions set status = 'completed' where id = p_checkout_session_id;
    elsif p_mark_checkout_failed then
      update public.checkout_sessions set status = 'failed' where id = p_checkout_session_id;
    end if;
  end if;

  update public.payment_webhook_events set processed_at = now()
    where provider = p_provider and provider_event_id = p_provider_event_id;

  return 'processed';
end;
$$;
-- No grants at all for this function: it is called only via the
-- service-role connection (which bypasses grant checks entirely, same as it
-- bypasses RLS), never via a normal authenticated RPC call.

-- ============================================================================
-- PHASE 8 FIXES (post-review) — recurring billing groundwork, past_due state
-- machine, and the client-limit race fix. Appended to this same migration
-- file rather than a new one because nothing in 0006 has ever run against a
-- live database in this project yet (documented throughout every phase's
-- report) — in a real deployment where 0006 had already been applied, these
-- would ship as their own follow-up migration instead of editing history.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- checkout_sessions: store the checkout URL itself, so a duplicate "Upgrade"
-- click within a short window can reuse the same pending checkout instead of
-- creating a second Invoice at the provider for every click.
-- ----------------------------------------------------------------------------
alter table public.checkout_sessions add column if not exists checkout_url text;

-- ----------------------------------------------------------------------------
-- subscriptions: renewal/token bookkeeping needed for recurring billing and
-- the past_due state machine. All of these are written ONLY by the webhook
-- route or the renewal cron route, both using the service-role client — same
-- trust boundary as every other subscriptions write in this schema.
-- ----------------------------------------------------------------------------
alter table public.subscriptions add column if not exists payment_token text;
alter table public.subscriptions add column if not exists payment_token_status text;
alter table public.subscriptions add column if not exists past_due_since timestamptz;
alter table public.subscriptions add column if not exists renewal_attempts integer not null default 0;

-- ----------------------------------------------------------------------------
-- CLIENT LIMIT RACE FIX.
-- Previous version: the trigger did `select count(*) from clients` and
-- compared to the limit, with no lock — two concurrent inserts for the same
-- user could both read the same pre-insert count and both pass the check.
-- Fixed version: a real per-user counter row, locked with `for update`
-- inside the same trigger invocation. `SELECT ... FOR UPDATE` on that single
-- row serializes concurrent transactions inserting a client for the SAME
-- user (the second transaction blocks until the first commits or rolls
-- back, then sees the updated count) — this is the standard atomic-counter
-- pattern for exactly this problem, and it is genuinely race-proof, unlike
-- the count-then-insert version it replaces.
-- ----------------------------------------------------------------------------
create table public.user_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clients_count integer not null default 0
);

-- Backfill for any clients that already exist (relevant once this runs
-- against a real database with real data, not on a fresh install).
insert into public.user_counters (user_id, clients_count)
select user_id, count(*) from public.clients group by user_id
on conflict (user_id) do update set clients_count = excluded.clients_count;

create or replace function public.enforce_client_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan public.subscription_plan;
  v_limit integer;
  v_count integer;
begin
  insert into public.user_counters (user_id, clients_count) values (new.user_id, 0)
    on conflict (user_id) do nothing;

  -- Locks this user's counter row for the rest of the transaction. A second,
  -- concurrent insert for the SAME user blocks here until this transaction
  -- commits or rolls back — that is the actual fix, not just re-reading the
  -- count more carefully.
  select clients_count into v_count from public.user_counters where user_id = new.user_id for update;

  select plan into v_plan from public.subscriptions where user_id = new.user_id;
  if v_plan is null then v_plan := 'free'; end if;
  v_limit := (public.plan_limits(v_plan)->>'max_clients')::integer;

  if v_limit is not null and v_count >= v_limit then
    raise exception 'client_quota_exceeded';
  end if;

  update public.user_counters set clients_count = clients_count + 1 where user_id = new.user_id;
  return new;
end;
$$;

-- Keep the counter accurate on delete too, so the limit doesn't ratchet up
-- forever as clients are removed and re-added over time.
create or replace function public.decrement_client_counter()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.user_counters set clients_count = greatest(clients_count - 1, 0) where user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists decrement_client_counter_trigger on public.clients;
create trigger decrement_client_counter_trigger
  after delete on public.clients
  for each row execute function public.decrement_client_counter();

alter table public.user_counters enable row level security;
-- No client-side policies at all: this table is internal bookkeeping,
-- touched only by the two trigger functions above (both security definer).
-- A user has no legitimate reason to read or write it directly.

-- ----------------------------------------------------------------------------
-- PAST_DUE STATE MACHINE.
-- Exactly three server-side-only transitions, each driven by a VERIFIED
-- provider event or a scheduled job's own outcome — never by the browser:
--
--   active   -> past_due : the renewal job attempts a charge on/after
--                          current_period_end and it does not succeed
--                          immediately (a payment_failed webhook, or no
--                          successful payment_paid within a short window)
--   past_due -> active   : a SUBSEQUENT renewal charge succeeds
--                          (payment_paid webhook for that renewal attempt)
--   past_due -> expired  : renewal_attempts reaches a cap (3) OR
--                          past_due_since is older than a grace period
--                          (7 days) with no successful charge
--
-- All three are implemented as functions with NO grants to authenticated —
-- callable only via the service-role connection used by the webhook and
-- renewal-cron routes.
-- ----------------------------------------------------------------------------
create or replace function public.mark_subscription_past_due(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  update public.subscriptions
    set status = 'past_due',
        past_due_since = coalesce(past_due_since, now()),
        renewal_attempts = renewal_attempts + 1
    where user_id = p_user_id and status in ('active', 'past_due');
end;
$$;

create or replace function public.mark_subscription_renewed(p_user_id uuid, p_current_period_end timestamptz)
returns void
language plpgsql
as $$
begin
  update public.subscriptions
    set status = 'active',
        current_period_end = p_current_period_end,
        past_due_since = null,
        renewal_attempts = 0
    where user_id = p_user_id;
end;
$$;

create or replace function public.expire_subscription(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  update public.subscriptions
    set plan = 'free', status = 'expired', past_due_since = null, renewal_attempts = 0, cancel_at_period_end = false
    where user_id = p_user_id;
end;
$$;

-- Called by the renewal cron route to find who needs a renewal attempt:
-- paid-plan subscriptions whose period has ended and who haven't asked to
-- cancel, PLUS existing past_due subscriptions still within their grace
-- period (retry). Read-only — the cron route decides what to do with the
-- result and writes back through the three functions above.
create or replace function public.subscriptions_due_for_renewal()
returns table (
  user_id uuid,
  plan public.subscription_plan,
  payment_token text,
  renewal_attempts integer,
  past_due_since timestamptz
)
language sql
stable
as $$
  select s.user_id, s.plan, s.payment_token, s.renewal_attempts, s.past_due_since
  from public.subscriptions s
  where s.plan <> 'free'
    and s.cancel_at_period_end = false
    and s.payment_token is not null
    and (
      (s.status = 'active' and s.current_period_end < now())
      or (s.status = 'past_due')
    );
$$;

-- No grants on any of the four functions above — service-role only.

-- ----------------------------------------------------------------------------
-- Idempotent charge-outcome recording for renewals, mirroring the checkout
-- webhook's atomicity guarantee: the event-dedup insert and the state
-- transition happen in one transaction.
-- ----------------------------------------------------------------------------
create or replace function public.process_renewal_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_user_id uuid,
  p_succeeded boolean,
  p_new_period_end timestamptz,
  p_grace_period_attempts integer,
  p_grace_period_days integer
) returns text
language plpgsql
as $$
declare
  v_attempts integer;
  v_past_due_since timestamptz;
begin
  begin
    insert into public.payment_webhook_events (provider, provider_event_id, event_type, payload)
    values (p_provider, p_provider_event_id, p_event_type, p_payload);
  exception when unique_violation then
    return 'duplicate';
  end;

  if p_succeeded then
    perform public.mark_subscription_renewed(p_user_id, p_new_period_end);
  else
    perform public.mark_subscription_past_due(p_user_id);

    select renewal_attempts, past_due_since into v_attempts, v_past_due_since
      from public.subscriptions where user_id = p_user_id;

    if v_attempts >= p_grace_period_attempts
       or (v_past_due_since is not null and v_past_due_since < now() - make_interval(days => p_grace_period_days)) then
      perform public.expire_subscription(p_user_id);
    end if;
  end if;

  update public.payment_webhook_events set processed_at = now()
    where provider = p_provider and provider_event_id = p_provider_event_id;

  return 'processed';
end;
$$;
-- No grants — service-role only, same as process_payment_webhook_event.
