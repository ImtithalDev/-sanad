-- ============================================================================
-- SANAD — Core Database Schema (Phase 1)
-- Postgres / Supabase. Money stored as integer minor units (halalas/cents).
-- Every user-owned row carries user_id + RLS: a user can only see their own data.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. PROFILES  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  preferred_language text not null default 'ar' check (preferred_language in ('ar','en')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. BUSINESS PROFILES  (the business identity that appears on documents)
-- ----------------------------------------------------------------------------
create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  business_type text,
  logo_url text,
  email text,
  phone text,
  address text,
  tax_number text,
  currency text not null default 'SAR',
  default_tax_rate numeric(5,2) not null default 15.00, -- percent, e.g. 15.00 = 15%
  invoice_prefix text not null default 'INV',
  quote_prefix text not null default 'QUO',
  next_invoice_seq integer not null default 1,
  next_quote_seq integer not null default 1,
  payment_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id) -- one business profile per user in v1
);

-- ----------------------------------------------------------------------------
-- 3. CLIENTS
-- ----------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_user_id_idx on public.clients(user_id);
create index clients_name_trgm_idx on public.clients using gin (name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. PRODUCTS / SERVICES  (reusable line items)
-- ----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  unit_price_cents bigint not null default 0,
  unit text default 'unit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_user_id_idx on public.products(user_id);

-- ----------------------------------------------------------------------------
-- 5. QUOTES
-- ----------------------------------------------------------------------------
create type public.quote_status as enum ('draft','sent','accepted','rejected','expired');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  document_number text not null, -- e.g. QUO-0001, generated server-side, unique per user
  status public.quote_status not null default 'draft',
  issue_date date not null default current_date,
  expiry_date date,
  currency text not null default 'SAR',
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  notes text,
  terms text,
  converted_to_invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_number)
);

create index quotes_user_id_idx on public.quotes(user_id);
create index quotes_status_idx on public.quotes(user_id, status);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, -- denormalized for RLS simplicity
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  tax_rate numeric(5,2) not null default 0,
  line_total_cents bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index quote_items_quote_id_idx on public.quote_items(quote_id);

-- ----------------------------------------------------------------------------
-- 6. INVOICES
-- ----------------------------------------------------------------------------
create type public.invoice_status as enum ('draft','sent','paid','overdue','cancelled');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null, -- if converted from a quote
  document_number text not null,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'SAR',
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  paid_at timestamptz,
  notes text,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_number)
);

create index invoices_user_id_idx on public.invoices(user_id);
create index invoices_status_idx on public.invoices(user_id, status);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  tax_rate numeric(5,2) not null default 0,
  line_total_cents bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

alter table public.quotes
  add constraint quotes_converted_invoice_fk
  foreign key (converted_to_invoice_id) references public.invoices(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 7. SUBSCRIPTIONS  (billing state — source of truth for plan gating)
-- ----------------------------------------------------------------------------
create type public.subscription_plan as enum ('free','pro','business');
create type public.subscription_status as enum ('active','trialing','past_due','canceled','incomplete');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'active',
  provider text, -- e.g. 'stripe', 'moyasar', 'paddle' — set once a real provider is connected
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ----------------------------------------------------------------------------
-- 8. USAGE  (counts against plan limits — reset monthly)
-- ----------------------------------------------------------------------------
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null, -- first day of the billing month being counted
  quotes_created integer not null default 0,
  invoices_created integer not null default 0,
  ai_requests_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

-- ----------------------------------------------------------------------------
-- 9. SETTINGS  (per-user app preferences beyond business_profiles)
-- ----------------------------------------------------------------------------
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_email boolean not null default true,
  date_format text not null default 'DD/MM/YYYY',
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','business_profiles','clients','products','quotes','invoices','subscriptions','usage']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Rule: a row is visible/writable only when user_id = auth.uid().
-- Child tables (items) additionally denormalize user_id so policies stay O(1)
-- (no join needed), which also protects against a bug in the parent join.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.business_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.settings enable row level security;

-- profiles: user can read/update only their own row; insert happens via trigger (see below)
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- generic per-table policy pattern
create policy "business_profiles_all_own" on public.business_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "clients_all_own" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "products_all_own" on public.products
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quotes_all_own" on public.quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quote_items_all_own" on public.quote_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoices_all_own" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invoice_items_all_own" on public.invoice_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
-- NOTE: subscriptions are NEVER writable from the client. Only a server-side
-- Edge Function (using the service role key) may insert/update them, after
-- verifying a real payment-provider webhook. No "with check" write policy
-- is defined here on purpose.

create policy "usage_select_own" on public.usage
  for select using (auth.uid() = user_id);
-- usage is incremented by server-side functions only (same reasoning as subscriptions).

create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 11. New-user bootstrap: create profile + free subscription + settings row
-- automatically when a Supabase Auth user is created.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active');
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 12. Atomic document numbering (prevents duplicate/racing invoice numbers)
-- Call via RPC from the server, never generate numbers in the client.
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

-- This function runs as security definer specifically so the sequence increment
-- is atomic under concurrent requests (two tabs creating invoices at once can't
-- collide) — the row-level UPDATE ... RETURNING serializes on the row lock.
