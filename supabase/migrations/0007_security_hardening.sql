-- ============================================================================
-- SANAD — 0007: Security hardening (explicit function privileges)
--
-- Audit finding: several functions across 0001–0006 relied on Postgres's
-- default behavior (EXECUTE granted to PUBLIC on creation) instead of an
-- explicit grant/revoke pair. Most were not actually exploitable thanks to
-- RLS on the underlying tables acting as a backstop, but one WAS a real,
-- exploitable gap:
--
--   next_document_number(p_user_id uuid, p_doc_type text) took the target
--   user id as a plain parameter, was SECURITY DEFINER, and had no explicit
--   grant restriction and no internal check that p_user_id matched the
--   caller. Any authenticated user could call
--     select next_document_number('<victim-uuid>', 'invoice')
--   directly and advance ANOTHER user's document-numbering sequence —
--   not a data leak, but real tampering with another account's business
--   records (their next invoice would skip a number). Fixed below with
--   both an ownership check AND a grant restriction — belt and suspenders,
--   matching this codebase's established pattern everywhere else.
--
-- Everything else here is defense-in-depth: closing implicit-PUBLIC-access
-- gaps on functions that were only accidentally safe because of RLS on the
-- tables they touch, not because access to the function itself was ever
-- deliberately restricted. This migration makes the restriction explicit
-- and independent of any other table's policy set remaining exactly as-is.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REAL FIX: next_document_number ownership check + grant restriction.
-- ----------------------------------------------------------------------------
create or replace function public.next_document_number(p_user_id uuid, p_doc_type text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_prefix text;
  v_seq integer;
  v_number text;
begin
  -- This function is only ever meant to be called by another SECURITY
  -- DEFINER function in this schema (create_quote_with_items,
  -- create_invoice_with_items) which always passes its own auth.uid() as
  -- p_user_id — so this check can never legitimately fail for a correct
  -- caller, and closes the direct-RPC-call vector described above.
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;

  if p_doc_type = 'invoice' then
    update public.business_profiles
      set next_invoice_seq = next_invoice_seq + 1
      where user_id = p_user_id
      returning invoice_prefix, next_invoice_seq - 1 into v_prefix, v_seq;
  elsif p_doc_type = 'quote' then
    update public.business_profiles
      set next_quote_seq = next_quote_seq + 1
      where user_id = p_user_id
      returning quote_prefix, next_quote_seq - 1 into v_prefix, v_seq;
  else
    raise exception 'invalid document type: %', p_doc_type;
  end if;

  if v_prefix is null then
    raise exception 'business profile not found for user %', p_user_id;
  end if;

  v_number := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  return v_number;
end;
$$;

-- No grant to authenticated/anon at all: the ONLY legitimate callers are
-- other SECURITY DEFINER functions in this schema, which execute with the
-- elevated definer role regardless of what's granted to 'authenticated' —
-- revoking this does not break create_quote_with_items/create_invoice_with_items.
revoke all on function public.next_document_number(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Trigger-only functions: never meant to be called directly via RPC.
-- Revoking direct execute doesn't affect trigger firing (triggers invoke
-- their function through a separate internal mechanism, not a grant-checked
-- RPC call).
-- ----------------------------------------------------------------------------
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_client_limit() from public, anon, authenticated;
revoke all on function public.decrement_client_counter() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. User-facing document-mutation RPCs: explicit grant to `authenticated`
-- only, replacing reliance on Postgres's default PUBLIC-execute behavior.
-- Each of these already contains its own auth.uid()-based ownership check
-- (a user calling one with someone else's document id gets "not found," not
-- another user's data) — this grant change doesn't alter that; it just
-- stops `anon` from being able to call them at all (previously blocked only
-- by the internal "not authenticated" check, now blocked at the grant
-- level too).
-- ----------------------------------------------------------------------------
revoke all on function public.create_quote_with_items(uuid, date, date, text, text, text, jsonb) from public;
grant execute on function public.create_quote_with_items(uuid, date, date, text, text, text, jsonb) to authenticated;

revoke all on function public.update_quote_with_items(uuid, uuid, date, date, text, text, text, jsonb) from public;
grant execute on function public.update_quote_with_items(uuid, uuid, date, date, text, text, text, jsonb) to authenticated;

revoke all on function public.set_quote_status(uuid, public.quote_status) from public;
grant execute on function public.set_quote_status(uuid, public.quote_status) to authenticated;

revoke all on function public.duplicate_quote(uuid) from public;
grant execute on function public.duplicate_quote(uuid) to authenticated;

revoke all on function public.convert_quote_to_invoice(uuid, date) from public;
grant execute on function public.convert_quote_to_invoice(uuid, date) to authenticated;

revoke all on function public.create_invoice_with_items(uuid, date, date, text, text, text, jsonb) from public;
grant execute on function public.create_invoice_with_items(uuid, date, date, text, text, text, jsonb) to authenticated;

revoke all on function public.update_invoice_with_items(uuid, uuid, date, date, text, text, text, jsonb) from public;
grant execute on function public.update_invoice_with_items(uuid, uuid, date, date, text, text, text, jsonb) to authenticated;

revoke all on function public.set_invoice_status(uuid, public.invoice_status) from public;
grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

revoke all on function public.delete_draft_invoice(uuid) from public;
grant execute on function public.delete_draft_invoice(uuid) to authenticated;

revoke all on function public.duplicate_invoice(uuid) from public;
grant execute on function public.duplicate_invoice(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Service-role-only billing/webhook/renewal functions: revoke ALL direct
-- access. The service-role connection used by the webhook and cron routes
-- bypasses grant checks entirely (same mechanism by which it bypasses RLS),
-- so this does not break those routes — it only removes the previously
-- implicit ability for `authenticated` (or `anon`) to call them directly.
-- Most of these were not actually exploitable before this migration (RLS on
-- `subscriptions`/`payment_webhook_events` has no INSERT/UPDATE policy for
-- authenticated, so a direct call would silently affect zero rows) — this
-- closes the gap explicitly rather than continuing to rely on that as an
-- accidental side effect of an unrelated table's policy set.
-- ----------------------------------------------------------------------------
revoke all on function public.sync_subscription_from_webhook(uuid, public.subscription_plan, public.subscription_status, text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.process_payment_webhook_event(text, text, text, jsonb, uuid, uuid, public.subscription_plan, public.subscription_status, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;
revoke all on function public.subscriptions_due_for_renewal() from public, anon, authenticated;
revoke all on function public.process_renewal_webhook_event(text, text, text, jsonb, uuid, boolean, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.mark_subscription_past_due(uuid) from public, anon, authenticated;
revoke all on function public.mark_subscription_renewed(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.expire_subscription(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Sanity check queries (run these manually after applying, not part of
-- the migration's effect — left here as a documented verification recipe
-- for whoever applies this against a real project):
--
--   select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_call
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--   order by 1;
--
-- Expect `authenticated_can_call = false` for every function listed in
-- sections 1, 2, and 4 above, and `true` for every function in section 3
-- and every pre-existing explicitly-granted function from 0004/0005/0006.
-- ----------------------------------------------------------------------------
