-- Forward-only corrective migration — brand_enquiries fully server-mediated.
--
-- CONTEXT. The merged assume-breach containment migration (20260908210000)
-- revoked authenticated SELECT/UPDATE/DELETE on public.brand_enquiries but KEPT
-- anon/authenticated INSERT ("consented public INSERT"). Two problems surfaced
-- in the production-gate review:
--
--   1. The internal portal enquiry routes still read/updated/deleted
--      brand_enquiries through the signed-in user's SCOPED (authenticated, RLS)
--      client, which 20260908210000 revokes — so applying that migration alone
--      would break live enquiry management (list, status, reply, classify,
--      lead, communications, calls, recording, erase).
--   2. The kept anon/authenticated INSERT is unnecessary: EVERY public capture
--      path is already server-mediated and rate-limited — the site forms and
--      the Aqua tag POST to /api/public/brand-enquiry and /api/public/form-
--      capture, which INSERT via the service-role admin client. No browser code
--      inserts into brand_enquiries directly (verified: the only
--      `.from("brand_enquiries").insert` sites are those two server routes).
--
-- THE ARCHITECTURE (one consistent choice): brand_enquiries is SERVER-MEDIATED.
-- Browser roles (anon, authenticated) have NO direct table access of any kind.
-- Internal routes were converted to a single service-role data client
-- (src/lib/supabase/enquiryDataClient.ts) with tenant ownership enforced IN
-- SERVER CODE (loadOwnedEnquiry / enquiryBelongsToAgency / loadActorWebsiteEnquiry
-- against the caller's session agencyId) — never by RLS. This eliminates the
-- null-fail-open policy hazard entirely: there is no browser-role policy left to
-- fail open.
--
-- SAFETY. Forward-only and idempotent (safe whether or not 20260908210000 has
-- been applied anywhere). Revokes ALL first, then grants the exact intended
-- privilege. Ends with a comprehensive privilege audit (all seven table
-- privileges, sequences, the trigger function, and policy roles — not CRUD
-- alone) that RAISES if any browser-role path survives. LOCAL/OWNER-APPLIED
-- ONLY — never run against a remote database as part of this work.

begin;

-- ── 0. Destructive-privilege residue on the read-only content tables ─────────
-- FINDING (surfaced by the strengthened all-seven-privilege verification):
-- 20260908210000 hardened the read-only content tables with
-- `revoke insert, update, delete` — which leaves TRUNCATE, REFERENCES and
-- TRIGGER in place. Because the cloud project historically granted ALL to
-- anon/authenticated, those three privileges REMAINED: anon could TRUNCATE
-- public.brands (and shoots/shoot_photos), and authenticated could TRUNCATE
-- profiles/clients/portals. TRUNCATE is a destructive capability that "revoke
-- CRUD" never removed. Fix it the correct way — revoke ALL, then grant the
-- exact SELECT each table is meant to expose.

-- Public-site content: anon + authenticated may read.
revoke all on table public.brands, public.shoots, public.shoot_photos from public, anon, authenticated;
grant select on table public.brands, public.shoots, public.shoot_photos to anon, authenticated;

-- Own-row / membership-scoped: authenticated may read (row policies already scope it).
revoke all on table public.profiles, public.clients, public.client_portals, public.client_portal_members
  from public, anon, authenticated;
grant select on table public.profiles, public.clients, public.client_portals, public.client_portal_members
  to authenticated;

-- Re-assert full service-role CRUD (idempotent).
grant select, insert, update, delete on table
  public.brands, public.shoots, public.shoot_photos,
  public.profiles, public.clients, public.client_portals, public.client_portal_members
  to service_role;

-- ── 1. brand_enquiries: revoke ALL browser-role privileges (incl. the base's INSERT) ──
revoke all on table public.brand_enquiries from public, anon, authenticated;

-- 2. Drop EVERY policy that targets a browser role — by role membership, so a
--    renamed or dashboard-created permissive policy is caught too, not only the
--    two names 20260908210000 knew about.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'brand_enquiries'
      and (roles && array['anon','authenticated','public']::name[])
  loop
    execute format('drop policy if exists %I on public.brand_enquiries', pol.policyname);
  end loop;
end $$;

-- 3. Grant the exact intended privileges: service_role only.
grant select, insert, update, delete on table public.brand_enquiries to service_role;

-- 4. Trigger-function hygiene (idempotent on partial stacks).
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'brand_enquiries_default_agency') then
    revoke execute on function public.brand_enquiries_default_agency() from public, anon, authenticated;
  end if;
end $$;

-- 5. Self-verification — fail loudly if any browser-role path survived.
do $$
declare
  offending text;
begin
  -- 5a. No browser-role TABLE privilege of ANY kind (SELECT/INSERT/UPDATE/
  --     DELETE/TRUNCATE/REFERENCES/TRIGGER). anon/authenticated inherit PUBLIC,
  --     so checking them also catches a stray grant to PUBLIC.
  select string_agg(r.role || ':' || p.priv, ', ') into offending
  from (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  where has_table_privilege(r.role, 'public.brand_enquiries', p.priv);
  if offending is not null then
    raise exception 'brand_enquiries server-mediation failed: browser-role table privilege survived: %', offending;
  end if;

  -- 5b. service_role keeps full CRUD (the server-mediated path depends on it).
  if not (has_table_privilege('service_role', 'public.brand_enquiries', 'SELECT')
      and has_table_privilege('service_role', 'public.brand_enquiries', 'INSERT')
      and has_table_privilege('service_role', 'public.brand_enquiries', 'UPDATE')
      and has_table_privilege('service_role', 'public.brand_enquiries', 'DELETE')) then
    raise exception 'brand_enquiries server-mediation failed: service_role lost a CRUD privilege';
  end if;

  -- 5c. No sequence owned by a brand_enquiries column is browser-accessible.
  select string_agg(s.relname || ':' || r.role, ', ') into offending
  from pg_class s
  join pg_depend d on d.objid = s.oid and d.deptype = 'a'
  join pg_class t on t.oid = d.refobjid
  join pg_namespace n on n.oid = t.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(role)
  where s.relkind = 'S' and n.nspname = 'public' and t.relname = 'brand_enquiries'
    and (has_sequence_privilege(r.role, s.oid, 'USAGE')
      or has_sequence_privilege(r.role, s.oid, 'SELECT')
      or has_sequence_privilege(r.role, s.oid, 'UPDATE'));
  if offending is not null then
    raise exception 'brand_enquiries server-mediation failed: browser-role sequence privilege survived: %', offending;
  end if;

  -- 5d. No permissive policy targets a browser role any more (defence in depth:
  --     even if a GRANT were re-added by hand, no policy should let it through).
  select string_agg(policyname, ', ') into offending
  from pg_policies
  where schemaname = 'public' and tablename = 'brand_enquiries'
    and (roles && array['anon','authenticated','public']::name[]);
  if offending is not null then
    raise exception 'brand_enquiries server-mediation failed: browser-role policy survives: %', offending;
  end if;

  -- 5e. The default-agency trigger function is not browser-executable.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'brand_enquiries_default_agency')
     and (has_function_privilege('anon', 'public.brand_enquiries_default_agency()', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.brand_enquiries_default_agency()', 'EXECUTE')) then
    raise exception 'brand_enquiries server-mediation failed: browser role can execute the default-agency trigger fn';
  end if;

  -- 5f. The read-only content tables expose SELECT ONLY to browser roles — no
  --     write and, crucially, no TRUNCATE/REFERENCES/TRIGGER (the residue this
  --     migration removes).
  select string_agg(t.tbl || ':' || r.role || ':' || p.priv, ', ') into offending
  from (values ('public.brands'), ('public.shoots'), ('public.shoot_photos'),
               ('public.profiles'), ('public.clients'), ('public.client_portals'),
               ('public.client_portal_members')) as t(tbl)
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'),
                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv);
  if offending is not null then
    raise exception 'read-only content table has a non-SELECT browser privilege: %', offending;
  end if;
end $$;

commit;
