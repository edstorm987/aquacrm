create table if not exists public.website_consent_events (
  id uuid primary key default gen_random_uuid(),
  brand_slug text references public.brands(slug) on delete set null,
  site_key text not null,
  property_id text not null,
  anonymous_id text,
  necessary boolean not null default true,
  preferences boolean not null default false,
  analytics boolean not null default false,
  marketing boolean not null default false,
  consent_version integer not null default 1,
  source text not null default 'cookie-banner',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists website_consent_events_site_created_idx
  on public.website_consent_events (site_key, created_at desc);

create index if not exists website_consent_events_brand_created_idx
  on public.website_consent_events (brand_slug, created_at desc);

alter table public.website_consent_events enable row level security;

drop policy if exists "Internal users manage website consent events" on public.website_consent_events;
create policy "Internal users manage website consent events"
on public.website_consent_events for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

comment on table public.website_consent_events is
  'Auditable website cookie and telemetry choices captured by the Aqua Tag collector. Public browsers cannot query this table directly.';

comment on column public.website_consent_events.anonymous_id is
  'Random browser identifier created only after a visitor saves a cookie choice.';
