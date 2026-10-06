-- ============================================================================
-- SANAD — Phase 4: Quote write functions
-- These run as `security definer` so a quote + its line items are written
-- atomically (all-or-nothing) and so the document number sequence increment
-- in next_document_number() is safe under concurrency.
--
-- IMPORTANT: security definer bypasses RLS inside the function body, so every
-- function here re-checks ownership explicitly wherever it touches a row that
-- didn't originate from auth.uid() itself (client_id, product_id, quote_id
-- passed in as an argument). Skipping that check would be the actual security
-- hole security definer functions are known for — it is not skipped here.
-- ============================================================================

create or replace function public.create_quote_with_items(
  p_client_id uuid,
  p_issue_date date,
  p_expiry_date date,
  p_currency text,
  p_notes text,
  p_terms text,
  p_items jsonb -- [{description, quantity, unit_price_cents, discount_cents, tax_rate, product_id, sort_order}]
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

-- ----------------------------------------------------------------------------
-- Editing is only allowed while a quote is still a draft — once it's been
-- sent, changing it silently out from under the client would be misleading.
-- The product path for a sent quote is "duplicate" (below), not "edit".
-- ----------------------------------------------------------------------------
create or replace function public.update_quote_with_items(
  p_quote_id uuid,
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
  v_status public.quote_status;
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

  select status into v_status from public.quotes where id = p_quote_id and user_id = v_user_id;
  if v_status is null then
    raise exception 'quote not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'only draft quotes can be edited — duplicate this quote instead';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and user_id = v_user_id
  ) then
    raise exception 'invalid client';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a quote must have at least one line item';
  end if;

  delete from public.quote_items where quote_id = p_quote_id;

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
      p_quote_id, v_user_id, v_product_id,
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
    set client_id = p_client_id, issue_date = p_issue_date, expiry_date = p_expiry_date,
        currency = coalesce(p_currency, currency), notes = p_notes, terms = p_terms,
        subtotal_cents = v_subtotal, discount_cents = v_discount, tax_cents = v_tax,
        total_cents = v_subtotal - v_discount + v_tax
    where id = p_quote_id;

  return p_quote_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Status transitions. Kept restrictive on purpose: a document can't bounce
-- back to draft once sent, and terminal states (accepted/rejected/expired)
-- can't be changed at all from here.
-- ----------------------------------------------------------------------------
create or replace function public.set_quote_status(p_quote_id uuid, p_status public.quote_status)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.quote_status;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select status into v_current from public.quotes where id = p_quote_id and user_id = v_user_id;
  if v_current is null then
    raise exception 'quote not found';
  end if;

  if not (
    (v_current = 'draft' and p_status = 'sent') or
    (v_current = 'sent' and p_status in ('accepted','rejected','expired'))
  ) then
    raise exception 'invalid status transition from % to %', v_current, p_status;
  end if;

  update public.quotes set status = p_status where id = p_quote_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Duplicate: always produces a new draft with a fresh document number,
-- regardless of the source quote's status.
-- ----------------------------------------------------------------------------
create or replace function public.duplicate_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_src record;
  v_new_id uuid;
  v_doc_number text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_src from public.quotes where id = p_quote_id and user_id = v_user_id;
  if v_src is null then
    raise exception 'quote not found';
  end if;

  v_doc_number := public.next_document_number(v_user_id, 'quote');

  insert into public.quotes (user_id, client_id, document_number, status, issue_date, expiry_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms)
  values (v_user_id, v_src.client_id, v_doc_number, 'draft', current_date, null, v_src.currency, v_src.subtotal_cents, v_src.discount_cents, v_src.tax_cents, v_src.total_cents, v_src.notes, v_src.terms)
  returning id into v_new_id;

  insert into public.quote_items (quote_id, user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order)
  select v_new_id, v_user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order
  from public.quote_items where quote_id = p_quote_id;

  return v_new_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Convert to invoice: creates a real invoice from the quote's current items,
-- links both directions, and leaves the quote's own status untouched here —
-- the calling code decides whether to also mark it accepted.
-- ----------------------------------------------------------------------------
create or replace function public.convert_quote_to_invoice(p_quote_id uuid, p_due_date date)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_src record;
  v_invoice_id uuid;
  v_doc_number text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_src from public.quotes where id = p_quote_id and user_id = v_user_id;
  if v_src is null then
    raise exception 'quote not found';
  end if;

  if v_src.converted_to_invoice_id is not null then
    raise exception 'this quote has already been converted to an invoice';
  end if;

  v_doc_number := public.next_document_number(v_user_id, 'invoice');

  insert into public.invoices (user_id, client_id, quote_id, document_number, status, issue_date, due_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms)
  values (v_user_id, v_src.client_id, v_src.id, v_doc_number, 'draft', current_date, p_due_date, v_src.currency, v_src.subtotal_cents, v_src.discount_cents, v_src.tax_cents, v_src.total_cents, v_src.notes, v_src.terms)
  returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order)
  select v_invoice_id, v_user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order
  from public.quote_items where quote_id = p_quote_id;

  update public.quotes set converted_to_invoice_id = v_invoice_id where id = p_quote_id;

  return v_invoice_id;
end;
$$;
