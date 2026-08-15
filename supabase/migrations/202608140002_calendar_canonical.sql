create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_key text,
  plaid_transaction_id text,
  date date not null,
  end_date date,
  title text not null,
  description text,
  amount numeric(15,2) not null,
  event_type text not null check (event_type in ('income','bill','debt_payment','subscription','transfer','investment','tax','custom')),
  status text not null default 'scheduled' check (status in ('scheduled','pending','posted','missed','paid')),
  recurrence text not null default 'one_time' check (recurrence in ('one_time','daily','weekly','bi_weekly','semi_monthly','monthly','quarterly','semi_annually','annually')),
  recurrence_day integer check (recurrence_day is null or recurrence_day between 1 and 31),
  entity_id uuid references public.entities(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  source text not null default 'manual' check (source in ('plaid','manual','csv','detected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_key),
  unique (plaid_transaction_id)
);

create index if not exists calendar_events_user_date_idx on public.calendar_events(user_id, date desc);
create index if not exists calendar_events_user_recurrence_idx on public.calendar_events(user_id, recurrence);
create index if not exists calendar_events_user_status_idx on public.calendar_events(user_id, status);

alter table public.calendar_events enable row level security;
grant select, insert, update, delete on public.calendar_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar_events_owner'
  ) then
    create policy "calendar_events_owner" on public.calendar_events
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_events'
  ) then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end $$;

create or replace function public.set_calendar_event_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'calendar_events_set_updated_at'
      and tgrelid = 'public.calendar_events'::regclass
  ) then
    create trigger calendar_events_set_updated_at
      before update on public.calendar_events
      for each row execute function public.set_calendar_event_updated_at();
  end if;
end $$;
