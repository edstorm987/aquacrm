-- ============================================================================
-- 20260908210000_assume_breach_containment.sql
--
-- Phase 0-A of the assume-breach containment programme: remove every browser-
-- role (anon / authenticated) path into cross-tenant application state, and
-- make the datastore, profiles, storage and enquiry surfaces default-deny.
--
-- WHY (verified against the chain on 2026-09-08, base c89e7959):
--   • public.app_datastores holds the ENTIRE multi-tenant PortalState blob.
--     20260731131500 + 20260807010000 gave `authenticated` a FOR ALL policy
--     gated only on is_internal_user() — i.e. ANY owner/staff profile of ANY
--     ecosystem application could read and rewrite every tenant's data over
--     PostgREST, bypassing all application access control. 20260903120000
--     then wrote that inherited grant down explicitly. The portal itself
--     talks to this table exclusively with the service-role key (there is no
--     browser Supabase client anywhere in portal/src — verified by grep).
--   • storage.objects: 20260731134500 let every internal user manage EVERY
--     bucket of EVERY application (aquacrm/aquaoasis-web/milesymedia/
--     zimante × public+uploads), and let any authenticated user write a
--     personal folder in all four apps' upload buckets.
--   • profiles: any staff user could UPDATE any profile row — including
--     promoting their own role to 'owner' (the is_internal_user() FOR ALL
--     policy checks the CURRENT role, not the written one).
--   • brand_enquiries: the 20260820150000 "ratchet" policy fails OPEN when
--     either side's agency_id is null — which is the live steady state.
--   • audit_events: every internal user could read the whole cross-agency
--     audit log and INSERT arbitrary events.
--
-- SIBLING-APPLICATION COMPATIBILITY (checked in the Personal EcoSystem tree,
-- 2026-09-08): the only sibling code that uses a browser-role Supabase client
-- is milesymedia/website/app/lib/portal-auth.ts, which signs in with the anon
-- key and reads ITS OWN profile row (full_name, role). That path keeps
-- working through the own-row SELECT policy below. aquaoasis-web, zimante and
-- edward-hallam.com contain no Supabase table/storage calls at all; sibling
-- content management uses the service-role key (per 20260903120000's own
-- notes). Public-site reads (brands / shoots / shoot_photos / public storage
-- buckets) and the anonymous consented contact-form INSERT are preserved
-- byte-for-byte.
--
-- FORWARD-ONLY + IDEMPOTENT: this file only REVOKEs, DROPs POLICY IF EXISTS,
-- re-CREATEs narrower policies and restates service-role grants. It never
-- rewrites an earlier migration, and re-running it is a no-op. It ends with a
-- self-verification block that RAISES if any broad path survived, so applying
-- it IS the first regression test.
--
-- NOT applied to any remote database by the author. Ed applies it with
-- `supabase db push` after review (supabase/README.md), then re-runs
-- supabase/rls-verify.sql.
-- ============================================================================

-- ─── 1. app_datastores: service-role only ───────────────────────────────────
-- The portal's server storage (service_role, BYPASSRLS) is the ONLY intended
-- reader/writer. No browser role retains any verb or any policy.

drop policy if exists "Internal users manage app datastores" on public.app_datastores;

revoke all on table public.app_datastores from public, anon, authenticated;
grant select, insert, update, delete on table public.app_datastores to service_role;

comment on table public.app_datastores is
  'Private application state. SERVICE-ROLE ONLY: no anon/authenticated policy or grant may ever be added here — this table holds every tenant''s PortalState (assume-breach containment, 20260908210000).';

-- app_datastore_history / patch functions were already service-role-only
-- (20260809090000); restate the critical ones so a rebuilt project matches.
revoke all on table public.app_datastore_history from public, anon, authenticated;

-- ─── 2. profiles: own-row read only ─────────────────────────────────────────
-- Staff administration happens through server-authorised portal routes using
-- the service role. The browser role keeps exactly what the milesymedia login
-- needs: SELECT of the caller's own row. No browser-role writes at all — the
-- old FOR ALL policy let any staff account rewrite any profile, including
-- self-promotion to 'owner'.

drop policy if exists "Internal users manage profiles" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

-- `REVOKE ALL` is intentional. The live project's inherited defaults include
-- TRUNCATE / REFERENCES / TRIGGER as well as CRUD, and TRUNCATE bypasses RLS.
-- Revoking only DML would therefore leave a table-wide destructive browser
-- capability behind while the policy checks below appeared green.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

-- ─── 3. Public website content: read-only for browser roles ────────────────
-- brands / shoots / shoot_photos are public-site content, managed exclusively
-- with the service-role key. Public read stays; browser-role writes go.

drop policy if exists "Internal users manage brands" on public.brands;
drop policy if exists "Authenticated users can read brands" on public.brands; -- redundant with the public policy
drop policy if exists "Internal users manage shoots" on public.shoots;
drop policy if exists "Internal users manage shoot photos" on public.shoot_photos;

revoke all on table
  public.brands, public.shoots, public.shoot_photos
from public, anon, authenticated;
grant select on table public.brands, public.shoots, public.shoot_photos to anon, authenticated;
grant select, insert, update, delete on table
  public.brands, public.shoots, public.shoot_photos
to service_role;

-- ─── 4. Legacy client/portal tables: membership reads only ─────────────────
-- The portal keeps its real tenant data in app_datastores; these uuid tables
-- are the original Supabase-native schema. Membership-scoped SELECTs remain
-- (they are already tenant-scoped by construction); the internal-manage
-- FOR ALL policies and every browser-role write verb go.

drop policy if exists "Internal users manage clients" on public.clients;
drop policy if exists "Internal users manage portals" on public.client_portals;
drop policy if exists "Internal users manage portal members" on public.client_portal_members;
drop policy if exists "Portal members read their memberships" on public.client_portal_members;
create policy "Portal members read their memberships"
on public.client_portal_members for select
to authenticated
using (user_id = auth.uid());

revoke all on table
  public.clients, public.client_portals, public.client_portal_members
from public, anon, authenticated;
grant select on table public.clients, public.client_portals, public.client_portal_members to authenticated;
grant select, insert, update, delete on table
  public.clients, public.client_portals, public.client_portal_members
to service_role;

-- ─── 5. audit_events: service-role only ────────────────────────────────────
-- The audit log must not be readable or writable by any browser role: reads
-- exposed the whole cross-agency history to any staff account, and INSERT let
-- any staff account plant records. The portal writes audit entries through
-- the service role.

drop policy if exists "Internal users read audit events" on public.audit_events;
drop policy if exists "Internal users create audit events" on public.audit_events;

revoke all on table public.audit_events from public, anon, authenticated;
grant select, insert, update, delete on table public.audit_events to service_role;

-- ─── 6. brand_enquiries: anonymous consented INSERT only ───────────────────
-- The null-fail-open "ratchet" manage policy goes entirely. Enquiry triage
-- happens in the portal (service role). The public contact-form INSERT path —
-- consent required, name and email shape enforced — is preserved for both
-- anon and authenticated visitors.

drop policy if exists "Internal users manage brand enquiries" on public.brand_enquiries;
drop policy if exists "Internal users manage their agency's brand enquiries" on public.brand_enquiries;

revoke all on table public.brand_enquiries from public, anon, authenticated;
grant insert on table public.brand_enquiries to anon, authenticated;
grant select, insert, update, delete on table public.brand_enquiries to service_role;

-- ─── 7. website_consent_events: service-role only ──────────────────────────
drop policy if exists "Internal users manage website consent events" on public.website_consent_events;

revoke all on table public.website_consent_events from public, anon, authenticated;
grant select, insert, update, delete on table public.website_consent_events to service_role;

-- ─── 8. Storage: kill cross-application browser access ─────────────────────
-- Private buckets become server-mediated only (service role, which bypasses
-- RLS). Public buckets stay world-readable — that is their design. The two
-- dropped policies were the cross-application blast radius: one compromised
-- staff account could read/write every application's private uploads.

drop policy if exists "Internal users manage ecosystem storage" on storage.objects;
drop policy if exists "Portal users manage their own upload folder" on storage.objects;

-- The hosted project also inherited ALL table privileges here. RLS constrains
-- ordinary DML, but it does not make TRUNCATE safe. Remove the whole inherited
-- ACL and return only the SELECT capability needed by the public-bucket policy.
-- Server-mediated storage keeps using service_role / supabase_storage_admin.
revoke all on table storage.objects from public, anon, authenticated;
grant select on table storage.objects to anon, authenticated;

drop policy if exists "Public can read public ecosystem assets" on storage.objects;
create policy "Public can read public ecosystem assets"
on storage.objects for select
to anon, authenticated
using (
  bucket_id in ('aquacrm-public', 'aquaoasis-web-public', 'milesymedia-public', 'zimante-group-public')
);

-- ─── 9. Function EXECUTE hygiene ───────────────────────────────────────────
-- After this migration no policy calls the internal-role helpers, and no
-- browser role should be able to probe them (is_internal_user() is SECURITY
-- DEFINER and reads profiles). Trigger functions never need direct EXECUTE.

-- No public-schema routine is a browser RPC. The portal invokes its RPCs with
-- the service role, while policy/trigger functions execute through PostgreSQL's
-- policy and trigger machinery. Revoke the inherited/default PUBLIC EXECUTE
-- across the existing schema instead of trying to maintain a fragile denylist.
revoke execute on all functions in schema public from public, anon, authenticated;
do $$ begin
  -- These two arrived in later migrations; guard for rebuilt projects that
  -- run the chain from scratch (they exist by this point) vs partial stacks.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'current_profile_agency_id') then
    revoke execute on function public.current_profile_agency_id() from public, anon, authenticated;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'brand_enquiries_default_agency') then
    revoke execute on function public.brand_enquiries_default_agency() from public, anon, authenticated;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'handle_new_auth_user') then
    revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
  end if;
end $$;

-- The history identity sequence was also created under the inherited cloud
-- defaults. Browser roles never insert history directly, so even USAGE/UPDATE
-- would only provide an avoidable sequence-exhaustion denial path.
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ─── 10. Default privileges: future objects default-deny ───────────────────
-- The original hole existed because the cloud project's default privileges
-- granted ALL to anon/authenticated and early tables inherited it silently.
-- Future tables/sequences/functions created by the migration role now grant
-- browser roles NOTHING until a migration says otherwise, in writing.

do $$
declare
  owner_role text;
begin
  -- Default privileges belong to the object creator, not the schema. Close the
  -- defaults for every role that already owns a public object (plus the
  -- migration role), otherwise a historic `postgres` default can survive when
  -- this migration is executed by `supabase_admin`, or vice versa.
  for owner_role in
    select distinct role_name
    from (
      select current_user::text as role_name
      union all
      select pg_get_userbyid(c.relowner)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
      union all
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      union all
      select pg_get_userbyid(t.typowner)
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
    ) owners
    where role_name is not null
  loop
    -- Global defaults are additive and apply in public as well. Revoke them
    -- separately; a schema-specific REVOKE cannot cancel a global GRANT.
    execute format(
      'alter default privileges for role %I revoke all privileges on tables from public, anon, authenticated',
      owner_role
    );
    execute format(
      'alter default privileges for role %I revoke all privileges on sequences from public, anon, authenticated',
      owner_role
    );
    execute format(
      'alter default privileges for role %I revoke execute on functions from public, anon, authenticated',
      owner_role
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all privileges on tables from public, anon, authenticated',
      owner_role
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all privileges on sequences from public, anon, authenticated',
      owner_role
    );
    execute format(
      'alter default privileges for role %I in schema public revoke execute on functions from public, anon, authenticated',
      owner_role
    );
  end loop;
end $$;

-- ─── 11. Self-verification: fail loudly if any broad path survived ─────────
do $$
declare
  offending text;
  bypass_roles text;
begin
  -- 11a. No browser-role privilege may remain on the locked tables.
  select string_agg(t.tbl || ':' || r.role || ':' || p.priv, ', ')
    into offending
  from (values ('public.app_datastores'), ('public.audit_events'),
               ('public.website_consent_events'), ('public.app_datastore_history')) as t(tbl)
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                     ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: browser-role table privilege survived: %', offending;
  end if;

  -- 11b. SELECT is the only browser privilege on the read-only surfaces.
  select string_agg(t.tbl || ':' || r.role || ':' || p.priv, ', ')
    into offending
  from (values ('public.profiles'), ('public.brands'), ('public.shoots'),
               ('public.shoot_photos'), ('public.clients'), ('public.client_portals'),
               ('public.client_portal_members')) as t(tbl)
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                     ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: browser-role write privilege survived: %', offending;
  end if;

  -- 11c. brand_enquiries: INSERT only for browser roles.
  select string_agg(r.role || ':' || p.priv, ', ')
    into offending
  from (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('SELECT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                     ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(priv)
  where has_table_privilege(r.role, 'public.brand_enquiries', p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: brand_enquiries browser access beyond INSERT: %', offending;
  end if;
  if not has_table_privilege('anon', 'public.brand_enquiries', 'INSERT') then
    raise exception 'assume-breach containment broke the public contact form: anon lost INSERT on brand_enquiries';
  end if;

  -- 11d. Only the explicitly named browser-policy allowlist may remain on
  -- these surfaces. Checking names to remove is insufficient: a differently
  -- named broad policy would otherwise survive unnoticed.
  select string_agg(schemaname || '.' || tablename || ' → ' || policyname, ', ')
    into offending
  from pg_policies
  where (
    (schemaname = 'public' and tablename in (
      'app_datastores', 'app_datastore_history', 'app_datastore_patch_receipts',
      'audit_events', 'website_consent_events', 'profiles', 'brands', 'shoots',
      'shoot_photos', 'clients', 'client_portals', 'client_portal_members',
      'brand_enquiries'
    ))
    or (schemaname = 'storage' and tablename = 'objects')
  )
  and not (
    (schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can read their own profile')
    or (schemaname = 'public' and tablename = 'brands' and policyname = 'Public brand metadata is readable')
    or (schemaname = 'public' and tablename = 'shoots' and policyname = 'Public shoot library is readable')
    or (schemaname = 'public' and tablename = 'shoot_photos' and policyname = 'Public shoot photos are readable')
    or (schemaname = 'public' and tablename = 'clients' and policyname = 'Portal members read their client')
    or (schemaname = 'public' and tablename = 'client_portals' and policyname = 'Portal members read portals')
    or (schemaname = 'public' and tablename = 'client_portal_members' and policyname = 'Portal members read their memberships')
    or (schemaname = 'public' and tablename = 'brand_enquiries' and policyname = 'Public can create consented brand enquiries')
    or (schemaname = 'storage' and tablename = 'objects' and policyname = 'Public can read public ecosystem assets')
  );
  if offending is not null then
    raise exception 'assume-breach containment failed: browser policy outside the exact allowlist survived: %', offending;
  end if;

  -- The historical broad policy names are also checked globally so moving one
  -- to a different table cannot evade the scoped allowlist above.
  select string_agg(schemaname || '.' || tablename || ' → ' || policyname, ', ')
    into offending
  from pg_policies
  where policyname in (
    'Internal users manage app datastores',
    'Internal users manage profiles',
    'Internal users manage brands',
    'Internal users manage clients',
    'Internal users manage portals',
    'Internal users manage portal members',
    'Internal users read audit events',
    'Internal users create audit events',
    'Internal users manage brand enquiries',
    'Internal users manage their agency''s brand enquiries',
    'Internal users manage website consent events',
    'Internal users manage shoots',
    'Internal users manage shoot photos',
    'Internal users manage ecosystem storage',
    'Portal users manage their own upload folder'
  );
  if offending is not null then
    raise exception 'assume-breach containment failed: broad policy survived: %', offending;
  end if;

  -- 11e. Public paths that must KEEP working.
  if not has_table_privilege('anon', 'public.brands', 'SELECT') then
    raise exception 'assume-breach containment broke public brand metadata reads';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Public can read public ecosystem assets'
  ) then
    raise exception 'assume-breach containment lost the public-bucket read policy';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can read their own profile'
  ) then
    raise exception 'assume-breach containment lost the own-row profile read (milesymedia login)';
  end if;

  -- 11f. storage.objects is browser-readable for public buckets, never mutable
  -- or administrable directly by a browser role.
  select string_agg(r.role || ':' || p.priv, ', ')
    into offending
  from (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                     ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(priv)
  where has_table_privilege(r.role, 'storage.objects', p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: storage.objects browser privilege beyond SELECT survived: %', offending;
  end if;
  if not has_table_privilege('anon', 'storage.objects', 'SELECT') then
    raise exception 'assume-breach containment broke public storage reads: anon lost SELECT on storage.objects';
  end if;

  -- 11g. No direct column grant may re-open an operation after the table-level
  -- ACL was narrowed. has_column_privilege also sees table-level grants, so the
  -- allowed read/insert cases are excluded explicitly.
  select string_agg(r.role || ':' || c.table_schema || '.' || c.table_name || '.' || c.column_name || ':' || p.priv, ', ')
    into offending
  from information_schema.columns c
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) as p(priv)
  where c.table_schema = 'public'
    and (
      (c.table_name in (
        'app_datastores', 'app_datastore_history', 'app_datastore_patch_receipts',
        'audit_events', 'website_consent_events'
      ))
      or (c.table_name in (
        'profiles', 'brands', 'shoots', 'shoot_photos', 'clients',
        'client_portals', 'client_portal_members'
      ) and p.priv <> 'SELECT')
    )
    and has_column_privilege(r.role, format('%I.%I', c.table_schema, c.table_name), c.column_name, p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: browser-role public column privilege survived: %', offending;
  end if;

  select string_agg(r.role || ':public.brand_enquiries.' || c.column_name || ':' || p.priv, ', ')
    into offending
  from information_schema.columns c
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('SELECT'), ('UPDATE'), ('REFERENCES')) as p(priv)
  where c.table_schema = 'public'
    and c.table_name = 'brand_enquiries'
    and has_column_privilege(r.role, 'public.brand_enquiries', c.column_name, p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: brand_enquiries column privilege beyond INSERT survived: %', offending;
  end if;

  select string_agg(r.role || ':storage.objects.' || c.column_name || ':' || p.priv, ', ')
    into offending
  from information_schema.columns c
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) as p(priv)
  where c.table_schema = 'storage'
    and c.table_name = 'objects'
    and has_column_privilege(r.role, 'storage.objects', c.column_name, p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: storage.objects browser column privilege beyond SELECT survived: %', offending;
  end if;

  -- 11h. No browser role may consume or advance any public sequence.
  select string_agg(r.role || ':' || n.nspname || '.' || s.relname || ':' || p.priv, ', ')
    into offending
  from pg_class s
  join pg_namespace n on n.oid = s.relnamespace
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(priv)
  where n.nspname = 'public'
    and s.relkind = 'S'
    and has_sequence_privilege(r.role, s.oid, p.priv);
  if offending is not null then
    raise exception 'assume-breach containment failed: browser-role sequence privilege survived: %', offending;
  end if;

  -- 11i. Public-schema routines are server/trigger/policy only, never direct
  -- browser RPCs.
  select string_agg(r.role || ':' || n.nspname || '.' || p.proname, ', ')
    into offending
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as r(role)
  where n.nspname = 'public'
    and has_function_privilege(r.role, p.oid, 'EXECUTE');
  if offending is not null then
    raise exception 'assume-breach containment failed: browser-role helper EXECUTE survived: %', offending;
  end if;

  -- 11j. Default ACLs for every public-schema creator must also be closed. The
  -- ALTER DEFAULT PRIVILEGES statements above cover the migration owner; this
  -- verifier refuses the migration if another creator has an unsafe default
  -- instead of silently claiming future objects are protected.
  select string_agg(
      pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' ||
      coalesce(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type,
      ', '
    )
    into offending
  from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) acl
  left join pg_roles grantee on grantee.oid = acl.grantee
  where (d.defaclnamespace = 0 or n.nspname = 'public')
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'));
  if offending is not null then
    raise exception 'assume-breach containment failed: unsafe public default ACL survived: %', offending;
  end if;

  -- 11k. Inventory, not enforcement: surface BYPASSRLS roles for the audit
  -- record. supabase platform roles legitimately carry it; anything else
  -- deserves eyes.
  select string_agg(rolname, ', ') into bypass_roles
  from pg_roles
  where rolbypassrls
    and rolname not in ('postgres', 'supabase_admin', 'supabase_storage_admin',
                        'supabase_auth_admin', 'service_role', 'supabase_replication_admin',
                        'supabase_read_only_user');
  if bypass_roles is not null then
    raise warning 'BYPASSRLS roles outside the expected platform set: % — audit these', bypass_roles;
  end if;

  raise notice 'assume-breach containment self-verification passed';
end $$;
