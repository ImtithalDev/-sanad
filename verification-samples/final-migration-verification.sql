-- ============================================================================
-- READ-ONLY FINAL VERIFICATION — creates, alters, or deletes NOTHING.
-- Run each of the 5 blocks below one at a time (or all together — SQL
-- Editor will show 5 separate result tabs/tables).
-- ============================================================================

-- 1) All 15 tables + RLS status. Expect exactly 15 rows, every one showing
-- rowsecurity = true.
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2) Policy count per table. Expect at least 1 row per table (most will show
-- 2-4; a couple of internal-only tables like payment_webhook_events and
-- user_counters may legitimately show 0 or 1 — that's correct, not missing,
-- since those are written only by the service-role connection).
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

-- 3) Every custom function that should exist. Expect all of these names to
-- appear (order doesn't matter).
select proname as function_name
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where pg_namespace.nspname = 'public'
  and proname in (
    'handle_new_user', 'set_updated_at', 'next_document_number',
    'create_quote_with_items', 'update_quote_with_items', 'set_quote_status', 'duplicate_quote', 'convert_quote_to_invoice',
    'create_invoice_with_items', 'update_invoice_with_items', 'set_invoice_status', 'delete_draft_invoice', 'duplicate_invoice',
    'create_share_link', 'revoke_share_link', 'get_public_document',
    'reserve_ai_usage', 'refund_ai_usage', 'ai_monthly_limit_for_plan',
    'plan_limits', 'check_document_limit', 'enforce_client_limit', 'decrement_client_counter',
    'cancel_my_subscription', 'reactivate_my_subscription',
    'sync_subscription_from_webhook', 'process_payment_webhook_event',
    'mark_subscription_past_due', 'mark_subscription_renewed', 'expire_subscription',
    'subscriptions_due_for_renewal', 'process_renewal_webhook_event'
  )
order by proname;

-- 4) Every trigger that should exist.
select tgname as trigger_name, relname as on_table
from pg_trigger
join pg_class on pg_class.oid = pg_trigger.tgrelid
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public' and not tgisinternal
order by tgname;

-- 5) Security hardening spot-check (from 0007): these sensitive functions
-- must show authenticated_can_call = false. If any shows true, tell me
-- immediately — that would mean 0007 didn't apply cleanly.
select p.proname as function_name,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'next_document_number', 'handle_new_user', 'enforce_client_limit', 'decrement_client_counter',
    'sync_subscription_from_webhook', 'process_payment_webhook_event',
    'subscriptions_due_for_renewal', 'process_renewal_webhook_event',
    'mark_subscription_past_due', 'mark_subscription_renewed', 'expire_subscription'
  )
order by p.proname;
