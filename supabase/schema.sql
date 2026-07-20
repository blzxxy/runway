-- =============================================================
-- Runway v2 — Supabase schema
-- Paste this whole file into the Supabase SQL Editor and Run.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_cash numeric not null default 0,
  weekly_budget numeric not null default 80,
  alloc_ring numeric not null default 1200,
  alloc_emergency numeric not null default 300,
  alloc_flex numeric not null default 218,
  school_due_date date,
  school_amount numeric,
  ring_diamond_cost numeric not null default 600,
  ring_setting_cost numeric not null default 1400,
  emergency_target numeric not null default 450,
  notify_payday boolean not null default true,
  notify_school boolean not null default true,
  notify_budget boolean not null default true,
  notify_ring boolean not null default true,
  ring_milestone_notified boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- transactions ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','flip-buy','flip-sell','savings','ring-purchase')),
  amount numeric not null check (amount >= 0),
  date date not null,
  category text,
  note text,
  target text check (target is null or target in ('ring','emergency','house')),
  flip_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date on public.transactions (user_id, date);

-- ---------- flips ----------
create table if not exists public.flips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  qty integer not null default 1 check (qty > 0),
  buy_price numeric not null default 0,
  buy_date date,
  list_price numeric,
  listed_at date,
  sold_price numeric,
  sold_date date,
  shipping numeric not null default 11,
  fees_paid numeric,
  payout numeric,
  expected_payout_date date,
  status text not null default 'owned'
    check (status in ('planned','preordered','owned','listed','sold','paid_out')),
  prepaid boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists flips_user on public.flips (user_id);

-- ---------- events ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  label text not null,
  amount numeric not null,
  category text,
  status text not null default 'pending' check (status in ('pending','actual','dismissed')),
  tx_id uuid,
  recurring_rule text check (recurring_rule is null or recurring_rule in ('biweekly','monthly')),
  recurring_source_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists events_user_date on public.events (user_id, date);

-- ---------- push subscriptions ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.flips enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own profiles" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own flips" on public.flips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own events" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.flips;
alter publication supabase_realtime add table public.events;
