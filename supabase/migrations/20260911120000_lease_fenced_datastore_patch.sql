-- ═══════════════════════════════════════════════════════════════════════════
-- Lease-fence the authoritative datastore write IN THE SAME TRANSACTION.
--
-- Before this migration the product-workspace lease was validated only in the
-- application layer (a `beforeCommit` renewal RPC) — a SEPARATE transaction from
-- the datastore write RPC. That leaves a check-then-act window: a writer whose
-- lease expired (or was acquired by a successor) after the renewal but before
-- the write commits could still commit a stale mutation, because the write RPC
-- itself validated no ownership. (Independent acceptance classified this NO-GO.)
--
-- The fix threads the fences the writer holds — each `{workspaceKey, holderId}`
-- for the writer's live product-workspace leases — into the write RPCs, which
-- now verify, in the same transaction as the write and while holding the lease
-- rows FOR UPDATE, that every fence still names an unexpired, still-owned lease.
-- If any lease is lost, the write RAISES `product_workspace_lease_lost` and the
-- whole transaction rolls back; a successor's claim (which also takes the lease
-- row FOR UPDATE) is therefore serialized against the fenced write.
--
-- Fences are checked ONLY on the fresh-apply path — never on the receipt-
-- idempotent replay of an already-committed operation (that write already
-- happened under a valid lease), and never when `p_lease_fences` is the default
-- empty array (an uncoordinated PortalState flush that holds no lease). The lease
-- app_key equals the datastore `p_app_key` (both are `stateKeyForRealm`), so a
-- fence needs to carry only the workspace key and holder id.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.apply_app_datastore_patch(text, uuid, jsonb);
create or replace function public.apply_app_datastore_patch(
  p_app_key text,
  p_operation_id uuid,
  p_operations jsonb,
  p_lease_fences jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  claimed boolean := false;
  existing_payload jsonb;
  request_payload jsonb := jsonb_build_object('mainOperations', p_operations);
  current_data jsonb;
  fence jsonb;
begin
  if p_app_key is null or btrim(p_app_key) = '' then raise exception 'app key is required'; end if;
  if p_operation_id is null then raise exception 'operation id is required'; end if;

  delete from public.app_datastore_patch_receipts
  where created_at < now() - interval '30 days';

  insert into public.app_datastore_patch_receipts(app_key, operation_id, request_payload)
  values (p_app_key, p_operation_id, request_payload)
  on conflict (app_key, operation_id) do nothing
  returning true into claimed;

  if claimed is not true then
    select receipt.request_payload into existing_payload
    from public.app_datastore_patch_receipts receipt
    where receipt.app_key = p_app_key and receipt.operation_id = p_operation_id;
    if existing_payload is distinct from request_payload then
      raise exception 'operation id payload mismatch';
    end if;
    -- Idempotent replay of an already-committed operation: return the current
    -- row WITHOUT reapplying and WITHOUT fencing (that write already committed
    -- under a valid lease; re-fencing here would spuriously reject recovery).
    select data into current_data from public.app_datastores where app_key = p_app_key;
    return jsonb_build_object(
      'operationId', p_operation_id::text,
      'main', coalesce(current_data, '{}'::jsonb)
    );
  end if;

  -- Fresh apply: fence the write to every lease the writer holds, in the same
  -- transaction, ordered by workspace key so concurrent fenced writers take the
  -- lease-row locks in a consistent order (no deadlock).
  if jsonb_typeof(p_lease_fences) = 'array' then
    for fence in
      select value from jsonb_array_elements(p_lease_fences)
      order by value->>'workspaceKey'
    loop
      if nullif(btrim(fence->>'workspaceKey'), '') is null
        or nullif(btrim(fence->>'holderId'), '') is null then
        raise exception using errcode = 'AQ400', message = 'lease fence requires workspaceKey and holderId';
      end if;
      perform 1 from public.product_workspace_leases
       where app_key = p_app_key
         and workspace_key = fence->>'workspaceKey'
         and holder_id = fence->>'holderId'
         and lease_expires_at > now()
       for update;
      if not found then
        raise exception using errcode = 'AQ409', message = 'product_workspace_lease_lost';
      end if;
    end loop;
  end if;

  insert into public.app_datastores(app_key, data) values (p_app_key, '{}'::jsonb)
  on conflict (app_key) do nothing;
  select data into current_data from public.app_datastores where app_key = p_app_key for update;
  current_data := public.aqua_apply_jsonb_patch(current_data, p_operations);
  update public.app_datastores set data = current_data where app_key = p_app_key;
  return jsonb_build_object('operationId', p_operation_id::text, 'main', current_data);
end;
$$;

revoke all on function public.apply_app_datastore_patch(text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_app_datastore_patch(text, uuid, jsonb, jsonb) to service_role;
comment on function public.apply_app_datastore_patch(text, uuid, jsonb, jsonb) is
  'Applies one receipt-deduplicated AquaCRM state patch, lease-fenced in-transaction against the writer''s held product-workspace leases.';

drop function if exists public.apply_app_datastore_patch_with_sidecars(text, uuid, jsonb, jsonb);
create or replace function public.apply_app_datastore_patch_with_sidecars(
  p_app_key text,
  p_operation_id uuid,
  p_main_operations jsonb,
  p_sidecar_patches jsonb,
  p_lease_fences jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  claimed boolean := false;
  existing_payload jsonb;
  request_payload jsonb := jsonb_build_object(
    'mainOperations', p_main_operations,
    'sidecarPatches', p_sidecar_patches
  );
  all_keys text[];
  patch jsonb;
  sidecar_key text;
  collection_key text;
  current_main jsonb;
  current_sidecar jsonb;
  saved_sidecars jsonb := '{}'::jsonb;
  duplicate_result jsonb;
  fence jsonb;
begin
  if p_app_key is null or btrim(p_app_key) = '' then raise exception 'app key is required'; end if;
  if p_operation_id is null then raise exception 'operation id is required'; end if;
  if jsonb_typeof(p_main_operations) is distinct from 'array' then raise exception 'main operations must be an array'; end if;
  if jsonb_typeof(p_sidecar_patches) is distinct from 'array' then raise exception 'sidecar patches must be an array'; end if;

  delete from public.app_datastore_patch_receipts
  where created_at < now() - interval '30 days';

  insert into public.app_datastore_patch_receipts(app_key, operation_id, request_payload)
  values (p_app_key, p_operation_id, request_payload)
  on conflict (app_key, operation_id) do nothing
  returning true into claimed;

  if claimed is not true then
    select receipt.request_payload into existing_payload
    from public.app_datastore_patch_receipts receipt
    where receipt.app_key = p_app_key and receipt.operation_id = p_operation_id;
    if existing_payload is distinct from request_payload then raise exception 'operation id payload mismatch'; end if;
    -- Idempotent replay: return current rows without reapplying and without
    -- fencing (see apply_app_datastore_patch).
    select jsonb_build_object(
      'operationId', p_operation_id::text,
      'main', coalesce(
        (select data from public.app_datastores where app_key = p_app_key),
        '{}'::jsonb
      ),
      'sidecars', coalesce(
        (
          select jsonb_object_agg(
            requested.patch->>'slug',
            coalesce(datastore.data, '{}'::jsonb)
          )
          from jsonb_array_elements(p_sidecar_patches) requested(patch)
          left join public.app_datastores datastore
            on datastore.app_key = p_app_key || ':' || (requested.patch->>'slug')
        ),
        '{}'::jsonb
      )
    ) into duplicate_result;
    return duplicate_result;
  end if;

  -- Fresh apply: fence the write to every lease the writer holds (see
  -- apply_app_datastore_patch). Ordered by workspace key for consistent locking.
  if jsonb_typeof(p_lease_fences) = 'array' then
    for fence in
      select value from jsonb_array_elements(p_lease_fences)
      order by value->>'workspaceKey'
    loop
      if nullif(btrim(fence->>'workspaceKey'), '') is null
        or nullif(btrim(fence->>'holderId'), '') is null then
        raise exception using errcode = 'AQ400', message = 'lease fence requires workspaceKey and holderId';
      end if;
      perform 1 from public.product_workspace_leases
       where app_key = p_app_key
         and workspace_key = fence->>'workspaceKey'
         and holder_id = fence->>'holderId'
         and lease_expires_at > now()
       for update;
      if not found then
        raise exception using errcode = 'AQ409', message = 'product_workspace_lease_lost';
      end if;
    end loop;
  end if;

  select array_agg(key_name order by key_name) into all_keys
  from (
    select p_app_key as key_name
    union
    select p_app_key || ':' || (value->>'slug') from jsonb_array_elements(p_sidecar_patches)
  ) keys;
  insert into public.app_datastores(app_key, data)
  select key_name, '{}'::jsonb from unnest(all_keys) key_name
  on conflict (app_key) do nothing;
  perform app_key from public.app_datastores
  where app_key = any(all_keys) order by app_key for update;

  select data into current_main from public.app_datastores where app_key = p_app_key;
  for patch in select value from jsonb_array_elements(p_sidecar_patches) order by value->>'slug' loop
    if nullif(btrim(patch->>'slug'), '') is null or nullif(btrim(patch->>'key'), '') is null then
      raise exception 'sidecar slug and collection key are required';
    end if;
    sidecar_key := p_app_key || ':' || (patch->>'slug');
    collection_key := patch->>'key';
    select data into current_sidecar from public.app_datastores where app_key = sidecar_key;

    if coalesce(current_sidecar->>'__aquaSidecarAuthoritative', 'false') <> 'true'
       and jsonb_typeof(current_sidecar->collection_key) is distinct from 'object' then
      current_sidecar := jsonb_set(
        coalesce(current_sidecar, '{}'::jsonb),
        array[collection_key],
        coalesce(current_main->collection_key, '{}'::jsonb),
        true
      );
    elsif coalesce(current_sidecar->>'__aquaSidecarAuthoritative', 'false') <> 'true'
       and current_sidecar->collection_key = '{}'::jsonb then
      current_sidecar := jsonb_set(current_sidecar, array[collection_key], coalesce(current_main->collection_key, '{}'::jsonb), true);
    end if;
    current_sidecar := public.aqua_apply_jsonb_patch(current_sidecar, patch->'operations');
    current_sidecar := jsonb_set(current_sidecar, array['__aquaSidecarAuthoritative'], 'true'::jsonb, true);
    update public.app_datastores set data = current_sidecar where app_key = sidecar_key;
    current_main := jsonb_set(current_main, array[collection_key], '{}'::jsonb, true);
    saved_sidecars := jsonb_set(saved_sidecars, array[patch->>'slug'], current_sidecar, true);
  end loop;

  current_main := public.aqua_apply_jsonb_patch(current_main, p_main_operations);
  update public.app_datastores set data = current_main where app_key = p_app_key;
  return jsonb_build_object(
    'operationId', p_operation_id::text,
    'main', current_main,
    'sidecars', saved_sidecars
  );
end;
$$;

revoke all on function public.apply_app_datastore_patch_with_sidecars(text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_app_datastore_patch_with_sidecars(text, uuid, jsonb, jsonb, jsonb)
  to service_role;
comment on function public.apply_app_datastore_patch_with_sidecars(text, uuid, jsonb, jsonb, jsonb) is
  'Receipt-deduplicated atomic commit of AquaCRM main state and flush-owned sidecar patches, lease-fenced in-transaction against the writer''s held product-workspace leases.';
