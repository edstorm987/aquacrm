create table if not exists public.brand_enquiries (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references public.brands(slug) on delete restrict,
  name text not null,
  email text not null,
  phone text,
  contact_method text,
  services text[] not null default '{}',
  message text,
  source_url text,
  campaign text,
  consent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_datastores (
  app_key text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_app_datastores_updated_at on public.app_datastores;
create trigger touch_app_datastores_updated_at
before update on public.app_datastores
for each row execute function public.touch_updated_at();

alter table public.brand_enquiries enable row level security;
alter table public.app_datastores enable row level security;

drop policy if exists "Public can create consented brand enquiries" on public.brand_enquiries;
create policy "Public can create consented brand enquiries"
on public.brand_enquiries for insert
to anon, authenticated
with check (
  consent = true
  and length(trim(name)) > 1
  and position('@' in email) > 1
);

drop policy if exists "Internal users manage brand enquiries" on public.brand_enquiries;
create policy "Internal users manage brand enquiries"
on public.brand_enquiries for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "Internal users manage app datastores" on public.app_datastores;
create policy "Internal users manage app datastores"
on public.app_datastores for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

insert into public.app_datastores (app_key, data)
values
  ('lucid-app', '{}'::jsonb),
  ('lucid-public-login', '{"accounts":[],"sessions":{}}'::jsonb),
  ('lucid-public-profile', '{"profiles":[],"enquiries":[],"orders":[],"emailLeads":[]}'::jsonb)
on conflict (app_key) do nothing;
