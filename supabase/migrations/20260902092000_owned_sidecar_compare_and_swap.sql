-- Main PortalState and flush-owned sidecars must commit in one transaction.
-- Publishing a whole sidecar before main allows later writers to inherit data
-- from a transaction whose main write ultimately fails; compensation cannot
-- safely remove that inherited data.
CREATE OR REPLACE FUNCTION public.apply_app_datastore_patch_with_sidecars(
  p_app_key TEXT,
  p_operation_id UUID,
  p_main_operations JSONB,
  p_sidecar_patches JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claimed BOOLEAN := FALSE;
  existing_payload JSONB;
  request_payload JSONB := JSONB_BUILD_OBJECT(
    'mainOperations', p_main_operations,
    'sidecarPatches', p_sidecar_patches
  );
  all_keys TEXT[];
  patch JSONB;
  sidecar_key TEXT;
  collection_key TEXT;
  current_main JSONB;
  current_sidecar JSONB;
  saved_sidecars JSONB := '{}'::JSONB;
  duplicate_result JSONB;
BEGIN
  IF p_app_key IS NULL OR BTRIM(p_app_key) = '' THEN RAISE EXCEPTION 'app key is required'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'operation id is required'; END IF;
  IF JSONB_TYPEOF(p_main_operations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'main operations must be an array'; END IF;
  IF JSONB_TYPEOF(p_sidecar_patches) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'sidecar patches must be an array'; END IF;

  -- Recent/active receipts cannot match this conservative retention cutoff;
  -- it exceeds any in-process same-operation reconciliation lifetime.
  DELETE FROM public.app_datastore_patch_receipts
  WHERE created_at < NOW() - INTERVAL '30 days';

  INSERT INTO public.app_datastore_patch_receipts(app_key, operation_id, request_payload)
  VALUES (p_app_key, p_operation_id, request_payload)
  ON CONFLICT (app_key, operation_id) DO NOTHING
  RETURNING TRUE INTO claimed;

  IF claimed IS NOT TRUE THEN
    SELECT receipt.request_payload INTO existing_payload
    FROM public.app_datastore_patch_receipts receipt
    WHERE receipt.app_key = p_app_key AND receipt.operation_id = p_operation_id;
    IF existing_payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'operation id payload mismatch'; END IF;
    -- One SQL statement means one READ COMMITTED statement snapshot. Reading
    -- main and sidecars in a PL/pgSQL loop could otherwise return a torn mix if
    -- a successor committed between SELECT statements.
    SELECT JSONB_BUILD_OBJECT(
      'operationId', p_operation_id::TEXT,
      'main', COALESCE(
        (SELECT data FROM public.app_datastores WHERE app_key = p_app_key),
        '{}'::JSONB
      ),
      'sidecars', COALESCE(
        (
          SELECT JSONB_OBJECT_AGG(
            requested.patch->>'slug',
            COALESCE(datastore.data, '{}'::JSONB)
          )
          FROM JSONB_ARRAY_ELEMENTS(p_sidecar_patches) requested(patch)
          LEFT JOIN public.app_datastores datastore
            ON datastore.app_key = p_app_key || ':' || (requested.patch->>'slug')
        ),
        '{}'::JSONB
      )
    ) INTO duplicate_result;
    RETURN duplicate_result;
  END IF;

  SELECT ARRAY_AGG(key_name ORDER BY key_name) INTO all_keys
  FROM (
    SELECT p_app_key AS key_name
    UNION
    SELECT p_app_key || ':' || (value->>'slug') FROM JSONB_ARRAY_ELEMENTS(p_sidecar_patches)
  ) keys;
  INSERT INTO public.app_datastores(app_key, data)
  SELECT key_name, '{}'::JSONB FROM UNNEST(all_keys) key_name
  ON CONFLICT (app_key) DO NOTHING;
  PERFORM app_key FROM public.app_datastores
  WHERE app_key = ANY(all_keys) ORDER BY app_key FOR UPDATE;

  SELECT data INTO current_main FROM public.app_datastores WHERE app_key = p_app_key;
  FOR patch IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_sidecar_patches) ORDER BY value->>'slug' LOOP
    IF NULLIF(BTRIM(patch->>'slug'), '') IS NULL OR NULLIF(BTRIM(patch->>'key'), '') IS NULL THEN
      RAISE EXCEPTION 'sidecar slug and collection key are required';
    END IF;
    sidecar_key := p_app_key || ':' || (patch->>'slug');
    collection_key := patch->>'key';
    SELECT data INTO current_sidecar FROM public.app_datastores WHERE app_key = sidecar_key;

    -- A missing/legacy-empty sidecar is seeded from the locked main row. Once
    -- authoritative, even an empty collection must beat stale main fallback.
    IF COALESCE(current_sidecar->>'__aquaSidecarAuthoritative', 'false') <> 'true'
       AND JSONB_TYPEOF(current_sidecar->collection_key) IS DISTINCT FROM 'object' THEN
      current_sidecar := JSONB_SET(
        COALESCE(current_sidecar, '{}'::JSONB),
        ARRAY[collection_key],
        COALESCE(current_main->collection_key, '{}'::JSONB),
        TRUE
      );
    ELSIF COALESCE(current_sidecar->>'__aquaSidecarAuthoritative', 'false') <> 'true'
       AND current_sidecar->collection_key = '{}'::JSONB THEN
      current_sidecar := JSONB_SET(current_sidecar, ARRAY[collection_key], COALESCE(current_main->collection_key, '{}'::JSONB), TRUE);
    END IF;
    current_sidecar := public.aqua_apply_jsonb_patch(current_sidecar, patch->'operations');
    current_sidecar := JSONB_SET(current_sidecar, ARRAY['__aquaSidecarAuthoritative'], 'true'::JSONB, TRUE);
    UPDATE public.app_datastores SET data = current_sidecar WHERE app_key = sidecar_key;
    current_main := JSONB_SET(current_main, ARRAY[collection_key], '{}'::JSONB, TRUE);
    saved_sidecars := JSONB_SET(saved_sidecars, ARRAY[patch->>'slug'], current_sidecar, TRUE);
  END LOOP;

  current_main := public.aqua_apply_jsonb_patch(current_main, p_main_operations);
  UPDATE public.app_datastores SET data = current_main WHERE app_key = p_app_key;
  RETURN JSONB_BUILD_OBJECT(
    'operationId', p_operation_id::TEXT,
    'main', current_main,
    'sidecars', saved_sidecars
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_app_datastore_patch_with_sidecars(TEXT, UUID, JSONB, JSONB)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_app_datastore_patch_with_sidecars(TEXT, UUID, JSONB, JSONB)
  TO service_role;
COMMENT ON FUNCTION public.apply_app_datastore_patch_with_sidecars(TEXT, UUID, JSONB, JSONB) IS
  'Receipt-deduplicated atomic commit of AquaCRM main state and flush-owned sidecar patches.';

CREATE OR REPLACE FUNCTION public.load_app_datastore_with_sidecars(
  p_app_key TEXT,
  p_sidecar_specs JSONB
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  IF p_app_key IS NULL OR BTRIM(p_app_key) = '' THEN RAISE EXCEPTION 'app key is required'; END IF;
  IF JSONB_TYPEOF(p_sidecar_specs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'sidecar specs must be an array'; END IF;

  -- Main and every owned sidecar are read by one SQL statement and therefore
  -- one READ COMMITTED statement snapshot; an atomic successor cannot tear it.
  SELECT JSONB_BUILD_OBJECT(
    'main', COALESCE(
      (SELECT data FROM public.app_datastores WHERE app_key = p_app_key),
      '{}'::JSONB
    ),
    'sidecars', COALESCE(
      (
        SELECT JSONB_OBJECT_AGG(
          requested.spec->>'slug',
          CASE
            WHEN COALESCE(datastore.data->>'__aquaSidecarAuthoritative', 'false') = 'true'
              THEN datastore.data
            WHEN JSONB_TYPEOF(datastore.data->(requested.spec->>'key')) = 'object'
              THEN datastore.data
            ELSE JSONB_SET(
              COALESCE(datastore.data, '{}'::JSONB),
              ARRAY[requested.spec->>'key'],
              '{}'::JSONB,
              TRUE
            )
          END
        )
        FROM JSONB_ARRAY_ELEMENTS(p_sidecar_specs) requested(spec)
        LEFT JOIN public.app_datastores datastore
          ON datastore.app_key = p_app_key || ':' || (requested.spec->>'slug')
      ),
      '{}'::JSONB
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.load_app_datastore_with_sidecars(TEXT, JSONB)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_app_datastore_with_sidecars(TEXT, JSONB)
  TO service_role;
