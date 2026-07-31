create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'client' check (role in ('owner', 'staff', 'client')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  public_url text,
  portal_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  display_name text not null,
  client_type text not null default 'company' check (client_type in ('company', 'person')),
  status text not null default 'active' check (status in ('scouting', 'lead', 'active', 'paused', 'complete', 'cancelled')),
  source text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_portals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'onboarding', 'designing', 'development', 'live', 'maintenance', 'paused')),
  public_slug text not null unique,
  custom_portal_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_portal_members (
  portal_id uuid not null references public.client_portals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'client' check (role in ('owner', 'viewer', 'client')),
  created_at timestamptz not null default now(),
  primary key (portal_id, user_id)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  event_type text not null,
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_clients_updated_at on public.clients;
create trigger touch_clients_updated_at
before update on public.clients
for each row execute function public.touch_updated_at();

drop trigger if exists touch_client_portals_updated_at on public.client_portals;
create trigger touch_client_portals_updated_at
before update on public.client_portals
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('owner', 'staff'), false)
$$;

alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.clients enable row level security;
alter table public.client_portals enable row level security;
alter table public.client_portal_members enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_internal_user());

drop policy if exists "Internal users manage profiles" on public.profiles;
create policy "Internal users manage profiles"
on public.profiles for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Authenticated users can read brands" on public.brands;
create policy "Authenticated users can read brands"
on public.brands for select
to authenticated
using (true);

drop policy if exists "Internal users manage brands" on public.brands;
create policy "Internal users manage brands"
on public.brands for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Internal users manage clients" on public.clients;
create policy "Internal users manage clients"
on public.clients for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Portal members read their client" on public.clients;
create policy "Portal members read their client"
on public.clients for select
to authenticated
using (
  exists (
    select 1
    from public.client_portals cp
    join public.client_portal_members cpm on cpm.portal_id = cp.id
    where cp.client_id = clients.id
      and cpm.user_id = auth.uid()
  )
);

drop policy if exists "Internal users manage portals" on public.client_portals;
create policy "Internal users manage portals"
on public.client_portals for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Portal members read portals" on public.client_portals;
create policy "Portal members read portals"
on public.client_portals for select
to authenticated
using (
  exists (
    select 1
    from public.client_portal_members cpm
    where cpm.portal_id = client_portals.id
      and cpm.user_id = auth.uid()
  )
);

drop policy if exists "Internal users manage portal members" on public.client_portal_members;
create policy "Internal users manage portal members"
on public.client_portal_members for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Portal members read their memberships" on public.client_portal_members;
create policy "Portal members read their memberships"
on public.client_portal_members for select
to authenticated
using (user_id = auth.uid() or public.is_internal_user());

drop policy if exists "Internal users read audit events" on public.audit_events;
create policy "Internal users read audit events"
on public.audit_events for select
to authenticated
using (public.is_internal_user());

drop policy if exists "Internal users create audit events" on public.audit_events;
create policy "Internal users create audit events"
on public.audit_events for insert
to authenticated
with check (public.is_internal_user());

insert into public.brands (slug, name, public_url, portal_url)
values
  ('aquacrm', 'AquaCRM', 'https://aqua-crm.com', 'https://aqua-crm.com/login?brand=aquacrm&next=/portal'),
  ('aquaoasis-web', 'AquaOasis-Web', null, 'https://aqua-crm.com/login?brand=aqua&next=/portal'),
  ('milesymedia', 'Milesymedia', null, null),
  ('zimante-group', 'Zimante Group', null, 'https://aqua-crm.com/login?brand=zimante&next=/portal')
on conflict (slug) do update
set name = excluded.name,
    public_url = excluded.public_url,
    portal_url = excluded.portal_url;
