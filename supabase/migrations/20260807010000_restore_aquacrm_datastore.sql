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

alter table public.app_datastores enable row level security;

drop policy if exists "Internal users manage app datastores" on public.app_datastores;
create policy "Internal users manage app datastores"
on public.app_datastores for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

comment on table public.app_datastores is
  'Private application state. Service-role access is used by AquaCRM server storage.';

insert into public.app_datastores (app_key, data)
values ('aquacrm-portal-state', '{}'::jsonb)
on conflict (app_key) do nothing;

update public.brands
set portal_url = 'https://aqua-crm.com/login?next=/portal'
where slug = 'aquacrm';
