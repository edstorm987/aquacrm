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
      case when has_table_privilege('anon', format('public.%I', t.table_name)::regclass, 'DELETE') then 'DELETE' end
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
    -- 20260902093000_aqua_tag_submission_delivery.sql (issues #87)
    'aqua_tag_submissions'
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
-- CONTAINMENT INVARIANTS (assume-breach migration 20260908210000)
--
-- A second, standalone result set. After the containment migration is pushed,
-- every row here must be INFO. A FAIL row means a broad browser-role path has
-- come back — through the dashboard, a later migration or default privileges —
-- and cross-tenant exposure is live again.
-- ============================================================================
with sealed_tables(table_name) as (
  values ('public.app_datastores'), ('public.audit_events'),
         ('public.website_consent_events'), ('public.app_datastore_history')
),
read_only_tables(table_name) as (
  values ('public.profiles'), ('public.brands'), ('public.shoots'),
         ('public.shoot_photos'), ('public.clients'), ('public.client_portals'),
         ('public.client_portal_members')
),
banned_policies(policy_name) as (
  values ('Internal users manage app datastores'), ('Internal users manage profiles'),
         ('Internal users manage brands'), ('Internal users manage clients'),
         ('Internal users manage portals'), ('Internal users manage portal members'),
         ('Internal users read audit events'), ('Internal users create audit events'),
         ('Internal users manage brand enquiries'),
         ('Internal users manage their agency''s brand enquiries'),
         ('Internal users manage website consent events'), ('Internal users manage shoots'),
         ('Internal users manage shoot photos'), ('Internal users manage ecosystem storage'),
         ('Portal users manage their own upload folder')
)
select * from (
  select 'FAIL' as severity, 'containment-sealed-table-leak' as check_name,
         s.table_name || ' → ' || r.role || ':' || p.priv as subject,
         'A browser role holds a privilege on a sealed (service-role-only) table.' as detail
  from sealed_tables s
  cross join (values ('anon'), ('authenticated')) r(role)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
  where has_table_privilege(r.role, s.table_name, p.priv)
  union all
  select 'FAIL', 'containment-readonly-table-write',
         t.table_name || ' → ' || r.role || ':' || p.priv,
         'A browser role holds a WRITE privilege on a read-only surface.'
  from read_only_tables t
  cross join (values ('anon'), ('authenticated')) r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
  where has_table_privilege(r.role, t.table_name, p.priv)
  union all
  select 'FAIL', 'containment-enquiry-triage-leak',
         'public.brand_enquiries → ' || r.role || ':' || p.priv,
         'brand_enquiries must be INSERT-only for browser roles (triage is service-role).'
  from (values ('anon'), ('authenticated')) r(role)
  cross join (values ('SELECT'), ('UPDATE'), ('DELETE')) p(priv)
  where has_table_privilege(r.role, 'public.brand_enquiries', p.priv)
  union all
  select 'FAIL', 'containment-banned-policy-returned',
         pol.schemaname || '.' || pol.tablename || ' → ' || pol.policyname,
         'A broad pre-containment policy has been recreated.'
  from pg_policies pol
  join banned_policies b on b.policy_name = pol.policyname
  union all
  select 'FAIL', 'containment-public-form-broken',
         'public.brand_enquiries → anon:INSERT',
         'The public contact form lost its INSERT path.'
  where not has_table_privilege('anon', 'public.brand_enquiries', 'INSERT')
  union all
  select 'INFO', 'containment-verified',
         'assume-breach containment invariants',
         'All containment invariants hold (sealed tables, read-only surfaces, insert-only enquiries, no banned policies).'
  where not exists (
    select 1 from sealed_tables s
    cross join (values ('anon'), ('authenticated')) r(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
    where has_table_privilege(r.role, s.table_name, p.priv)
  ) and not exists (
    select 1 from pg_policies pol join banned_policies b on b.policy_name = pol.policyname
  )
) checks
order by case severity when 'FAIL' then 0 else 1 end, check_name, subject;
