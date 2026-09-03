-- Codify the dashboard-created `rls_auto_enable()` + `ensure_rls` event trigger.
--
-- The live project (dghzbsxbdatskserctgt) carries this SECURITY DEFINER event
-- trigger, made in the dashboard and in no migration until now — the last drift
-- row `supabase/README.md` flagged. It auto-enables RLS on every new public
-- table at `ddl_command_end`, a defence-in-depth net so a future `create table`
-- that forgets `enable row level security` is still not world-open. Captured
-- verbatim from live on 2026-09-03 so a rebuilt project matches, and RECORDED as
-- a migration so it survives a rebuild. On the live project this is a no-op
-- (the function and trigger already exist).
--
-- Impact: on any project, a new public table gets RLS auto-enabled — which is
-- already the enforced posture. Rollback: `drop event trigger if exists
-- ensure_rls; drop function if exists public.rls_auto_enable();`.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (system schema or not enforced: %.)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
