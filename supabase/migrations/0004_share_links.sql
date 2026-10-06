-- ============================================================================
-- SANAD — Phase 6: Public share links for quotes/invoices
--
-- Design: a share link is a random, unguessable token stored in its own
-- table — never the document's internal uuid. The public viewing page and
-- public PDF route both take ONLY the token, never a document id, so nothing
-- about the private dashboard's URL structure or ids is ever exposed.
-- ============================================================================

create table public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('quote', 'invoice')),
  document_id uuid not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index share_tokens_token_idx on public.share_tokens(token) where revoked_at is null;
create index share_tokens_document_idx on public.share_tokens(document_type, document_id);

alter table public.share_tokens enable row level security;

-- Owners can see/manage their own share links (e.g. an account settings page
-- listing active links). They do NOT get a blanket write policy though —
-- creation and revocation go through the RPCs below, which also verify the
-- underlying quote/invoice is actually theirs before touching anything.
create policy "share_tokens_select_own" on public.share_tokens
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Token generation: 32 random bytes, hex-encoded (64 chars) — not a UUID,
-- specifically so a share link can never be confused with / doesn't leak the
-- shape of an internal id.
-- ----------------------------------------------------------------------------
create or replace function public.create_share_link(p_document_type text, p_document_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owns boolean;
  v_existing_token text;
  v_new_token text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_document_type not in ('quote', 'invoice') then
    raise exception 'invalid document type';
  end if;

  if p_document_type = 'quote' then
    select exists(select 1 from public.quotes where id = p_document_id and user_id = v_user_id) into v_owns;
  else
    select exists(select 1 from public.invoices where id = p_document_id and user_id = v_user_id) into v_owns;
  end if;

  if not v_owns then
    raise exception 'document not found';
  end if;

  -- Reuse an existing active link instead of piling up new ones every time
  -- "Share" is pressed — one document, one live link at a time.
  select token into v_existing_token
    from public.share_tokens
    where document_type = p_document_type and document_id = p_document_id and revoked_at is null
    limit 1;

  if v_existing_token is not null then
    return v_existing_token;
  end if;

  v_new_token := encode(gen_random_bytes(32), 'hex');

  insert into public.share_tokens (user_id, document_type, document_id, token)
  values (v_user_id, p_document_type, p_document_id, v_new_token);

  return v_new_token;
end;
$$;

create or replace function public.revoke_share_link(p_document_type text, p_document_id uuid)
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

  update public.share_tokens
    set revoked_at = now()
    where document_type = p_document_type
      and document_id = p_document_id
      and user_id = v_user_id
      and revoked_at is null;
end;
$$;

-- ----------------------------------------------------------------------------
-- The one deliberately public read path in the whole schema. Runs as
-- security definer specifically to bypass RLS for an anonymous visitor —
-- that bypass is scoped as tightly as possible: it returns exactly one
-- document's data, only if a live (non-revoked) token matches, and nothing
-- about any other user's data is reachable through it.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_document(p_token text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_link record;
  v_result jsonb;
begin
  select * into v_link from public.share_tokens where token = p_token and revoked_at is null;
  if v_link is null then
    return null; -- caller treats null as "not found or revoked" — same message either way
  end if;

  if v_link.document_type = 'quote' then
    select jsonb_build_object(
      'kind', 'quote',
      'document_number', q.document_number,
      'status', q.status,
      'issue_date', q.issue_date,
      'expiry_date', q.expiry_date,
      'currency', q.currency,
      'subtotal_cents', q.subtotal_cents,
      'discount_cents', q.discount_cents,
      'tax_cents', q.tax_cents,
      'total_cents', q.total_cents,
      'notes', q.notes,
      'terms', q.terms,
      'client', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address),
      'business', jsonb_build_object('name', bp.business_name, 'email', bp.email, 'phone', bp.phone, 'address', bp.address, 'tax_number', bp.tax_number, 'logo_url', bp.logo_url),
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'description', qi.description, 'quantity', qi.quantity, 'unit_price_cents', qi.unit_price_cents,
          'discount_cents', qi.discount_cents, 'tax_rate', qi.tax_rate, 'line_total_cents', qi.line_total_cents
        ) order by qi.sort_order), '[]'::jsonb)
        from public.quote_items qi where qi.quote_id = q.id
      )
    ) into v_result
    from public.quotes q
    left join public.clients c on c.id = q.client_id
    left join public.business_profiles bp on bp.user_id = q.user_id
    where q.id = v_link.document_id;
  else
    select jsonb_build_object(
      'kind', 'invoice',
      'document_number', i.document_number,
      'status', i.status,
      'issue_date', i.issue_date,
      'due_date', i.due_date,
      'currency', i.currency,
      'subtotal_cents', i.subtotal_cents,
      'discount_cents', i.discount_cents,
      'tax_cents', i.tax_cents,
      'total_cents', i.total_cents,
      'notes', i.notes,
      'terms', i.terms,
      'client', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address),
      'business', jsonb_build_object('name', bp.business_name, 'email', bp.email, 'phone', bp.phone, 'address', bp.address, 'tax_number', bp.tax_number, 'logo_url', bp.logo_url),
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'description', ii.description, 'quantity', ii.quantity, 'unit_price_cents', ii.unit_price_cents,
          'discount_cents', ii.discount_cents, 'tax_rate', ii.tax_rate, 'line_total_cents', ii.line_total_cents
        ) order by ii.sort_order), '[]'::jsonb)
        from public.invoice_items ii where ii.invoice_id = i.id
      )
    ) into v_result
    from public.invoices i
    left join public.clients c on c.id = i.client_id
    left join public.business_profiles bp on bp.user_id = i.user_id
    where i.id = v_link.document_id;
  end if;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Explicit grants rather than relying on Postgres's "EXECUTE granted to
-- PUBLIC by default" behavior — the intent here should be readable from the
-- migration, not implicit.
-- ----------------------------------------------------------------------------
revoke all on function public.create_share_link(text, uuid) from public;
grant execute on function public.create_share_link(text, uuid) to authenticated;

revoke all on function public.revoke_share_link(text, uuid) from public;
grant execute on function public.revoke_share_link(text, uuid) to authenticated;

revoke all on function public.get_public_document(text) from public;
grant execute on function public.get_public_document(text) to anon, authenticated;
