-- Durable, realm-independent write admission for AquaCRM.
--
-- The PortalState securityControl object is intentionally NOT authoritative:
-- it is cached per process and copied into sandbox/showcase realms.  These
-- rows live outside that blob and are read with cache:no-store before remote
-- effects.  Database triggers/functions take a shared lock on the same global
-- row, so a committed freeze is also the final fence for same-database writes.

create table if not exists public.aqua_write_controls (
  app_key text not null,
  scope_kind text not null check (scope_kind in ('global', 'tenant')),
  scope_id text not null,
  frozen boolean not null,
  revision bigint not null check (revision >= 1),
  reason text,
  actor text,
  changed_at timestamptz not null default now(),
  primary key (app_key, scope_kind, scope_id),
  check (
    (scope_kind = 'global' and scope_id = 'global')
    or (scope_kind = 'tenant' and length(btrim(scope_id)) > 0 and scope_id <> 'global')
  )
);

create table if not exists public.aqua_write_control_events (
  id bigint generated always as identity primary key,
  app_key text not null,
  scope_kind text not null check (scope_kind in ('global', 'tenant')),
  scope_id text not null,
  frozen boolean not null,
  revision bigint not null,
  reason text,
  actor text not null,
  occurred_at timestamptz not null default now()
);

-- A definitive freeze refusal can arrive after a process has optimistically
-- built a PortalState patch.  Never keep that patch only in RAM (a restart
-- would lose it), and never replay it merely because the control was thawed.
-- The exact logical patch is sealed here until an operator explicitly replays
-- or discards it against a newer, currently-unfrozen control revision.
create table if not exists public.aqua_write_quarantines (
  id bigint generated always as identity primary key,
  app_key text not null,
  datastore_key text not null,
  realm_id text not null,
  operation_id uuid not null,
  main_operations jsonb not null check (jsonb_typeof(main_operations) = 'array'),
  sidecar_patches jsonb not null default '[]'::jsonb check (jsonb_typeof(sidecar_patches) = 'array'),
  control_scope_kind text not null check (control_scope_kind in ('global', 'tenant')),
  control_scope_id text not null,
  control_revision bigint not null check (control_revision >= 1),
  control_reason text,
  captured_by text not null,
  captured_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'replayed', 'discarded')),
  resolved_by text,
  resolution_reason text,
  resolved_at timestamptz,
  unique (app_key, datastore_key, operation_id)
);

create index if not exists aqua_write_control_events_scope_idx
  on public.aqua_write_control_events (app_key, scope_kind, scope_id, occurred_at desc);
create index if not exists aqua_write_quarantines_pending_idx
  on public.aqua_write_quarantines (app_key, status, captured_at desc);

alter table public.aqua_write_controls enable row level security;
alter table public.aqua_write_control_events enable row level security;
alter table public.aqua_write_quarantines enable row level security;
revoke all on table public.aqua_write_controls from public, anon, authenticated, service_role;
revoke all on table public.aqua_write_control_events from public, anon, authenticated, service_role;
revoke all on table public.aqua_write_quarantines from public, anon, authenticated, service_role;
revoke all on sequence public.aqua_write_control_events_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.aqua_write_quarantines_id_seq from public, anon, authenticated, service_role;

-- The forward-only cutover starts frozen.  The application and every worker
-- are deployed and verified against this authority before an operator calls
-- set_aqua_write_control(..., false, ...).  A missing global row always denies.
insert into public.aqua_write_controls (
  app_key, scope_kind, scope_id, frozen, revision, reason, actor
) values (
  'aquacrm-portal-state', 'global', 'global', true, 1,
  'Durable write-admission cutover; explicit operator thaw required',
  'migration:20260910130000'
) on conflict (app_key, scope_kind, scope_id) do nothing;

insert into public.aqua_write_control_events (
  app_key, scope_kind, scope_id, frozen, revision, reason, actor
)
select app_key, scope_kind, scope_id, frozen, revision, reason, coalesce(actor, 'migration:20260910130000')
from public.aqua_write_controls
where app_key = 'aquacrm-portal-state'
  and scope_kind = 'global'
  and scope_id = 'global'
  and not exists (
    select 1 from public.aqua_write_control_events event
    where event.app_key = 'aquacrm-portal-state'
      and event.scope_kind = 'global'
      and event.scope_id = 'global'
      and event.revision = 1
  );

-- Every tenant already present in Aqua's LIVE state or direct service tables
-- receives an explicit LIVE row. Missing tenant authority is an outage, never
-- an implicit allow. Legacy `milesymedia` rows are included from the tables
-- themselves even if an older datastore used a different internal agency id.
with tenant_ids(scope_id) as (
  select agency_id
  from public.app_datastores datastore
  cross join lateral jsonb_object_keys(
    case
      when jsonb_typeof(datastore.data -> 'agencies') = 'object'
        then datastore.data -> 'agencies'
      else '{}'::jsonb
    end
  ) as agencies(agency_id)
  where datastore.app_key = 'aquacrm-portal-state'
  union select btrim(agency_id) from public.brand_enquiries where nullif(btrim(agency_id), '') is not null
  union select btrim(agency_id) from public.inbox_channel_connections where nullif(btrim(agency_id), '') is not null
  union select btrim(agency_id) from public.inbox_contact_identities where nullif(btrim(agency_id), '') is not null
  union select btrim(agency_id) from public.inbox_conversations where nullif(btrim(agency_id), '') is not null
  union select btrim(agency_id) from public.inbox_messages where nullif(btrim(agency_id), '') is not null
  union select btrim(tenant_scope) from public.aqua_tag_submissions
    where nullif(btrim(tenant_scope), '') is not null and tenant_scope not like 'site:%'
), inserted as (
  insert into public.aqua_write_controls (
    app_key, scope_kind, scope_id, frozen, revision, reason, actor
  )
  select
    'aquacrm-portal-state', 'tenant', tenant_ids.scope_id, false, 1,
    'Initial durable tenant admission row', 'migration:20260910130000'
  from tenant_ids
  where tenant_ids.scope_id <> 'global'
  on conflict (app_key, scope_kind, scope_id) do nothing
  returning *
)
insert into public.aqua_write_control_events (
  app_key, scope_kind, scope_id, frozen, revision, reason, actor, occurred_at
)
select app_key, scope_kind, scope_id, frozen, revision, reason,
       coalesce(actor, 'migration:20260910130000'), changed_at
from inserted;

create or replace function public.aqua_write_control_json(
  p_control public.aqua_write_controls
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'scope', p_control.scope_kind,
    'scopeId', p_control.scope_id,
    'frozen', p_control.frozen,
    'revision', p_control.revision,
    'reason', p_control.reason,
    'actor', p_control.actor,
    'changedAt', p_control.changed_at
  )
$$;

revoke all on function public.aqua_write_control_json(public.aqua_write_controls)
  from public, anon, authenticated, service_role;

create or replace function public.read_aqua_write_admission(
  p_app_key text,
  p_tenant_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  global_control public.aqua_write_controls%rowtype;
  tenant_control public.aqua_write_controls%rowtype;
begin
  if coalesce(btrim(p_app_key), '') = '' then
    raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:app_key';
  end if;

  select * into global_control
  from public.aqua_write_controls
  where app_key = p_app_key and scope_kind = 'global' and scope_id = 'global';
  if not found then
    raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:global';
  end if;

  if nullif(btrim(p_tenant_id), '') is not null then
    select * into tenant_control
    from public.aqua_write_controls
    where app_key = p_app_key
      and scope_kind = 'tenant'
      and scope_id = btrim(p_tenant_id);
    if not found then
      raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:tenant';
    end if;
  end if;

  return jsonb_build_object(
    'appKey', p_app_key,
    'global', public.aqua_write_control_json(global_control),
    'tenant', case
      when tenant_control.app_key is null then null
      else public.aqua_write_control_json(tenant_control)
    end,
    'pendingQuarantines', (
      select count(*) from public.aqua_write_quarantines quarantine
      where quarantine.app_key = p_app_key and quarantine.status = 'pending'
    ),
    'frozenTenants', (
      select count(*) from public.aqua_write_controls control
      where control.app_key = p_app_key
        and control.scope_kind = 'tenant'
        and control.frozen
    )
  );
end;
$$;

revoke all on function public.read_aqua_write_admission(text, text)
  from public, anon, authenticated;
grant execute on function public.read_aqua_write_admission(text, text) to service_role;

create or replace function public.set_aqua_write_control(
  p_app_key text,
  p_scope_kind text,
  p_scope_id text,
  p_frozen boolean,
  p_reason text,
  p_actor text,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_control public.aqua_write_controls%rowtype;
  saved_control public.aqua_write_controls%rowtype;
  clean_scope_id text;
begin
  if coalesce(btrim(p_app_key), '') = ''
     or p_scope_kind not in ('global', 'tenant')
     or coalesce(btrim(p_actor), '') = ''
     or coalesce(btrim(p_reason), '') = '' then
    raise exception using errcode = 'AQ400', message = 'aqua_write_control_invalid_request';
  end if;
  clean_scope_id := case when p_scope_kind = 'global' then 'global' else nullif(btrim(p_scope_id), '') end;
  if clean_scope_id is null or (p_scope_kind = 'tenant' and clean_scope_id = 'global') then
    raise exception using errcode = 'AQ400', message = 'aqua_write_control_invalid_scope';
  end if;

  -- The mandatory global row is never created opportunistically by a request.
  -- If migration/cutover drift removed it, control actions fail closed.
  select * into current_control
  from public.aqua_write_controls
  where app_key = p_app_key and scope_kind = 'global' and scope_id = 'global'
  for update;
  if not found then
    raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:global';
  end if;

  if p_scope_kind = 'global' then
    saved_control := current_control;
  else
    select * into saved_control
    from public.aqua_write_controls
    where app_key = p_app_key and scope_kind = 'tenant' and scope_id = clean_scope_id
    for update;
  end if;

  if p_expected_revision is not null
     and coalesce(saved_control.revision, 0) <> p_expected_revision then
    raise exception using errcode = 'AQ409', message = 'aqua_write_control_revision_conflict';
  end if;

  if p_scope_kind = 'tenant' and saved_control.app_key is null then
    insert into public.aqua_write_controls (
      app_key, scope_kind, scope_id, frozen, revision, reason, actor, changed_at
    ) values (
      p_app_key, 'tenant', clean_scope_id, p_frozen, 1,
      btrim(p_reason), btrim(p_actor), now()
    ) returning * into saved_control;
  else
    update public.aqua_write_controls
    set frozen = p_frozen,
        revision = revision + 1,
        reason = btrim(p_reason),
        actor = btrim(p_actor),
        changed_at = now()
    where app_key = p_app_key
      and scope_kind = p_scope_kind
      and scope_id = clean_scope_id
    returning * into saved_control;
  end if;

  insert into public.aqua_write_control_events (
    app_key, scope_kind, scope_id, frozen, revision, reason, actor, occurred_at
  ) values (
    saved_control.app_key, saved_control.scope_kind, saved_control.scope_id,
    saved_control.frozen, saved_control.revision, saved_control.reason,
    btrim(p_actor), saved_control.changed_at
  );

  return public.aqua_write_control_json(saved_control);
end;
$$;

revoke all on function public.set_aqua_write_control(text, text, text, boolean, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.set_aqua_write_control(text, text, text, boolean, text, text, bigint)
  to service_role;

create or replace function public.aqua_assert_write_admitted(
  p_app_key text,
  p_tenant_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  global_control public.aqua_write_controls%rowtype;
  tenant_control public.aqua_write_controls%rowtype;
begin
  select * into global_control
  from public.aqua_write_controls
  where app_key = p_app_key and scope_kind = 'global' and scope_id = 'global'
  for share;
  if not found then
    raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:global';
  end if;
  if global_control.frozen then
    raise exception using
      errcode = 'AQ423',
      message = 'aqua_writes_frozen:global',
      detail = coalesce(global_control.reason, 'global read-only is active');
  end if;

  -- A thaw does not implicitly authorise optimistic patches captured during
  -- the incident. Until every quarantine has an explicit disposition, normal
  -- application/provider effects stay closed. The resolution RPC sets a
  -- transaction-local marker for the one reviewed replay it is applying.
  if exists (
    select 1 from public.aqua_write_quarantines quarantine
    where quarantine.app_key = p_app_key and quarantine.status = 'pending'
  ) and nullif(current_setting('aqua.quarantine_replay_id', true), '') is null then
    raise exception using
      errcode = 'AQ423',
      message = 'aqua_writes_frozen:pending-quarantine',
      detail = 'operator reconciliation is required before writes resume';
  end if;

  if nullif(btrim(p_tenant_id), '') is not null then
    select * into tenant_control
    from public.aqua_write_controls
    where app_key = p_app_key
      and scope_kind = 'tenant'
      and scope_id = btrim(p_tenant_id)
    for share;
    if not found then
      raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:tenant';
    end if;
    if tenant_control.frozen then
      raise exception using
        errcode = 'AQ423',
        message = 'aqua_writes_frozen:tenant',
        detail = coalesce(tenant_control.reason, 'tenant containment is active');
      end if;
  elsif exists (
    select 1 from public.aqua_write_controls control
    where control.app_key = p_app_key
      and control.scope_kind = 'tenant'
      and control.frozen
  ) then
    -- A context-free/platform PortalState write can touch any tenant inside the
    -- shared document. While one tenant is contained it cannot prove exclusion,
    -- so the honest minimum-blast-radius fallback is to close this broad lane.
    raise exception using
      errcode = 'AQ423',
      message = 'aqua_writes_frozen:tenant-context-required',
      detail = 'a tenant containment is active and this write has no exact tenant lineage';
  end if;
end;
$$;

revoke all on function public.aqua_assert_write_admitted(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.record_aqua_write_quarantine(
  p_app_key text,
  p_datastore_key text,
  p_realm_id text,
  p_operation_id uuid,
  p_main_operations jsonb,
  p_sidecar_patches jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  global_control public.aqua_write_controls%rowtype;
  denial_control public.aqua_write_controls%rowtype;
  quarantine public.aqua_write_quarantines%rowtype;
begin
  if coalesce(btrim(p_app_key), '') = ''
     or coalesce(btrim(p_datastore_key), '') = ''
     or coalesce(btrim(p_realm_id), '') = ''
     or coalesce(btrim(p_actor), '') = ''
     or p_operation_id is null
     or jsonb_typeof(p_main_operations) is distinct from 'array'
     or jsonb_typeof(p_sidecar_patches) is distinct from 'array'
     or not (
       p_datastore_key = p_app_key
       or p_datastore_key like p_app_key || ':%'
     ) then
    raise exception using errcode = 'AQ400', message = 'aqua_write_quarantine_invalid_request';
  end if;

  select * into global_control
  from public.aqua_write_controls
  where app_key = p_app_key and scope_kind = 'global' and scope_id = 'global'
  for share;
  if not found then
    raise exception using errcode = 'AQ503', message = 'aqua_write_control_unavailable:global';
  end if;
  if global_control.frozen then
    denial_control := global_control;
  else
    select * into denial_control
    from public.aqua_write_controls control
    where control.app_key = p_app_key
      and control.scope_kind = 'tenant'
      and control.frozen
    order by control.changed_at desc, control.scope_id
    limit 1
    for share;
    if not found then
      if not exists (
        select 1 from public.aqua_write_quarantines existing
        where existing.app_key = p_app_key and existing.status = 'pending'
      ) then
        raise exception using errcode = 'AQ409', message = 'aqua_write_quarantine_requires_closed_admission';
      end if;
      -- A stale worker caught by the pending-quarantine fence must still seal
      -- its exact patch. Binding it to the current global revision deliberately
      -- requires a later explicit global revision before replay.
      denial_control := global_control;
    end if;
  end if;

  insert into public.aqua_write_quarantines (
    app_key, datastore_key, realm_id, operation_id,
    main_operations, sidecar_patches, control_scope_kind, control_scope_id,
    control_revision, control_reason, captured_by
  ) values (
    p_app_key, p_datastore_key, btrim(p_realm_id), p_operation_id,
    p_main_operations, p_sidecar_patches, denial_control.scope_kind, denial_control.scope_id,
    denial_control.revision,
    coalesce(denial_control.reason, 'operator quarantine reconciliation in progress'), btrim(p_actor)
  ) on conflict (app_key, datastore_key, operation_id) do nothing;

  select * into quarantine
  from public.aqua_write_quarantines
  where app_key = p_app_key
    and datastore_key = p_datastore_key
    and operation_id = p_operation_id;
  if quarantine.main_operations is distinct from p_main_operations
     or quarantine.sidecar_patches is distinct from p_sidecar_patches then
    raise exception using errcode = 'AQ409', message = 'aqua_write_quarantine_operation_mismatch';
  end if;

  return jsonb_build_object(
    'id', quarantine.id,
    'status', quarantine.status,
    'operationId', quarantine.operation_id,
    'controlScope', quarantine.control_scope_kind,
    'controlScopeId', quarantine.control_scope_id,
    'controlRevision', quarantine.control_revision,
    'controlReason', quarantine.control_reason,
    'capturedAt', quarantine.captured_at
  );
end;
$$;

revoke all on function public.record_aqua_write_quarantine(text, text, text, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_aqua_write_quarantine(text, text, text, uuid, jsonb, jsonb, text)
  to service_role;

create or replace function public.list_aqua_write_quarantines(
  p_app_key text,
  p_status text default 'pending'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', quarantine.id,
    'datastoreKey', quarantine.datastore_key,
    'realmId', quarantine.realm_id,
    'operationId', quarantine.operation_id,
    'controlScope', quarantine.control_scope_kind,
    'controlScopeId', quarantine.control_scope_id,
    'controlRevision', quarantine.control_revision,
    'controlReason', quarantine.control_reason,
    'capturedBy', quarantine.captured_by,
    'capturedAt', quarantine.captured_at,
    'status', quarantine.status,
    'resolvedBy', quarantine.resolved_by,
    'resolutionReason', quarantine.resolution_reason,
    'resolvedAt', quarantine.resolved_at
  ) order by quarantine.captured_at desc), '[]'::jsonb)
  from public.aqua_write_quarantines quarantine
  where quarantine.app_key = p_app_key
    and (p_status is null or quarantine.status = p_status)
$$;

revoke all on function public.list_aqua_write_quarantines(text, text)
  from public, anon, authenticated;
grant execute on function public.list_aqua_write_quarantines(text, text) to service_role;

create or replace function public.resolve_aqua_write_quarantine(
  p_app_key text,
  p_quarantine_id bigint,
  p_action text,
  p_actor text,
  p_reason text,
  p_expected_control_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quarantine public.aqua_write_quarantines%rowtype;
  current_control public.aqua_write_controls%rowtype;
  replay_result jsonb;
begin
  if p_action not in ('replay', 'discard')
     or coalesce(btrim(p_actor), '') = ''
     or coalesce(btrim(p_reason), '') = '' then
    raise exception using errcode = 'AQ400', message = 'aqua_write_quarantine_invalid_resolution';
  end if;

  select * into quarantine
  from public.aqua_write_quarantines
  where id = p_quarantine_id and app_key = p_app_key
  for update;
  if not found then
    raise exception using errcode = 'AQ404', message = 'aqua_write_quarantine_not_found';
  end if;
  select * into current_control
  from public.aqua_write_controls
  where app_key = p_app_key
    and scope_kind = quarantine.control_scope_kind
    and scope_id = quarantine.control_scope_id
  for share;
  if not found then
    raise exception using
      errcode = 'AQ503',
      message = 'aqua_write_control_unavailable:' || quarantine.control_scope_kind;
  end if;
  if quarantine.status <> 'pending' then
    return jsonb_build_object(
      'id', quarantine.id,
      'status', quarantine.status,
      'controlRevision', current_control.revision,
      'replay', null
    );
  end if;

  if p_action = 'replay' then
    if current_control.frozen
       or current_control.revision <= quarantine.control_revision
       or p_expected_control_revision is null
       or current_control.revision <> p_expected_control_revision then
      raise exception using errcode = 'AQ423', message = 'aqua_write_quarantine_revalidation_required';
    end if;
    if jsonb_array_length(quarantine.sidecar_patches) > 0 then
      perform set_config('aqua.quarantine_replay_id', quarantine.id::text, true);
      replay_result := public.apply_app_datastore_patch_with_sidecars(
        quarantine.datastore_key,
        quarantine.operation_id,
        quarantine.main_operations,
        quarantine.sidecar_patches
      );
    else
      perform set_config('aqua.quarantine_replay_id', quarantine.id::text, true);
      replay_result := public.apply_app_datastore_patch(
        quarantine.datastore_key,
        quarantine.operation_id,
        quarantine.main_operations
      );
    end if;
  end if;

  update public.aqua_write_quarantines
  set status = case when p_action = 'replay' then 'replayed' else 'discarded' end,
      resolved_by = btrim(p_actor),
      resolution_reason = btrim(p_reason),
      resolved_at = now()
  where id = quarantine.id
  returning * into quarantine;

  return jsonb_build_object(
    'id', quarantine.id,
    'status', quarantine.status,
    'controlRevision', current_control.revision,
    'replay', replay_result
  );
end;
$$;

revoke all on function public.resolve_aqua_write_quarantine(text, bigint, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.resolve_aqua_write_quarantine(text, bigint, text, text, text, bigint)
  to service_role;

-- Map only registered Aqua app keys.  Other ecosystem applications share
-- app_datastores and must not be frozen by AquaCRM's incident control.
create or replace function public.aqua_controlled_app_key(p_datastore_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select control.app_key
  from public.aqua_write_controls control
  where control.scope_kind = 'global'
    and control.scope_id = 'global'
    and (
      p_datastore_key = control.app_key
      or p_datastore_key like control.app_key || ':%'
    )
  order by length(control.app_key) desc
  limit 1
$$;

revoke all on function public.aqua_controlled_app_key(text)
  from public, anon, authenticated, service_role;

create or replace function public.aqua_enforce_datastore_write_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_key text;
  controlled_app text;
begin
  row_key := case when tg_op = 'DELETE' then old.app_key else new.app_key end;
  controlled_app := public.aqua_controlled_app_key(row_key);
  if controlled_app is not null then
    perform public.aqua_assert_write_admitted(controlled_app, null);
  end if;
  -- A newly-created LIVE agency becomes durable control-plane state in the
  -- same transaction as its first PortalState row. Sandbox/showcase rows have
  -- suffixed datastore keys and can never create authoritative tenant rows.
  if tg_table_name = 'app_datastores'
     and tg_op <> 'DELETE'
     and row_key = controlled_app then
    with inserted as (
      insert into public.aqua_write_controls (
        app_key, scope_kind, scope_id, frozen, revision, reason, actor
      )
      select
        controlled_app, 'tenant', agency_id, false, 1,
        'Tenant discovered in authoritative LIVE PortalState',
        'trigger:aqua_enforce_datastore_write_admission'
      from jsonb_object_keys(
        case
          when jsonb_typeof(new.data -> 'agencies') = 'object'
            then new.data -> 'agencies'
          else '{}'::jsonb
        end
      ) as agencies(agency_id)
      where agency_id <> 'global'
      on conflict (app_key, scope_kind, scope_id) do nothing
      returning *
    )
    insert into public.aqua_write_control_events (
      app_key, scope_kind, scope_id, frozen, revision, reason, actor, occurred_at
    )
    select app_key, scope_kind, scope_id, frozen, revision, reason,
           coalesce(actor, 'trigger:aqua_enforce_datastore_write_admission'), changed_at
    from inserted;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.aqua_enforce_datastore_write_admission()
  from public, anon, authenticated, service_role;

drop trigger if exists aqua_write_admission_app_datastores on public.app_datastores;
create trigger aqua_write_admission_app_datastores
before insert or update or delete on public.app_datastores
for each row execute function public.aqua_enforce_datastore_write_admission();

drop trigger if exists aqua_write_admission_patch_receipts on public.app_datastore_patch_receipts;
create trigger aqua_write_admission_patch_receipts
before insert or update or delete on public.app_datastore_patch_receipts
for each row execute function public.aqua_enforce_datastore_write_admission();

-- Aqua-owned direct service-role tables.  The generic trigger receives the
-- trusted tenant column name; blank/site-only legacy scopes still receive the
-- global fence but cannot masquerade as an agency-level authority.
create or replace function public.aqua_enforce_service_table_write_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  tenant_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if coalesce(tg_argv[0], '') <> '' then
    tenant_id := nullif(btrim(row_data ->> tg_argv[0]), '');
  end if;
  if tenant_id like 'site:%' then tenant_id := null; end if;
  if tg_table_name = 'brand_enquiries' and tenant_id is null then
    tenant_id := nullif(btrim(row_data->'metadata'->>'agencyId'), '');
  end if;
  perform public.aqua_assert_write_admitted('aquacrm-portal-state', tenant_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.aqua_enforce_service_table_write_admission()
  from public, anon, authenticated, service_role;

alter table public.website_consent_events add column if not exists agency_id text;
create index if not exists website_consent_events_agency_created_idx
  on public.website_consent_events (agency_id, created_at desc);

drop trigger if exists aqua_write_admission_brand_enquiries on public.brand_enquiries;
create trigger aqua_write_admission_brand_enquiries
before insert or update or delete on public.brand_enquiries
for each row execute function public.aqua_enforce_service_table_write_admission('agency_id');

drop trigger if exists aqua_write_admission_website_consent_events on public.website_consent_events;
create trigger aqua_write_admission_website_consent_events
before insert or update or delete on public.website_consent_events
for each row execute function public.aqua_enforce_service_table_write_admission('agency_id');

drop trigger if exists aqua_write_admission_inbox_connections on public.inbox_channel_connections;
create trigger aqua_write_admission_inbox_connections
before insert or update or delete on public.inbox_channel_connections
for each row execute function public.aqua_enforce_service_table_write_admission('agency_id');

drop trigger if exists aqua_write_admission_inbox_identities on public.inbox_contact_identities;
create trigger aqua_write_admission_inbox_identities
before insert or update or delete on public.inbox_contact_identities
for each row execute function public.aqua_enforce_service_table_write_admission('agency_id');

drop trigger if exists aqua_write_admission_inbox_conversations on public.inbox_conversations;
create trigger aqua_write_admission_inbox_conversations
before insert or update or delete on public.inbox_conversations
for each row execute function public.aqua_enforce_service_table_write_admission('agency_id');

drop trigger if exists aqua_write_admission_inbox_messages on public.inbox_messages;
create trigger aqua_write_admission_inbox_messages
before insert or update or delete on public.inbox_messages
for each row execute function public.aqua_enforce_service_table_write_admission('agency_id');

drop trigger if exists aqua_write_admission_inbox_webhooks on public.inbox_webhook_events;
create trigger aqua_write_admission_inbox_webhooks
before insert or update or delete on public.inbox_webhook_events
for each row execute function public.aqua_enforce_service_table_write_admission('');

drop trigger if exists aqua_write_admission_aqua_tag_submissions on public.aqua_tag_submissions;
create trigger aqua_write_admission_aqua_tag_submissions
before insert or update or delete on public.aqua_tag_submissions
for each row execute function public.aqua_enforce_service_table_write_admission('tenant_scope');

-- App-keyed claim tables are fenced only when their key belongs to AquaCRM.
drop trigger if exists aqua_write_admission_editor_ai_claims on public.editor_ai_reply_claims;
create trigger aqua_write_admission_editor_ai_claims
before insert or update or delete on public.editor_ai_reply_claims
for each row execute function public.aqua_enforce_datastore_write_admission();

drop trigger if exists aqua_write_admission_lead_conversion on public.lead_conversion_operations;
create trigger aqua_write_admission_lead_conversion
before insert or update or delete on public.lead_conversion_operations
for each row execute function public.aqua_enforce_datastore_write_admission();

-- Product-workspace admission is inside claim/renew rather than a blanket
-- trigger.  Holder-checked release remains possible during an incident so
-- containment cannot strand leases.  Direct table DML is revoked to prevent a
-- service-role caller bypassing the functions.
revoke all on table public.product_workspace_leases from service_role;

drop function if exists public.claim_product_workspace_lease(text, text, text, integer);
create or replace function public.claim_product_workspace_lease(
  p_app_key text,
  p_workspace_key text,
  p_holder_id text,
  p_lease_ms integer,
  p_tenant_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lease public.product_workspace_leases%rowtype;
  lease_interval interval;
begin
  if coalesce(btrim(p_app_key), '') = ''
    or coalesce(btrim(p_workspace_key), '') = ''
    or coalesce(btrim(p_holder_id), '') = ''
    or coalesce(btrim(p_tenant_id), '') = '' then
    raise exception using errcode = 'AQ400', message = 'product_workspace_lease_context_required';
  end if;
  perform public.aqua_assert_write_admitted(p_app_key, p_tenant_id);
  lease_interval := make_interval(
    secs => greatest(1000, least(coalesce(p_lease_ms, 60000), 60000))::double precision / 1000.0
  );
  insert into public.product_workspace_leases (
    app_key, workspace_key, holder_id, lease_expires_at
  ) values (
    p_app_key, p_workspace_key, p_holder_id, now() + lease_interval
  ) on conflict (app_key, workspace_key) do nothing;
  select * into lease from public.product_workspace_leases
  where app_key = p_app_key and workspace_key = p_workspace_key for update;
  if lease.holder_id <> p_holder_id and lease.lease_expires_at > now() then
    return jsonb_build_object(
      'state', 'held',
      'leaseExpiresAt', floor(extract(epoch from lease.lease_expires_at) * 1000)
    );
  end if;
  update public.product_workspace_leases
  set holder_id = p_holder_id,
      lease_expires_at = now() + lease_interval,
      updated_at = now()
  where app_key = p_app_key and workspace_key = p_workspace_key
  returning * into lease;
  return jsonb_build_object(
    'state', 'claimed',
    'leaseExpiresAt', floor(extract(epoch from lease.lease_expires_at) * 1000)
  );
end;
$$;

revoke all on function public.claim_product_workspace_lease(text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_product_workspace_lease(text, text, text, integer, text)
  to service_role;

drop function if exists public.renew_product_workspace_lease(text, text, text, integer);
create or replace function public.renew_product_workspace_lease(
  p_app_key text,
  p_workspace_key text,
  p_holder_id text,
  p_lease_ms integer,
  p_tenant_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lease public.product_workspace_leases%rowtype;
  lease_interval interval;
  observed_expiry timestamptz;
begin
  if coalesce(btrim(p_app_key), '') = ''
    or coalesce(btrim(p_workspace_key), '') = ''
    or coalesce(btrim(p_holder_id), '') = ''
    or coalesce(btrim(p_tenant_id), '') = '' then
    raise exception using errcode = 'AQ400', message = 'product_workspace_lease_context_required';
  end if;
  perform public.aqua_assert_write_admitted(p_app_key, p_tenant_id);
  lease_interval := make_interval(
    secs => greatest(1000, least(coalesce(p_lease_ms, 60000), 60000))::double precision / 1000.0
  );
  update public.product_workspace_leases
  set lease_expires_at = now() + lease_interval,
      updated_at = now()
  where app_key = p_app_key
    and workspace_key = p_workspace_key
    and holder_id = p_holder_id
    and lease_expires_at > now()
  returning * into lease;
  if found then
    return jsonb_build_object(
      'state', 'claimed',
      'leaseExpiresAt', floor(extract(epoch from lease.lease_expires_at) * 1000)
    );
  end if;
  select lease_expires_at into observed_expiry
  from public.product_workspace_leases
  where app_key = p_app_key and workspace_key = p_workspace_key;
  return jsonb_build_object(
    'state', 'held',
    'leaseExpiresAt', coalesce(
      floor(extract(epoch from observed_expiry) * 1000),
      floor(extract(epoch from now()) * 1000)
    )
  );
end;
$$;

revoke all on function public.renew_product_workspace_lease(text, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.renew_product_workspace_lease(text, text, text, integer, text)
  to service_role;

-- Reassert the cleanup-only escape explicitly.  This function remains holder
-- checked and does not call aqua_assert_write_admitted.
revoke all on function public.release_product_workspace_lease(text, text, text)
  from public, anon, authenticated;
grant execute on function public.release_product_workspace_lease(text, text, text)
  to service_role;

comment on table public.aqua_write_controls is
  'Authoritative LIVE write-admission state. PortalState securityControl is not authoritative for write containment.';
comment on table public.aqua_write_control_events is
  'Append-only durable audit of authoritative global and tenant write-control changes.';
