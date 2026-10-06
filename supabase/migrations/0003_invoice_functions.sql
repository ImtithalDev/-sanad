-- ============================================================================
-- SANAD — Phase 5: Invoice write functions
-- Same pattern as Phase 4's quote functions: security definer for atomicity,
-- with explicit ownership re-checks since RLS is bypassed inside the function.
-- ============================================================================

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

-- ----------------------------------------------------------------------------
-- Editing is only allowed while an invoice is still a draft — same reasoning
-- as quotes: once sent, the document is what the client saw and changing it
-- silently would be misleading. Duplicate instead.
-- ----------------------------------------------------------------------------
create or replace function public.update_invoice_with_items(
  p_invoice_id uuid,
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
  v_status public.invoice_status;
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

  select status into v_status from public.invoices where id = p_invoice_id and user_id = v_user_id;
  if v_status is null then
    raise exception 'invoice not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'only draft invoices can be edited — duplicate this invoice instead';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and user_id = v_user_id
  ) then
    raise exception 'invalid client';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'an invoice must have at least one line item';
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;

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
      p_invoice_id, v_user_id, v_product_id,
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
    set client_id = p_client_id, issue_date = p_issue_date, due_date = p_due_date,
        currency = coalesce(p_currency, currency), notes = p_notes, terms = p_terms,
        subtotal_cents = v_subtotal, discount_cents = v_discount, tax_cents = v_tax,
        total_cents = v_subtotal - v_discount + v_tax
    where id = p_invoice_id;

  return p_invoice_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Status transitions — a real state machine, not a free-form field.
-- draft -> sent | cancelled
-- sent  -> paid | overdue | cancelled
-- overdue -> paid | cancelled
-- paid and cancelled are terminal.
-- ----------------------------------------------------------------------------
create or replace function public.set_invoice_status(p_invoice_id uuid, p_status public.invoice_status)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.invoice_status;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select status into v_current from public.invoices where id = p_invoice_id and user_id = v_user_id;
  if v_current is null then
    raise exception 'invoice not found';
  end if;

  if not (
    (v_current = 'draft' and p_status in ('sent','cancelled')) or
    (v_current = 'sent' and p_status in ('paid','overdue','cancelled')) or
    (v_current = 'overdue' and p_status in ('paid','cancelled'))
  ) then
    raise exception 'invalid status transition from % to %', v_current, p_status;
  end if;

  update public.invoices
    set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end
    where id = p_invoice_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Delete is only allowed for drafts (nothing has been sent to a client yet).
-- Anything past draft must be cancelled instead, which preserves the record
-- and the document number rather than erasing it.
-- ----------------------------------------------------------------------------
create or replace function public.delete_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status public.invoice_status;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select status into v_status from public.invoices where id = p_invoice_id and user_id = v_user_id;
  if v_status is null then
    raise exception 'invoice not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'only a draft invoice can be deleted — cancel it instead';
  end if;

  delete from public.invoices where id = p_invoice_id and user_id = v_user_id;
end;
$$;

create or replace function public.duplicate_invoice(p_invoice_id uuid)
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

  select * into v_src from public.invoices where id = p_invoice_id and user_id = v_user_id;
  if v_src is null then
    raise exception 'invoice not found';
  end if;

  v_doc_number := public.next_document_number(v_user_id, 'invoice');

  insert into public.invoices (user_id, client_id, document_number, status, issue_date, due_date, currency, subtotal_cents, discount_cents, tax_cents, total_cents, notes, terms)
  values (v_user_id, v_src.client_id, v_doc_number, 'draft', current_date, null, v_src.currency, v_src.subtotal_cents, v_src.discount_cents, v_src.tax_cents, v_src.total_cents, v_src.notes, v_src.terms)
  returning id into v_new_id;

  insert into public.invoice_items (invoice_id, user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order)
  select v_new_id, v_user_id, product_id, description, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents, sort_order
  from public.invoice_items where invoice_id = p_invoice_id;

  return v_new_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Idempotency fix for quote -> invoice conversion (Phase 4's version raised
-- an exception on a repeat call, which is retry-*safe* in that it can't create
-- a duplicate invoice, but it is not retry-*friendly*: a client retrying after
-- a dropped network response on the FIRST successful attempt would see an
-- error even though the invoice was actually created. This replacement makes
-- a repeat call return the SAME invoice id instead of erroring, which is what
-- "idempotent" actually means here — same request, same result, no duplicate
-- either way.
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

  -- Lock the quote row for the duration of this transaction so two concurrent
  -- conversion requests for the same quote can't both pass the "not yet
  -- converted" check before either has written converted_to_invoice_id.
  select * into v_src from public.quotes where id = p_quote_id and user_id = v_user_id for update;
  if v_src is null then
    raise exception 'quote not found';
  end if;

  if v_src.converted_to_invoice_id is not null then
    -- Already converted (this is a retry, or the button was pressed twice) —
    -- return the existing invoice instead of creating a second one.
    return v_src.converted_to_invoice_id;
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
