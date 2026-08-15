-- Sovereign production hardening primitives.
-- Durable controls only: no raw webhook bodies, tokens, balances, or secrets.

create extension if not exists pgcrypto;

create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
  hashed_key text;
  current_count integer;
  current_window timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_scope !~ '^[a-z0-9_]{1,64}$' or p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit configuration' using errcode = '22023';
  end if;

  hashed_key := encode(extensions.digest(convert_to(caller_id::text || ':' || p_scope, 'UTF8'), 'sha256'), 'hex');

  insert into public.api_rate_limits as limits (rate_key, window_started_at, request_count, updated_at)
  values (hashed_key, now(), 1, now())
  on conflict (rate_key) do update
  set
    window_started_at = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then now()
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1
      else least(limits.request_count + 1, p_limit + 1)
    end,
    updated_at = now()
  returning limits.request_count, limits.window_started_at
  into current_count, current_window;

  allowed := current_count <= p_limit;
  remaining := greatest(p_limit - current_count, 0);
  retry_after := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (current_window + make_interval(secs => p_window_seconds) - now())))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z0-9_.-]{1,80}$'),
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists security_audit_events_user_created_idx on public.security_audit_events(user_id, created_at desc);
create index if not exists security_audit_events_type_created_idx on public.security_audit_events(event_type, created_at desc);
alter table public.security_audit_events enable row level security;
revoke all on public.security_audit_events from public, anon, authenticated;
grant select on public.security_audit_events to authenticated;
grant select, insert, update, delete on public.security_audit_events to service_role;

drop policy if exists security_audit_events_own_read on public.security_audit_events;
create policy security_audit_events_own_read
  on public.security_audit_events for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z0-9_.-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 1000),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) between 1 and 160),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create unique index if not exists notifications_unread_dedupe_idx
  on public.notifications(user_id, dedupe_key)
  where read_at is null and dedupe_key is not null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_own_mark_read on public.notifications;
create policy notifications_own_mark_read
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.plaid_webhook_receipts (
  signature_hash text primary key check (signature_hash ~ '^[0-9a-f]{64}$'),
  item_id text,
  webhook_type text not null check (char_length(webhook_type) between 1 and 80),
  webhook_code text not null check (char_length(webhook_code) between 1 and 100),
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  last_error_code text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists plaid_webhook_receipts_status_updated_idx on public.plaid_webhook_receipts(status, updated_at);
alter table public.plaid_webhook_receipts enable row level security;
revoke all on public.plaid_webhook_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.plaid_webhook_receipts to service_role;

create unique index if not exists plaid_items_item_id_unique_idx on public.plaid_items(item_id);
