create table if not exists public.app_datastore_history (
  id bigint generated always as identity primary key,
  app_key text not null,
  data jsonb not null,
  source_updated_at timestamptz,
  captured_at timestamptz not null default now()
);

create index if not exists app_datastore_history_app_key_captured_at_idx
  on public.app_datastore_history (app_key, captured_at desc);

alter table public.app_datastore_history enable row level security;
revoke all on table public.app_datastore_history from anon, authenticated;
grant select on table public.app_datastore_history to service_role;

comment on table public.app_datastore_history is
  'Private recovery snapshots captured before each AquaCRM datastore update or deletion.';

create or replace function public.archive_app_datastore_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;

  insert into public.app_datastore_history (app_key, data, source_updated_at)
  values (old.app_key, old.data, old.updated_at);

  delete from public.app_datastore_history history
  where history.app_key = old.app_key
    and history.id not in (
      select retained.id
      from public.app_datastore_history retained
      where retained.app_key = old.app_key
      order by retained.captured_at desc, retained.id desc
      limit 100
    );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists archive_app_datastore_version on public.app_datastores;
create trigger archive_app_datastore_version
before update or delete on public.app_datastores
for each row execute function public.archive_app_datastore_version();

insert into public.app_datastore_history (app_key, data, source_updated_at)
select datastore.app_key, datastore.data, datastore.updated_at
from public.app_datastores datastore
where not exists (
  select 1
  from public.app_datastore_history history
  where history.app_key = datastore.app_key
);

create or replace function public.apply_app_datastore_patch(
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
  operation_name text;
  operation_path text[];
  current_data jsonb;
  current_value jsonb;
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

  for operation in select value from jsonb_array_elements(p_operations)
  loop
    operation_name := operation->>'op';
    select coalesce(array_agg(path_part.value), array[]::text[])
    into operation_path
    from jsonb_array_elements_text(operation->'path') path_part(value);

    if cardinality(operation_path) = 0 then
      raise exception 'patch paths must not be empty';
    end if;

    if operation_name = 'set' then
      current_data := jsonb_set(
        current_data,
        operation_path,
        coalesce(operation->'value', 'null'::jsonb),
        true
      );
    elsif operation_name = 'delete' then
      current_data := current_data #- operation_path;
    elsif operation_name = 'append_unique' then
      current_value := current_data #> operation_path;
      if jsonb_typeof(current_value) is distinct from 'array' then
        current_value := '[]'::jsonb;
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(current_value) existing(value)
        where existing.value = operation->'value'
      ) then
        current_data := jsonb_set(
          current_data,
          operation_path,
          current_value || jsonb_build_array(operation->'value'),
          true
        );
      end if;
    else
      raise exception 'unsupported patch operation: %', operation_name;
    end if;
  end loop;

  update public.app_datastores
  set data = current_data
  where app_key = p_app_key;

  return current_data;
end;
$$;

revoke all on function public.apply_app_datastore_patch(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_app_datastore_patch(text, jsonb) to service_role;

comment on function public.apply_app_datastore_patch(text, jsonb) is
  'Atomically applies field-level AquaCRM state changes while preserving unrelated concurrent data.';
