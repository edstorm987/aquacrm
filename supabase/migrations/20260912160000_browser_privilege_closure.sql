-- Final browser-role privilege closure after the full 2026-09-12 schema chain.
--
-- The hosted project inherited broad table/sequence/function defaults before
-- those defaults were brought under version control. RLS does not govern
-- TRUNCATE, and table-level REVOKE does not remove an explicit column grant.
-- This forward-only migration therefore removes every existing browser ACL in
-- public, removes direct column ACLs, and restores one exact reviewed allowlist.
-- It is deliberately after the erasure, capture-admission and nonce migrations
-- so those new objects are covered too. Service-role privileges are untouched.

revoke create on schema public from public, anon, authenticated;

revoke all privileges on all tables in schema public
from public, anon, authenticated;

revoke all privileges on all sequences in schema public
from public, anon, authenticated;

revoke execute on all functions in schema public
from public, anon, authenticated;

-- Remove direct column ACLs as well as table ACLs. Without this, a historical
-- per-column grant could silently survive the blanket table REVOKE above.
do $$
declare
  target record;
begin
  for target in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      string_agg(quote_ident(a.attname), ', ' order by a.attnum) as columns
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
    group by n.nspname, c.relname
  loop
    execute format(
      'revoke all privileges (%s) on table %I.%I from public, anon, authenticated',
      target.columns,
      target.schema_name,
      target.table_name
    );
  end loop;
end $$;

-- Exact browser table allowlist. All application mutations and RPCs are
-- server-mediated with the service role except the consented public enquiry
-- insert. These reads preserve public websites and member/profile resolution.
grant select on table
  public.brands, public.shoots, public.shoot_photos
to anon, authenticated;

grant select on table public.profiles to authenticated;

grant select on table
  public.clients, public.client_portals, public.client_portal_members
to authenticated;

grant insert on table public.brand_enquiries to anon, authenticated;

-- Public buckets remain readable. Private storage writes are server-mediated.
-- Do not change other Supabase-managed storage tables or storage defaults.
revoke all privileges on table storage.objects from public, anon, authenticated;
do $$
declare
  columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into columns
  from pg_attribute a
  where a.attrelid = 'storage.objects'::regclass
    and a.attnum > 0
    and not a.attisdropped;
  execute format(
    'revoke all privileges (%s) on table storage.objects from public, anon, authenticated',
    columns
  );
end $$;
grant select on table storage.objects to anon, authenticated;

-- Close the migration owner's future defaults. The verifier below also
-- rejects unsafe public-schema defaults owned by any other creator.
do $$
declare
  owner_role text;
begin
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

do $$
declare
  offending text;
begin
  -- Existing public table ACLs must match the exact allowlist, including newer
  -- PostgreSQL privileges such as MAINTAIN because catalog ACL expansion sees
  -- them without relying on a hand-maintained privilege-name list.
  with allowed(grantee, table_name, privilege_type) as (
    values
      ('anon','brands','SELECT'),
      ('anon','shoots','SELECT'),
      ('anon','shoot_photos','SELECT'),
      ('anon','brand_enquiries','INSERT'),
      ('authenticated','profiles','SELECT'),
      ('authenticated','brands','SELECT'),
      ('authenticated','shoots','SELECT'),
      ('authenticated','shoot_photos','SELECT'),
      ('authenticated','clients','SELECT'),
      ('authenticated','client_portals','SELECT'),
      ('authenticated','client_portal_members','SELECT'),
      ('authenticated','brand_enquiries','INSERT')
  ),
  actual as (
    select
      coalesce(g.rolname, 'PUBLIC') as grantee,
      c.relname as table_name,
      acl.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
    left join pg_roles g on g.oid = acl.grantee
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (acl.grantee = 0 or g.rolname in ('anon', 'authenticated'))
  ),
  differences as (
    select 'unexpected' as kind, a.grantee, a.table_name, a.privilege_type
    from actual a
    where not exists (
      select 1 from allowed e
      where e.grantee = a.grantee
        and e.table_name = a.table_name
        and e.privilege_type = a.privilege_type
    )
    union all
    select 'missing', e.grantee, e.table_name, e.privilege_type
    from allowed e
    where not exists (
      select 1 from actual a
      where a.grantee = e.grantee
        and a.table_name = e.table_name
        and a.privilege_type = e.privilege_type
    )
  )
  select string_agg(kind || ':' || grantee || ':' || table_name || ':' || privilege_type, ', ')
    into offending
  from differences;
  if offending is not null then
    raise exception 'browser privilege closure failed: public table ACL mismatch: %', offending;
  end if;

  select string_agg(
      coalesce(g.rolname, 'PUBLIC') || ':' || n.nspname || '.' || c.relname || ':' || acl.privilege_type,
      ', '
    )
    into offending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
  left join pg_roles g on g.oid = acl.grantee
  where n.nspname = 'public'
    and c.relkind = 'S'
    and (acl.grantee = 0 or g.rolname in ('anon', 'authenticated'));
  if offending is not null then
    raise exception 'browser privilege closure failed: public sequence ACL survived: %', offending;
  end if;

  select string_agg(
      coalesce(g.rolname, 'PUBLIC') || ':' || n.nspname || '.' || c.relname || '.' || a.attname || ':' || acl.privilege_type,
      ', '
    )
    into offending
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(a.attacl) acl
  left join pg_roles g on g.oid = acl.grantee
  where (
      n.nspname = 'public'
      or (n.nspname = 'storage' and c.relname = 'objects')
    )
    and a.attnum > 0
    and not a.attisdropped
    and (acl.grantee = 0 or g.rolname in ('anon', 'authenticated'));
  if offending is not null then
    raise exception 'browser privilege closure failed: direct column ACL survived: %', offending;
  end if;

  select string_agg(
      coalesce(g.rolname, 'PUBLIC') || ':' || p.oid::regprocedure::text,
      ', '
    )
    into offending
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  left join pg_roles g on g.oid = acl.grantee
  where n.nspname = 'public'
    and (acl.grantee = 0 or g.rolname in ('anon', 'authenticated'));
  if offending is not null then
    raise exception 'browser privilege closure failed: public function EXECUTE survived: %', offending;
  end if;

  select string_agg(
      pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' ||
      coalesce(g.rolname, 'PUBLIC') || ':' || acl.privilege_type,
      ', '
    )
    into offending
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) acl
  left join pg_roles g on g.oid = acl.grantee
  where n.nspname = 'public'
    and (acl.grantee = 0 or g.rolname in ('anon', 'authenticated'));
  if offending is not null then
    raise exception 'browser privilege closure failed: unsafe public default ACL survived: %', offending;
  end if;

  if has_schema_privilege('anon', 'public', 'CREATE')
     or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'browser privilege closure failed: browser role can CREATE in public';
  end if;

  -- Policy allowlist. Grants and policies are both required for access; an
  -- arbitrarily named browser policy is rejected rather than assumed benign.
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ')
    into offending
  from pg_policies
  where schemaname in ('public', 'storage')
    and roles && array['public', 'anon', 'authenticated']::name[]
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
    raise exception 'browser privilege closure failed: policy outside allowlist: %', offending;
  end if;

  if not has_table_privilege('anon', 'storage.objects', 'SELECT')
     or not has_table_privilege('authenticated', 'storage.objects', 'SELECT') then
    raise exception 'browser privilege closure failed: public storage SELECT missing';
  end if;

  select string_agg(coalesce(g.rolname, 'PUBLIC') || ':' || acl.privilege_type, ', ')
    into offending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
  left join pg_roles g on g.oid = acl.grantee
  where n.nspname = 'storage'
    and c.relname = 'objects'
    and c.relkind in ('r', 'p')
    and (acl.grantee = 0 or g.rolname in ('anon', 'authenticated'))
    and acl.privilege_type <> 'SELECT';
  if offending is not null then
    raise exception 'browser privilege closure failed: storage.objects privilege beyond SELECT survived: %', offending;
  end if;
end $$;
