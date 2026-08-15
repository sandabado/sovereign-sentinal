-- Sovereign household multi-tenancy.
-- Incremental, non-destructive data migration for schemas created by 001/002.

create extension if not exists pgcrypto;

-- Profiles extend auth.users; households are durable UUID-scoped tenants.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'adult' check (role in ('admin', 'adult', 'supervised', 'child')),
  avatar_url text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists email text;
alter table public.user_profiles add column if not exists role text default 'adult';
alter table public.user_profiles add column if not exists avatar_url text;
alter table public.user_profiles add column if not exists onboarding_complete boolean not null default false;
alter table public.user_profiles add column if not exists created_at timestamptz not null default now();
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();

insert into public.user_profiles (id, full_name, email, role, onboarding_complete)
select
  users.id,
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Sovereign Member'
  ),
  coalesce(users.email, ''),
  case
    when users.raw_user_meta_data ->> 'role' in ('admin', 'adult', 'supervised', 'child')
      then users.raw_user_meta_data ->> 'role'
    else 'adult'
  end,
  false
from auth.users as users
on conflict (id) do nothing;

update public.user_profiles
set
  full_name = coalesce(nullif(btrim(full_name), ''), 'Sovereign Member'),
  email = coalesce(email, ''),
  role = case when role in ('admin', 'adult', 'supervised', 'child') then role else 'adult' end,
  onboarding_complete = coalesce(onboarding_complete, false)
where
  full_name is null
  or btrim(full_name) = ''
  or email is null
  or role is null
  or role not in ('admin', 'adult', 'supervised', 'child')
  or onboarding_complete is null;

alter table public.user_profiles alter column full_name set not null;
alter table public.user_profiles alter column email set not null;
alter table public.user_profiles alter column role set default 'adult';
alter table public.user_profiles alter column role set not null;
alter table public.user_profiles alter column onboarding_complete set default false;
alter table public.user_profiles alter column onboarding_complete set not null;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.households add column if not exists name text;
alter table public.households add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.households add column if not exists created_at timestamptz not null default now();
alter table public.households add column if not exists updated_at timestamptz not null default now();

create table if not exists public.household_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'child', 'view_only')),
  permissions jsonb not null default '{"can_see_all": false, "can_edit_finances": false, "can_manage_entities": false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, household_id)
);

alter table public.household_memberships add column if not exists permissions jsonb not null default '{"can_see_all": false, "can_edit_finances": false, "can_manage_entities": false}'::jsonb;
alter table public.household_memberships add column if not exists created_at timestamptz not null default now();
alter table public.household_memberships add column if not exists updated_at timestamptz not null default now();

-- If an earlier draft created membership UUIDs without a households table,
-- preserve those IDs by materializing their missing parent rows first.
insert into public.households (id, name)
select distinct memberships.household_id, 'Household'
from public.household_memberships as memberships
left join public.households as households on households.id = memberships.household_id
where households.id is null
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.household_memberships'::regclass
      and conname = 'household_memberships_household_id_fkey'
  ) then
    alter table public.household_memberships
      add constraint household_memberships_household_id_fkey
      foreign key (household_id) references public.households(id) on delete cascade;
  end if;
end
$$;

-- Existing authenticated users each receive one real household only when they
-- do not already belong to one. No synthetic family members are introduced.
insert into public.households (name, created_by)
select
  coalesce(
    nullif(btrim(profiles.full_name), '') || '''s Household',
    'Sovereign Household'
  ),
  profiles.id
from public.user_profiles as profiles
where not exists (
  select 1
  from public.household_memberships as memberships
  where memberships.user_id = profiles.id
);

insert into public.household_memberships (user_id, household_id, role, permissions)
select
  profiles.id,
  households.id,
  'owner',
  '{"can_see_all": true, "can_edit_finances": true, "can_manage_entities": true}'::jsonb
from public.user_profiles as profiles
join lateral (
  select candidate.id
  from public.households as candidate
  where candidate.created_by = profiles.id
  order by candidate.created_at, candidate.id
  limit 1
) as households on true
where not exists (
  select 1
  from public.household_memberships as memberships
  where memberships.user_id = profiles.id
)
on conflict (user_id, household_id) do nothing;

create index if not exists households_created_by_idx on public.households(created_by);
create index if not exists household_memberships_user_idx on public.household_memberships(user_id);
create index if not exists household_memberships_household_role_idx on public.household_memberships(household_id, role);

-- These helpers execute outside membership RLS so policies never recurse back
-- into household_memberships while deciding whether a row is visible.
create or replace function public.primary_household_id(target_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select memberships.household_id
  from public.household_memberships as memberships
  where memberships.user_id = target_user_id
  order by
    case memberships.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    memberships.created_at,
    memberships.id
  limit 1
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.household_memberships as memberships
    where memberships.household_id = target_household_id
      and memberships.user_id = (select auth.uid())
  )
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.household_memberships as memberships
    where memberships.household_id = target_household_id
      and memberships.user_id = (select auth.uid())
      and memberships.role in ('owner', 'admin')
  )
$$;

create or replace function public.is_household_admin_for_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.household_memberships as mine
    join public.household_memberships as theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and mine.role in ('owner', 'admin')
      and theirs.user_id = target_user_id
  )
$$;

revoke all on function public.primary_household_id(uuid) from public;
revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_admin(uuid) from public;
revoke all on function public.is_household_admin_for_user(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_admin_for_user(uuid) to authenticated;

-- Household scope for user-visible, derived financial records. Plaid items are
-- intentionally excluded because their encrypted credentials remain server-only.
alter table public.entities add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.entities add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.entities add column if not exists shared boolean not null default false;
alter table public.accounts add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.accounts add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.accounts add column if not exists shared boolean not null default false;
alter table public.transactions add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.transactions add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.transactions add column if not exists shared boolean not null default false;
alter table public.debts add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.debts add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.debts add column if not exists shared boolean not null default false;
alter table public.subscriptions add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.subscriptions add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.subscriptions add column if not exists shared boolean not null default false;
alter table public.calendar_events add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.calendar_events add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.calendar_events add column if not exists shared boolean not null default false;
alter table public.investment_holdings add column if not exists owner_id uuid references public.user_profiles(id) on delete set null;
alter table public.investment_holdings add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.investment_holdings add column if not exists shared boolean not null default false;

update public.entities set owner_id = user_id where owner_id is null;
update public.accounts set owner_id = user_id where owner_id is null;
update public.transactions set owner_id = user_id where owner_id is null;
update public.debts set owner_id = user_id where owner_id is null;
update public.subscriptions set owner_id = user_id where owner_id is null;
update public.calendar_events set owner_id = user_id where owner_id is null;
update public.investment_holdings set owner_id = user_id where owner_id is null;

update public.entities set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;
update public.accounts set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;
update public.transactions set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;
update public.debts set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;
update public.subscriptions set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;
update public.calendar_events set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;
update public.investment_holdings set household_id = public.primary_household_id(coalesce(owner_id, user_id)) where household_id is null;

create index if not exists entities_household_owner_idx on public.entities(household_id, owner_id);
create index if not exists entities_household_shared_idx on public.entities(household_id) where shared = true;
create index if not exists accounts_household_owner_idx on public.accounts(household_id, owner_id);
create index if not exists accounts_household_shared_idx on public.accounts(household_id) where shared = true;
create index if not exists transactions_household_owner_date_idx on public.transactions(household_id, owner_id, date desc);
create index if not exists transactions_household_shared_date_idx on public.transactions(household_id, date desc) where shared = true;
create index if not exists debts_household_owner_idx on public.debts(household_id, owner_id);
create index if not exists debts_household_shared_idx on public.debts(household_id) where shared = true;
create index if not exists subscriptions_household_owner_active_idx on public.subscriptions(household_id, owner_id, active);
create index if not exists subscriptions_household_shared_idx on public.subscriptions(household_id) where shared = true;
create index if not exists calendar_events_household_owner_date_idx on public.calendar_events(household_id, owner_id, date desc);
create index if not exists calendar_events_household_shared_date_idx on public.calendar_events(household_id, date desc) where shared = true;
create index if not exists investment_holdings_household_owner_idx on public.investment_holdings(household_id, owner_id);
create index if not exists investment_holdings_household_shared_idx on public.investment_holdings(household_id) where shared = true;

-- Keep older insert paths compatible: rows that still provide only user_id are
-- assigned to that user's profile and primary household before RLS evaluates.
create or replace function public.default_household_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if new.owner_id is null then
    new.owner_id := new.user_id;
  end if;

  if new.household_id is null then
    new.household_id := public.primary_household_id(coalesce(new.owner_id, new.user_id));
  end if;

  if new.household_id is null then
    raise exception 'A household-scoped record requires an active household membership'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.household_memberships as memberships
    where memberships.user_id = new.owner_id
      and memberships.household_id = new.household_id
  ) then
    raise exception 'Record owner must belong to the selected household'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.default_household_scope() from public;

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'entities', 'accounts', 'transactions', 'debts', 'subscriptions',
    'calendar_events', 'investment_holdings'
  ]
  loop
    trigger_name := target_table || '_default_household_scope';
    if not exists (
      select 1
      from pg_trigger
      where tgname = trigger_name
        and tgrelid = format('public.%I', target_table)::regclass
        and not tgisinternal
    ) then
      execute format(
        'create trigger %I before insert or update on public.%I for each row execute function public.default_household_scope()',
        trigger_name,
        target_table
      );
    end if;
  end loop;
end
$$;

create table if not exists public.entity_assignments (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('owner', 'trustee', 'beneficiary', 'authorized_signer', 'member')),
  ownership_percentage numeric(5,2) not null default 100 check (ownership_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, user_id)
);

alter table public.entity_assignments add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.entity_assignments add column if not exists updated_at timestamptz not null default now();

update public.entity_assignments as assignments
set household_id = entities.household_id
from public.entities as entities
where assignments.entity_id = entities.id
  and assignments.household_id is null;

alter table public.entity_assignments alter column household_id set not null;

insert into public.entity_assignments (
  entity_id,
  user_id,
  household_id,
  relationship_type,
  ownership_percentage
)
select entities.id, entities.owner_id, entities.household_id, 'owner', 100
from public.entities as entities
where entities.owner_id is not null
  and entities.household_id is not null
on conflict (entity_id, user_id) do nothing;

create index if not exists entity_assignments_user_idx on public.entity_assignments(user_id);
create index if not exists entity_assignments_household_entity_idx on public.entity_assignments(household_id, entity_id);

create or replace function public.enforce_entity_assignment_household()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  entity_household uuid;
begin
  select entities.household_id
  into entity_household
  from public.entities as entities
  where entities.id = new.entity_id;

  if entity_household is null then
    raise exception 'An entity assignment requires a household-scoped entity'
      using errcode = '23514';
  end if;

  if new.household_id is not null and new.household_id <> entity_household then
    raise exception 'Entity assignment household must match the entity household'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.household_memberships as memberships
    where memberships.user_id = new.user_id
      and memberships.household_id = entity_household
  ) then
    raise exception 'Assigned user must belong to the entity household'
      using errcode = '23514';
  end if;

  new.household_id := entity_household;
  return new;
end;
$$;

revoke all on function public.enforce_entity_assignment_household() from public;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'entity_assignments_enforce_household'
      and tgrelid = 'public.entity_assignments'::regclass
      and not tgisinternal
  ) then
    create trigger entity_assignments_enforce_household
      before insert or update on public.entity_assignments
      for each row execute function public.enforce_entity_assignment_household();
  end if;
end
$$;

-- Signup is atomic and idempotent: profile, one real household, owner membership.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  household uuid;
  display_name text;
begin
  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Sovereign Member'
  );

  insert into public.user_profiles (id, full_name, email, role, onboarding_complete)
  values (
    new.id,
    display_name,
    coalesce(new.email, ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('admin', 'adult', 'supervised', 'child')
        then new.raw_user_meta_data ->> 'role'
      else 'adult'
    end,
    false
  )
  on conflict (id) do nothing;

  select memberships.household_id
  into household
  from public.household_memberships as memberships
  where memberships.user_id = new.id
  order by memberships.created_at, memberships.id
  limit 1;

  if household is null then
    select candidate.id
    into household
    from public.households as candidate
    where candidate.created_by = new.id
    order by candidate.created_at, candidate.id
    limit 1;
  end if;

  if household is null then
    insert into public.households (name, created_by)
    values (display_name || '''s Household', new.id)
    returning id into household;
  end if;

  insert into public.household_memberships (user_id, household_id, role, permissions)
  values (
    new.id,
    household,
    'owner',
    '{"can_see_all": true, "can_edit_finances": true, "can_manage_entities": true}'::jsonb
  )
  on conflict (user_id, household_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user_profile();
  end if;
end
$$;

alter table public.user_profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.entity_assignments enable row level security;

grant select on public.user_profiles to authenticated;
revoke insert, update, delete on public.user_profiles from authenticated;
grant update (full_name, avatar_url, onboarding_complete) on public.user_profiles to authenticated;
grant select, insert, update on public.households to authenticated;
grant select, insert, update, delete on public.household_memberships to authenticated;
grant select, insert, update, delete on public.entity_assignments to authenticated;

-- Encrypted Plaid access tokens are never readable or writable from a browser.
revoke select, insert, update, delete on public.plaid_items from authenticated;
grant select, insert, update, delete on public.plaid_items to service_role;
drop policy if exists "plaid_items_owner" on public.plaid_items;

-- Remove the original single-user policies before introducing household scope.
-- PostgreSQL ORs permissive policies; leaving these in place would let a row's
-- legacy user_id bypass the new owner/household checks on later updates.
drop policy if exists "entities_owner" on public.entities;
drop policy if exists "accounts_owner" on public.accounts;
drop policy if exists "transactions_owner" on public.transactions;
drop policy if exists "debts_owner" on public.debts;
drop policy if exists "subscriptions_owner" on public.subscriptions;
drop policy if exists "holdings_owner" on public.investment_holdings;
drop policy if exists "calendar_events_owner" on public.calendar_events;

do $$
declare
  target_table text;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_own_read') then
    create policy user_profiles_own_read on public.user_profiles for select to authenticated using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_own_insert') then
    create policy user_profiles_own_insert on public.user_profiles for insert to authenticated with check ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_own_update') then
    create policy user_profiles_own_update on public.user_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'user_profiles_household_admin_read') then
    create policy user_profiles_household_admin_read on public.user_profiles for select to authenticated using (public.is_household_admin_for_user(id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households_member_read') then
    create policy households_member_read on public.households for select to authenticated using (public.is_household_member(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households_create') then
    create policy households_create on public.households for insert to authenticated with check (created_by = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households_admin_update') then
    create policy households_admin_update on public.households for update to authenticated using (public.is_household_admin(id)) with check (public.is_household_admin(id));
  end if;

  -- Repair the recursive policy from the original draft in-place when present.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_memberships' and policyname = 'household_read') then
    alter policy household_read on public.household_memberships
      using ((select auth.uid()) = user_id or public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_memberships' and policyname = 'household_memberships_read') then
    create policy household_memberships_read on public.household_memberships for select to authenticated
      using ((select auth.uid()) = user_id or public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_memberships' and policyname = 'household_memberships_admin_insert') then
    create policy household_memberships_admin_insert on public.household_memberships for insert to authenticated
      with check (public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_memberships' and policyname = 'household_memberships_admin_update') then
    create policy household_memberships_admin_update on public.household_memberships for update to authenticated
      using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'household_memberships' and policyname = 'household_memberships_admin_delete') then
    create policy household_memberships_admin_delete on public.household_memberships for delete to authenticated
      using (public.is_household_admin(household_id));
  end if;

  -- Repair the draft's globally permissive assignment policy when present.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entity_assignments' and policyname = 'entity_assignment_read') then
    alter policy entity_assignment_read on public.entity_assignments
      using ((select auth.uid()) = user_id or public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entity_assignments' and policyname = 'entity_assignments_read') then
    create policy entity_assignments_read on public.entity_assignments for select to authenticated
      using ((select auth.uid()) = user_id or public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entity_assignments' and policyname = 'entity_assignments_admin_write') then
    create policy entity_assignments_admin_write on public.entity_assignments for all to authenticated
      using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));
  end if;

  foreach target_table in array array[
    'entities', 'accounts', 'transactions', 'debts', 'subscriptions', 'investment_holdings'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target_table and policyname = target_table || '_profile_owner'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and public.is_household_member(household_id))',
        target_table || '_profile_owner',
        target_table
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target_table and policyname = target_table || '_household_admin'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id))',
        target_table || '_household_admin',
        target_table
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target_table and policyname = target_table || '_household_shared_read'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (shared and public.is_household_member(household_id))',
        target_table || '_household_shared_read',
        target_table
      );
    end if;
  end loop;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar_events_profile_owner') then
    create policy calendar_events_profile_owner on public.calendar_events for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()) and public.is_household_member(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar_events_household_admin') then
    create policy calendar_events_household_admin on public.calendar_events for all to authenticated
      using (public.is_household_admin(household_id))
      with check (public.is_household_admin(household_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar_events_household_shared_read') then
    create policy calendar_events_household_shared_read on public.calendar_events for select to authenticated
      using (shared and public.is_household_member(household_id));
  end if;
end
$$;

-- Guard every Realtime publication mutation so re-running this migration is safe.
do $$
declare
  target_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach target_table in array array[
    'households', 'user_profiles', 'household_memberships', 'entity_assignments', 'entities'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end
$$;
