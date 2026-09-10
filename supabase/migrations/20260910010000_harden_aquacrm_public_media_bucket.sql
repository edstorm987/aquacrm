-- Public website media is world-readable and bypasses the portal on download.
-- Keep the bucket contract exactly aligned with publicUploadStorage.ts:
-- inert raster/video formats only, with the editor's 8 MiB per-file ceiling.
--
-- This is a forward migration only. It was authored locally and is NOT applied
-- to any remote project by this change; deployment remains an owner action.
begin;

-- A correct name is not enough: provider/dashboard drift could have made the
-- private bucket world-readable. Reassert the confidentiality boundary in the
-- same forward migration that hardens the public zone.
update storage.buckets
set public = false
where id = 'aquacrm-uploads';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
      'video/mp4',
      'video/webm'
    ]
where id = 'aquacrm-public';

do $$
declare
  configured record;
  private_is_public boolean;
  browser_write_policies text;
  storage_objects_rls boolean;
  storage_objects_force_rls boolean;
  storage_objects_owner oid;
  browser_rls_bypass_roles text;
begin
  select c.relrowsecurity, c.relforcerowsecurity, c.relowner
    into storage_objects_rls, storage_objects_force_rls, storage_objects_owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname = 'objects'
    and c.relkind in ('r', 'p');

  if not found then
    raise exception 'storage hardening failed: storage.objects table is missing';
  end if;
  if storage_objects_rls is distinct from true then
    raise exception 'storage hardening failed: RLS is disabled on storage.objects';
  end if;

  -- RLS being switched on is meaningless if either browser principal can
  -- bypass it through role attributes or effective table ownership. Do not
  -- mutate managed Supabase roles here: abort so the operator must investigate
  -- and restore the expected role boundary explicitly.
  select string_agg(
           format('%I (%s)', browser.role_name, case
             when role_row.oid is null then 'role missing'
             when role_row.rolsuper then 'superuser'
             when role_row.rolbypassrls then 'bypassrls'
             else 'effective storage.objects owner while FORCE RLS is disabled'
           end),
           ', ' order by browser.role_name
         )
    into browser_rls_bypass_roles
  from (values ('anon'::name), ('authenticated'::name)) as browser(role_name)
  left join pg_roles role_row on role_row.rolname = browser.role_name
  where role_row.oid is null
     or role_row.rolsuper
     or role_row.rolbypassrls
     or (
       storage_objects_force_rls is distinct from true
       and role_row.oid is not null
       and pg_has_role(role_row.oid, storage_objects_owner, 'member')
     );

  if browser_rls_bypass_roles is not null then
    raise exception 'storage hardening failed: browser role can bypass storage.objects RLS: %', browser_rls_bypass_roles;
  end if;

  select public
    into private_is_public
  from storage.buckets
  where id = 'aquacrm-uploads';

  if not found then
    raise exception 'storage hardening failed: aquacrm-uploads bucket is missing';
  end if;
  if private_is_public is distinct from false then
    raise exception 'storage hardening failed: aquacrm-uploads must remain private';
  end if;

  select public, file_size_limit, allowed_mime_types
    into configured
  from storage.buckets
  where id = 'aquacrm-public';

  if configured is null then
    raise exception 'public media hardening failed: aquacrm-public bucket is missing';
  end if;
  if configured.public is not true then
    raise exception 'public media hardening failed: aquacrm-public must remain public';
  end if;
  if configured.file_size_limit <> 8388608 then
    raise exception 'public media hardening failed: expected 8 MiB file limit';
  end if;
  if configured.allowed_mime_types is distinct from array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm'
  ]::text[] then
    raise exception 'public media hardening failed: MIME policy drifted';
  end if;

  -- The portal performs every storage mutation through its server-held key.
  -- Policy names are not a security boundary: reject any renamed, dashboard-
  -- created, PUBLIC-targeted or inherited-role policy that could authorize a
  -- browser write.
  -- SELECT-only policies remain valid for intentionally public asset buckets.
  select string_agg(
           format('%I cmd=%s to=[%s]', policyname, cmd, array_to_string(roles, ',')),
           ', ' order by policyname
         )
    into browser_write_policies
  from pg_policies pol
  where pol.schemaname = 'storage'
    and pol.tablename = 'objects'
    and pol.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and exists (
      select 1
      from unnest(pol.roles) as policy_role(role_name)
      left join pg_roles target_role on target_role.rolname = policy_role.role_name
      where case
        when policy_role.role_name = 'public'::name then true
        when target_role.oid is null then false
        else pg_has_role('anon', target_role.oid, 'member')
          or pg_has_role('authenticated', target_role.oid, 'member')
      end
    );

  if browser_write_policies is not null then
    raise exception 'storage hardening failed: browser-role storage.objects write policy exists: %', browser_write_policies;
  end if;
end $$;

-- Preserve the one browser-readable storage contract required by the existing
-- ecosystem sites. Recreating this controlled identity repairs qualification
-- drift without guessing whether an unknown policy belongs to another app.
drop policy if exists "Public can read public ecosystem assets" on storage.objects;
create policy "Public can read public ecosystem assets"
on storage.objects for select
to anon, authenticated
using (
  bucket_id in ('aquacrm-public', 'aquaoasis-web-public', 'milesymedia-public', 'zimante-group-public')
);

do $$
declare
  expected_public_read_qual constant text :=
    'bucket_id=anyarray[''aquacrm-public''::text,''aquaoasis-web-public''::text,''milesymedia-public''::text,''zimante-group-public''::text]';
  canonical_public_read_count integer;
  unexpected_browser_read_policies text;
begin
  select count(*)
    into canonical_public_read_count
  from pg_policies pol
  where pol.schemaname = 'storage'
    and pol.tablename = 'objects'
    and pol.policyname = 'Public can read public ecosystem assets'
    and pol.permissive = 'PERMISSIVE'
    and pol.cmd = 'SELECT'
    and cardinality(pol.roles) = 2
    and pol.roles @> array['anon', 'authenticated']::name[]
    and pol.roles <@ array['anon', 'authenticated']::name[]
    and regexp_replace(lower(coalesce(pol.qual, '')), '[[:space:]()]', '', 'g') = expected_public_read_qual;

  if canonical_public_read_count <> 1 then
    raise exception 'storage hardening failed: canonical public-bucket SELECT policy is missing or altered';
  end if;

  select string_agg(
           format('%I cmd=%s to=[%s]', pol.policyname, pol.cmd, array_to_string(pol.roles, ',')),
           ', ' order by pol.policyname
         )
    into unexpected_browser_read_policies
  from pg_policies pol
  where pol.schemaname = 'storage'
    and pol.tablename = 'objects'
    and pol.cmd in ('SELECT', 'ALL')
    and exists (
      select 1
      from unnest(pol.roles) as policy_role(role_name)
      left join pg_roles target_role on target_role.rolname = policy_role.role_name
      where case
        when policy_role.role_name = 'public'::name then true
        when target_role.oid is null then false
        else pg_has_role('anon', target_role.oid, 'member')
          or pg_has_role('authenticated', target_role.oid, 'member')
      end
    )
    and not (
      pol.policyname = 'Public can read public ecosystem assets'
      and pol.permissive = 'PERMISSIVE'
      and pol.cmd = 'SELECT'
      and cardinality(pol.roles) = 2
      and pol.roles @> array['anon', 'authenticated']::name[]
      and pol.roles <@ array['anon', 'authenticated']::name[]
      and regexp_replace(lower(coalesce(pol.qual, '')), '[[:space:]()]', '', 'g') = expected_public_read_qual
    );

  if unexpected_browser_read_policies is not null then
    raise exception 'storage hardening failed: unexpected browser-readable storage.objects policy exists: %', unexpected_browser_read_policies;
  end if;
end $$;

commit;
