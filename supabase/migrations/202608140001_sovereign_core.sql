-- Sovereign core schema: Supabase Auth + RLS + Plaid sync + Realtime.
-- This migration is intentionally non-destructive. Do not add DROP TABLE statements.

create extension if not exists pgcrypto;

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'personal' check (type in ('personal','family_llc','business_llc','trust','holding_co')),
  ein text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  access_token_encrypted text not null,
  institution_id text,
  institution_name text,
  status text not null default 'active' check (status in ('active','needs_reauth','revoked','deleted')),
  transaction_cursor text,
  error_message text,
  last_success_sync timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  plaid_item_id uuid references public.plaid_items(id) on delete cascade,
  plaid_account_id text,
  name text not null,
  mask text,
  institution text,
  type text not null default 'other' check (type in ('checking','savings','credit','investment','loan','mortgage','ira','hysa','crypto','other')),
  status text not null default 'active' check (status in ('active','inactive','closed')),
  balance numeric(15,2) not null default 0,
  previous_balance numeric(15,2) not null default 0,
  apr numeric(7,4),
  credit_limit numeric(15,2),
  min_payment numeric(15,2),
  monthly_payment numeric(15,2),
  plaid_last_sync timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plaid_account_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  plaid_transaction_id text,
  date date not null,
  description text not null default 'Unknown transaction',
  amount numeric(15,2) not null,
  category text not null default 'UNCATEGORIZED',
  subcategory text,
  is_recurring boolean not null default false,
  pending boolean not null default false,
  source text not null default 'manual' check (source in ('plaid','manual','csv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plaid_transaction_id)
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  name text not null,
  type text not null check (type in ('mortgage','auto','student','credit_card','personal_loan','business_loan','heloc','tax_debt')),
  balance numeric(15,2) not null,
  original_balance numeric(15,2),
  apr numeric(7,4) not null,
  min_payment numeric(15,2) not null default 0,
  actual_payment numeric(15,2) not null default 0,
  payoff_strategy text not null default 'avalanche' check (payoff_strategy in ('avalanche','snowball','blizzard','minimum')),
  personal_guarantee boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  detection_key text,
  amount numeric(15,2) not null,
  previous_amount numeric(15,2),
  frequency text not null default 'monthly' check (frequency in ('weekly','monthly','annual')),
  category text,
  active boolean not null default true,
  next_billing_date date,
  last_charged_date date,
  overlap_group text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, detection_key)
);

create table if not exists public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_account_id text not null,
  security_id text not null,
  ticker text,
  name text not null,
  type text,
  quantity numeric(20,8) not null default 0,
  price numeric(20,8) not null default 0,
  value numeric(15,2) not null default 0,
  cost_basis numeric(15,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plaid_account_id, security_id)
);

create index if not exists entities_user_idx on public.entities(user_id);
create index if not exists plaid_items_user_status_idx on public.plaid_items(user_id, status);
create index if not exists accounts_user_updated_idx on public.accounts(user_id, updated_at desc);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date desc);
create index if not exists debts_user_idx on public.debts(user_id);
create index if not exists subscriptions_user_active_idx on public.subscriptions(user_id, active);
create index if not exists holdings_user_idx on public.investment_holdings(user_id);

alter table public.entities enable row level security;
alter table public.plaid_items enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.investment_holdings enable row level security;

grant select, insert, update, delete on public.entities, public.plaid_items, public.accounts, public.transactions, public.debts, public.subscriptions, public.investment_holdings to authenticated;

create policy "entities_owner" on public.entities for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plaid_items_owner" on public.plaid_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts_owner" on public.accounts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_owner" on public.transactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "debts_owner" on public.debts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "subscriptions_owner" on public.subscriptions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "holdings_owner" on public.investment_holdings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts') then alter publication supabase_realtime add table public.accounts; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions') then alter publication supabase_realtime add table public.transactions; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debts') then alter publication supabase_realtime add table public.debts; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscriptions') then alter publication supabase_realtime add table public.subscriptions; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'investment_holdings') then alter publication supabase_realtime add table public.investment_holdings; end if;
end $$;
