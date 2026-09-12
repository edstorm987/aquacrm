-- ============================================================================
-- rls-verify.sql — read-only audit of the live row-level-security posture.
--
-- WHAT THIS IS FOR
-- The policy set for this project is defined by the migrations in
-- ./migrations. Those files say what the posture SHOULD be. This script asks
-- the live database what it ACTUALLY is, and flags every difference that
-- matters. Run it after any `supabase db push`, after any change made through
-- the dashboard, and before handing a rebuilt project to anyone.
--
-- HOW TO RUN
-- Paste the whole file into the Supabase SQL editor (Dashboard → SQL Editor)
-- and run it, or:  psql "$DATABASE_URL" -f supabase/rls-verify.sql
--
-- SAFETY
-- Every statement below is a SELECT against catalog views. It creates nothing,
-- changes nothing and locks nothing. It is safe to run against production.
--
-- HOW TO READ THE OUTPUT
--   FAIL — a real hole, or a real drift from the written migrations. Fix it.
--   WARN — worth a decision, not automatically wrong.
--   INFO — inventory, printed so a reviewer can see the whole surface at once.
-- A clean run returns only INFO rows.
--
-- THE ONE THING THIS CANNOT TELL YOU
-- Almost every write path in the AquaCRM portal uses the SERVICE ROLE key,
-- which has BYPASSRLS. A perfect score here does not mean tenant isolation is
-- enforced by the database — it means the anon/authenticated path is. Tenant
-- isolation for service-role paths is enforced in application code only. See
-- portal/docs/development/plans/rls-enable.md.
-- ============================================================================

with
-- Tables that are deliberately world-readable. These carry public website
-- content only — brand names, shoot listings and their photos. No PII, no
-- tenant data. Anything else appearing as anon-readable is a hole.
expected_public_read(table_name) as (
  values ('brands'), ('shoots'), ('shoot_photos')
),

live_tables as (
  select
    c.relname::text          as table_name,
    c.relrowsecurity         as rls_enabled,
    c.relforcerowsecurity    as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
),

live_policies as (
  select
    p.tablename::text as table_name,
    p.policyname::text as policy_name,
    p.cmd::text as cmd,
    p.roles::text[] as roles,
    p.qual::text as using_expr
  from pg_policies p
  where p.schemaname = 'public'
),

-- A policy only exposes rows to an unauthenticated browser when BOTH hold:
-- the anon role can match it (named in TO, or the policy defaulted to PUBLIC),
-- and its USING predicate can be true with no session. `is_internal_user()`
-- returns false without one, so only a literal `true` qualifies.
anon_readable as (
  select distinct table_name
  from live_policies
  where cmd in ('SELECT', 'ALL')
    and ('anon' = any(roles) or 'public' = any(roles))
    and coalesce(btrim(using_expr), 'true') = 'true'
),

-- Table-level GRANTs are the layer *underneath* RLS, and they fail differently:
-- no grant returns `42501 permission denied`, whereas RLS with no matching
-- policy returns an empty result. Both appear in the live project today
-- (`app_datastore_history` is the revoked one), so both are worth showing.
-- has_table_privilege is used rather than information_schema.role_table_grants
-- because the latter only reports grants the *current* role can see.
anon_grants as (
  select
    t.table_name,
    array_to_string(array_remove(array[
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'SELECT') then 'SELECT' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'INSERT') then 'INSERT' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'UPDATE') then 'UPDATE' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'DELETE') then 'DELETE' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'TRUNCATE') then 'TRUNCATE' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'REFERENCES') then 'REFERENCES' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'TRIGGER') then 'TRIGGER' end,
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'MAINTAIN') then 'MAINTAIN' end
    ], null), ', ') as privileges
  from live_tables t
),

policy_counts as (
  select table_name, count(*) as policy_count
  from live_policies
  group by table_name
),

findings as (

  -- FAIL: RLS switched off. With the anon key public, this is an open table.
  select 1 as sort_key, 'FAIL' as severity,
         'rls-disabled' as check_name,
         t.table_name as subject,
         'Row level security is OFF. Anyone holding the public anon key can read this table.' as detail
  from live_tables t
  where not t.rls_enabled

  union all

  -- FAIL: policies exist but RLS is off. Postgres ignores them completely,
  -- so the SQL reads as protection while enforcing nothing.
  select 2, 'FAIL',
         'policies-ignored',
         t.table_name,
         format('%s polic%s defined but RLS is OFF — Postgres is not applying any of them.',
                pc.policy_count, case when pc.policy_count = 1 then 'y' else 'ies' end)
  from live_tables t
  join policy_counts pc on pc.table_name = t.table_name
  where not t.rls_enabled

  union all

  -- FAIL: a table the public can read that was never meant to be public.
  select 3, 'FAIL',
         'unexpected-anon-read',
         ar.table_name,
         'An unauthenticated browser can SELECT this table (a USING (true) policy reachable by anon). '
         || 'It is not in the deliberately-public website set.'
  from anon_readable ar
  where ar.table_name not in (select table_name from expected_public_read)

  union all

  -- FAIL: a public website table stopped being readable. The websites break.
  select 4, 'FAIL',
         'missing-anon-read',
         ep.table_name,
         'Expected to be publicly readable (website content) but no anon-reachable SELECT policy exists.'
  from expected_public_read ep
  where ep.table_name in (select table_name from live_tables)
    and ep.table_name not in (select table_name from anon_readable)

  union all

  -- FAIL: RLS is on but nothing is written for it. Every non-service-role
  -- read returns zero rows, which usually surfaces as a silent app bug
  -- rather than an error.
  select 5, 'FAIL',
         'rls-on-no-policies',
         t.table_name,
         'RLS is ON with zero policies. Every anon and authenticated query returns no rows.'
  from live_tables t
  left join policy_counts pc on pc.table_name = t.table_name
  where t.rls_enabled
    and coalesce(pc.policy_count, 0) = 0
    and exists (
      select 1 from anon_grants ag
      where ag.table_name = t.table_name and coalesce(ag.privileges, '') <> ''
    )

  union all

  -- WARN: a table the repo has no migration for. Either it was created by
  -- hand in the dashboard, or a migration was deleted. Both are drift.
  select 6, 'WARN',
         'table-not-in-repo-check',
         t.table_name,
         'Confirm a migration in ./migrations creates this table. Dashboard-only tables '
         || 'do not survive a project rebuild.'
  from live_tables t
  where t.table_name not in (
    'profiles', 'brands', 'clients', 'client_portals', 'client_portal_members',
    'audit_events', 'brand_enquiries', 'app_datastores', 'app_datastore_history',
    'website_consent_events', 'shoots', 'shoot_photos',
    'inbox_channel_connections', 'inbox_contact_identities', 'inbox_conversations',
    'inbox_messages', 'inbox_webhook_events',
    'editor_ai_reply_claims', 'lead_conversion_operations', 'product_workspace_leases',
    'app_datastore_patch_receipts',
    -- 20260902093000 + the 2026-09-12 security chain.
    'aqua_tag_submissions', 'inbox_client_erasure_tombstones', 'aqua_auth_nonces'
  )

  union all

  -- WARN: SECURITY DEFINER functions run as their owner and therefore ignore
  -- RLS. Without a pinned search_path they are a privilege-escalation vector.
  select 7, 'WARN',
         'definer-without-search-path',
         p.proname::text,
         'SECURITY DEFINER function with no pinned search_path. It runs as its owner and bypasses RLS.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
      where cfg like 'search_path=%'
    )

  union all

  -- INFO: the whole public-schema surface, one row per table.
  select 8, 'INFO',
         'inventory',
         t.table_name,
         format('rls=%s force=%s policies=%s anon_grants=[%s]%s',
                case when t.rls_enabled then 'on' else 'OFF' end,
                case when t.rls_forced then 'on' else 'off' end,
                coalesce(pc.policy_count, 0),
                nullif(coalesce(ag.privileges, ''), ''),
                case when t.table_name in (select table_name from anon_readable)
                     then ' PUBLICLY-READABLE' else '' end)
  from live_tables t
  left join policy_counts pc on pc.table_name = t.table_name
  left join anon_grants ag on ag.table_name = t.table_name

  union all

  -- INFO: every policy, so a reviewer can read the actual predicates rather
  -- than trusting a summary.
  select 9, 'INFO',
         'policy',
         lp.table_name || ' :: ' || lp.policy_name,
         format('cmd=%s to=[%s] using=%s',
                lp.cmd,
                array_to_string(lp.roles, ', '),
                coalesce(lp.using_expr, '(none)'))
  from live_policies lp

  union all

  -- INFO: storage buckets. `public = true` means the objects are served
  -- without a signed URL to anyone who knows the path.
  select 10, 'INFO',
         'storage-bucket',
         b.id,
         format('public=%s size_limit=%s', b.public, coalesce(b.file_size_limit::text, 'unset'))
  from storage.buckets b
)

select severity, check_name, subject, detail
from findings
order by sort_key, subject;

-- ============================================================================
-- GLOBAL BROWSER-PRIVILEGE CLOSURE
--
-- A second, standalone result set. After
-- 20260912160000_browser_privilege_closure.sql, a clean run returns ZERO rows.
-- Any row is a live release-blocking ACL, column, function, default, schema or
-- policy mismatch. Catalog ACL expansion covers TRUNCATE and newer privileges
-- such as MAINTAIN without relying on a CRUD-only hand-maintained list.
-- ============================================================================
with allowed_table_acl(schema_name, table_name, grantee, privilege_type) as (
  values
    ('public','brands','anon','SELECT'),
    ('public','shoots','anon','SELECT'),
    ('public','shoot_photos','anon','SELECT'),
    ('public','brand_enquiries','anon','INSERT'),
    ('public','profiles','authenticated','SELECT'),
    ('public','brands','authenticated','SELECT'),
    ('public','shoots','authenticated','SELECT'),
    ('public','shoot_photos','authenticated','SELECT'),
    ('public','clients','authenticated','SELECT'),
    ('public','client_portals','authenticated','SELECT'),
    ('public','client_portal_members','authenticated','SELECT'),
    ('public','brand_enquiries','authenticated','INSERT'),
    ('storage','objects','anon','SELECT'),
    ('storage','objects','authenticated','SELECT')
),
actual_table_acl as (
  select
    n.nspname::text as schema_name,
    c.relname::text as table_name,
    coalesce(g.rolname, 'PUBLIC')::text as grantee,
    acl.privilege_type::text as privilege_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
  left join pg_roles g on g.oid = acl.grantee
  where c.relkind in ('r','p')
    and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
    and (acl.grantee = 0 or g.rolname in ('anon','authenticated'))
),
allowed_policies(schema_name, table_name, policy_name) as (
  values
    ('public','profiles','Users can read their own profile'),
    ('public','brands','Public brand metadata is readable'),
    ('public','shoots','Public shoot library is readable'),
    ('public','shoot_photos','Public shoot photos are readable'),
    ('public','clients','Portal members read their client'),
    ('public','client_portals','Portal members read portals'),
    ('public','client_portal_members','Portal members read their memberships'),
    ('public','brand_enquiries','Public can create consented brand enquiries'),
    ('storage','objects','Public can read public ecosystem assets')
),
actual_policies as (
  select schemaname::text as schema_name, tablename::text as table_name,
         policyname::text as policy_name
  from pg_policies
  where schemaname in ('public','storage')
    and roles && array['public','anon','authenticated']::name[]
)
select 'FAIL' as severity, 'unexpected-browser-table-acl' as check_name,
       a.schema_name || '.' || a.table_name || ' → ' || a.grantee || ':' || a.privilege_type as subject,
       'Browser table privilege is outside the exact reviewed allowlist.' as detail
from actual_table_acl a
where not exists (
  select 1 from allowed_table_acl e
  where (e.schema_name, e.table_name, e.grantee, e.privilege_type)
      = (a.schema_name, a.table_name, a.grantee, a.privilege_type)
)

union all

select 'FAIL', 'missing-browser-table-acl',
       e.schema_name || '.' || e.table_name || ' → ' || e.grantee || ':' || e.privilege_type,
       'A required website/member browser privilege is missing.'
from allowed_table_acl e
where not exists (
  select 1 from actual_table_acl a
  where (a.schema_name, a.table_name, a.grantee, a.privilege_type)
      = (e.schema_name, e.table_name, e.grantee, e.privilege_type)
)

union all

select 'FAIL', 'browser-sequence-acl',
       n.nspname || '.' || c.relname || ' → ' || coalesce(g.rolname, 'PUBLIC') || ':' || acl.privilege_type,
       'Browser roles must hold no public-sequence privilege.'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
left join pg_roles g on g.oid = acl.grantee
where n.nspname = 'public' and c.relkind = 'S'
  and (acl.grantee = 0 or g.rolname in ('anon','authenticated'))

union all

select 'FAIL', 'browser-column-acl',
       n.nspname || '.' || c.relname || '.' || a.attname || ' → ' ||
       coalesce(g.rolname, 'PUBLIC') || ':' || acl.privilege_type,
       'Direct column ACL survived the table-level closure.'
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(a.attacl) acl
left join pg_roles g on g.oid = acl.grantee
where (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  and a.attnum > 0 and not a.attisdropped
  and (acl.grantee = 0 or g.rolname in ('anon','authenticated'))

union all

select 'FAIL', 'browser-function-execute',
       p.oid::regprocedure::text || ' → ' || coalesce(g.rolname, 'PUBLIC'),
       'A public-schema function remains directly executable by a browser role.'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
left join pg_roles g on g.oid = acl.grantee
where n.nspname = 'public'
  and (acl.grantee = 0 or g.rolname in ('anon','authenticated'))

union all

select 'FAIL', 'unsafe-public-default-acl',
       pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ' → ' ||
       coalesce(g.rolname, 'PUBLIC') || ':' || acl.privilege_type,
       'A public-schema creator still grants browser privileges by default.'
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) acl
left join pg_roles g on g.oid = acl.grantee
where n.nspname = 'public'
  and (acl.grantee = 0 or g.rolname in ('anon','authenticated'))

union all

select 'FAIL', 'browser-schema-create', role_name,
       'Browser role can create objects in the public schema.'
from (values ('anon'),('authenticated')) roles(role_name)
where has_schema_privilege(role_name, 'public', 'CREATE')

union all

select 'FAIL', 'unexpected-browser-policy',
       a.schema_name || '.' || a.table_name || ' → ' || a.policy_name,
       'Browser-reachable policy is outside the exact reviewed allowlist.'
from actual_policies a
where not exists (
  select 1 from allowed_policies e
  where (e.schema_name, e.table_name, e.policy_name)
      = (a.schema_name, a.table_name, a.policy_name)
)

union all

select 'FAIL', 'missing-browser-policy',
       e.schema_name || '.' || e.table_name || ' → ' || e.policy_name,
       'A required website/member policy is missing.'
from allowed_policies e
where not exists (
  select 1 from actual_policies a
  where (a.schema_name, a.table_name, a.policy_name)
      = (e.schema_name, e.table_name, e.policy_name)
)
order by check_name, subject;
