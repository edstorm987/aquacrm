-- brand_enquiries: give the tenant a real column.
--
-- Until now every brand_enquiries row routed by `metadata->>'agencyId'` — a
-- JSON key RLS cannot index or scope on, and one that several code paths
-- rewrite wholesale. This migration adds a first-class `agency_id` column so
-- policies can finally scope the table by tenant.
--
-- ⚠ NOT applied automatically. Ed applies this by hand with `supabase db push`
--   (see supabase/README.md), then re-runs `supabase/rls-verify.sql` in the
--   SQL editor. The portal code is written to work BOTH before and after this
--   is applied: inserts try the column first and gracefully retry without it
--   while the schema catches up (src/lib/supabase/enquiryAgencyColumn.ts).
--
-- Backfill default: 'milesymedia' — the founder agency's id (agency ids are
-- the app's slugs, so this value is deterministic; see
-- portal/src/lib/server/seeds/founderSeed.ts FOUNDER_AGENCY_SLUG). Every
-- pre-existing row is Ed's own pre-launch data, so the founder agency is the
-- correct owner for anything that never recorded metadata.agencyId.
--
-- The trigger keeps the column filled even when a writer only stamps
-- metadata.agencyId (older app versions, manual dashboard edits), and the
-- policy is a RATCHET: while profiles.agency_id is null for everyone the
-- behaviour is exactly today's (internal users manage everything); stamping an
-- agency onto a profile scopes that user down without any further SQL.

-- 1) The column. Text, not uuid: agency ids are the portal's own slug ids
--    (e.g. 'milesymedia'), not Supabase uuids.
alter table public.brand_enquiries
  add column if not exists agency_id text;

-- 2) Backfill: prefer what the row already recorded, else the founder agency.
update public.brand_enquiries
set agency_id = coalesce(nullif(trim(metadata->>'agencyId'), ''), 'milesymedia')
where agency_id is null or length(trim(agency_id)) = 0;

-- 3) Keep it filled without requiring every writer to know about the column.
--    Explicit agency_id always wins; metadata is the fallback; the founder
--    agency is the default of last resort (pre-launch, it owns everything).
create or replace function public.brand_enquiries_default_agency()
returns trigger
language plpgsql
as $$
begin
  if new.agency_id is null or length(trim(new.agency_id)) = 0 then
    new.agency_id := coalesce(nullif(trim(new.metadata->>'agencyId'), ''), 'milesymedia');
  end if;
  return new;
end;
$$;

drop trigger if exists set_brand_enquiries_agency on public.brand_enquiries;
create trigger set_brand_enquiries_agency
before insert or update on public.brand_enquiries
for each row execute function public.brand_enquiries_default_agency();

-- 4) The inbox lists newest-first per agency; give that path an index.
create index if not exists brand_enquiries_agency_id_idx
  on public.brand_enquiries (agency_id, created_at desc);

-- 5) The user side of the tenancy comparison. profiles has no agency link at
--    all today, so a tenant policy had nothing to compare against. Nullable on
--    purpose: null = unscoped (today's behaviour for every existing profile).
alter table public.profiles
  add column if not exists agency_id text;

-- Same shape as current_profile_role()/is_internal_user(): security definer
-- with a pinned search_path, so RLS on profiles does not recurse.
create or replace function public.current_profile_agency_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(agency_id), '') from public.profiles where id = auth.uid()
$$;

-- 6) The matching policy. Replaces the flat internal-users policy with an
--    agency-aware one. Null-tolerant on BOTH sides so it tightens as data is
--    stamped rather than breaking the day it is applied:
--      - profile unscoped (agency_id null)  → sees everything, as today;
--      - row unscoped (pre-trigger rows)    → visible to all internal users;
--      - both stamped                       → they must match.
drop policy if exists "Internal users manage brand enquiries" on public.brand_enquiries;
drop policy if exists "Internal users manage their agency's brand enquiries" on public.brand_enquiries;
create policy "Internal users manage their agency's brand enquiries"
on public.brand_enquiries for all
to authenticated
using (
  public.is_internal_user()
  and (
    public.current_profile_agency_id() is null
    or agency_id is null
    or agency_id = public.current_profile_agency_id()
  )
)
with check (
  public.is_internal_user()
  and (
    public.current_profile_agency_id() is null
    or agency_id is null
    or agency_id = public.current_profile_agency_id()
  )
);
