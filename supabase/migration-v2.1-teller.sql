-- =============================================================
-- Runway v2.1 migration: Teller bank sync
-- For EXISTING deployments: paste this into the Supabase SQL
-- Editor and Run. (Fresh installs: just run schema.sql instead,
-- it already includes all of this.)
-- =============================================================

-- transactions: teller import fields
alter table public.transactions
  add column if not exists source text not null default 'manual'
    check (source in ('manual','teller'));
alter table public.transactions add column if not exists teller_id text;
alter table public.transactions add column if not exists account_id uuid;
create unique index if not exists transactions_teller_id on public.transactions (teller_id)
  where teller_id is not null;

-- profiles: teller notification pref
alter table public.profiles add column if not exists notify_teller boolean not null default true;

-- bank accounts
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  teller_enrollment_id text not null,
  teller_account_id text not null unique,
  name text not null,
  type text not null default 'checking' check (type in ('checking','savings')),
  last_balance numeric,
  last_synced_at timestamptz,
  access_token_encrypted text not null,
  last_error text,
  needs_reauth boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
create policy "own bank accounts" on public.bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- categorization rules
create table if not exists public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_field text not null default 'merchant' check (match_field in ('merchant','note','amount')),
  match_pattern text not null,
  category text not null,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);
alter table public.category_rules enable row level security;
create policy "own category rules" on public.category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- realtime
alter publication supabase_realtime add table public.bank_accounts;
