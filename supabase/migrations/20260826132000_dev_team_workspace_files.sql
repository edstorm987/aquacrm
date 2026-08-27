create or replace function public.apply_dev_team_workspace_files(
  p_app_key text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  operation jsonb;
  rel_path text;
  current_data jsonb;
  workspace_files jsonb;
  existing_file jsonb;
  replacement_file jsonb;
  expected_exists boolean;
  expected_sha text;
  baseline_exists boolean;
  baseline_sha text;
  current_exists boolean;
  current_sha text;
  seen_paths text[] := array[]::text[];
begin
  if p_app_key is null or btrim(p_app_key) = '' then
    raise exception 'app key is required';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array' then
    raise exception 'operations must be a JSON array';
  end if;

  insert into public.app_datastores (app_key, data)
  values (p_app_key, '{}'::jsonb)
  on conflict (app_key) do nothing;

  select datastore.data
  into current_data
  from public.app_datastores datastore
  where datastore.app_key = p_app_key
  for update;

  workspace_files := coalesce(current_data->'devTeamWorkspaceFiles', '{}'::jsonb);
  if jsonb_typeof(workspace_files) is distinct from 'object' then
    workspace_files := '{}'::jsonb;
  end if;

  -- Validate the complete batch before changing anything. This lets a
  -- finding→plan conversion update several markdown documents as one commit.
  for operation in select value from jsonb_array_elements(p_operations)
  loop
    rel_path := operation->>'relPath';
    replacement_file := operation->'file';
    if rel_path is null
       or rel_path = ''
       or left(rel_path, 1) = '/'
       or position(E'\\' in rel_path) > 0
       or rel_path like '%//%'
       or rel_path ~ '(^|/)\.{1,2}(/|$)'
       or jsonb_typeof(replacement_file) is distinct from 'object'
       or replacement_file->>'relPath' is distinct from rel_path then
      raise exception 'invalid Dev Team workspace path';
    end if;
    if rel_path = any(seen_paths) then
      raise exception 'duplicate Dev Team workspace operation: %', rel_path;
    end if;
    seen_paths := array_append(seen_paths, rel_path);

    expected_exists := coalesce((operation#>>'{expected,exists}')::boolean, false);
    expected_sha := operation#>>'{expected,sha256}';
    baseline_exists := coalesce((operation#>>'{baseline,exists}')::boolean, false);
    baseline_sha := operation#>>'{baseline,sha256}';
    existing_file := workspace_files->rel_path;

    if existing_file is null then
      current_exists := baseline_exists;
      current_sha := baseline_sha;
    else
      current_exists := not coalesce((existing_file->>'deleted')::boolean, false);
      current_sha := case when current_exists then existing_file->>'sha256' else null end;
    end if;

    if current_exists is distinct from expected_exists
       or (expected_exists and current_sha is distinct from expected_sha) then
      raise exception 'DEV_TEAM_WORKSPACE_CONFLICT:%', rel_path;
    end if;
  end loop;

  for operation in select value from jsonb_array_elements(p_operations)
  loop
    rel_path := operation->>'relPath';
    workspace_files := jsonb_set(
      workspace_files,
      array[rel_path],
      operation->'file',
      true
    );
  end loop;

  current_data := jsonb_set(
    current_data,
    '{devTeamWorkspaceFiles}',
    workspace_files,
    true
  );

  update public.app_datastores
  set data = current_data
  where app_key = p_app_key;

  return current_data;
end;
$$;

revoke all on function public.apply_dev_team_workspace_files(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_dev_team_workspace_files(text, jsonb) to service_role;

comment on function public.apply_dev_team_workspace_files(text, jsonb) is
  'Atomically compare-and-swaps a batch of founder Dev Team workspace files in the durable AquaCRM datastore.';

