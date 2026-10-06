-- ============================================================================
-- SANAD — Phase 7: AI usage accounting
--
-- Model: RESERVE before calling the AI provider, REFUND if the call fails or
-- the response turns out malformed. This means:
--   - A successful, validated AI response consumes exactly 1 unit of usage.
--   - A provider timeout / error / invalid JSON consumes 0 (refunded).
--   - Two retries after two real failures consume 0 total, not 2.
--   - The limit itself is still enforced atomically at reserve time (row
--     lock via the upsert), so concurrent requests can't both slip through
--     just because neither has committed yet.
-- Usage counting happens ONLY inside these functions, called ONLY from
-- server-side AI route handlers — never from a client component — so a
-- user calling the AI HTTP endpoint directly still goes through the exact
-- same reservation check as the UI.
-- ============================================================================

-- Provisional monthly limits — plugged in here so the *mechanism* exists;
-- the actual numbers are a pricing decision, not an engineering one, and
-- should be revisited before launch rather than treated as final.
create or replace function public.ai_monthly_limit_for_plan(p_plan public.subscription_plan)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'free' then 10
    when 'pro' then 200
    when 'business' then 1000
    else 0
  end;
$$;

create or replace function public.reserve_ai_usage()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plan;
  v_period date := date_trunc('month', current_date)::date;
  v_limit integer;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select plan into v_plan from public.subscriptions where user_id = v_user_id;
  if v_plan is null then
    v_plan := 'free';
  end if;
  v_limit := public.ai_monthly_limit_for_plan(v_plan);

  -- Upsert-then-lock: ensures concurrent requests in the same period serialize
  -- on this row rather than both reading the same "used" value before either
  -- writes, which is what would let two simultaneous requests both sneak in
  -- one unit under the limit.
  insert into public.usage (user_id, period_start, ai_requests_used)
    values (v_user_id, v_period, 0)
    on conflict (user_id, period_start) do nothing;

  select ai_requests_used into v_used
    from public.usage
    where user_id = v_user_id and period_start = v_period
    for update;

  if v_used >= v_limit then
    raise exception 'ai_quota_exceeded';
  end if;

  update public.usage
    set ai_requests_used = ai_requests_used + 1
    where user_id = v_user_id and period_start = v_period;
end;
$$;

create or replace function public.refund_ai_usage()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', current_date)::date;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.usage
    set ai_requests_used = greatest(ai_requests_used - 1, 0)
    where user_id = v_user_id and period_start = v_period;
end;
$$;

revoke all on function public.reserve_ai_usage() from public;
grant execute on function public.reserve_ai_usage() to authenticated;

revoke all on function public.refund_ai_usage() from public;
grant execute on function public.refund_ai_usage() to authenticated;

revoke all on function public.ai_monthly_limit_for_plan(public.subscription_plan) from public;
grant execute on function public.ai_monthly_limit_for_plan(public.subscription_plan) to authenticated;
