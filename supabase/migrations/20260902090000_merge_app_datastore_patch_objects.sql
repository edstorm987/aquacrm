CREATE OR REPLACE FUNCTION public.aqua_jsonb_deep_merge(p_current JSONB, p_incoming JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  merged JSONB := CASE WHEN JSONB_TYPEOF(p_current) = 'object' THEN p_current ELSE '{}'::JSONB END;
  child_key TEXT;
  child_value JSONB;
BEGIN
  IF JSONB_TYPEOF(p_incoming) IS DISTINCT FROM 'object' THEN RETURN p_incoming; END IF;
  FOR child_key, child_value IN SELECT key, value FROM JSONB_EACH(p_incoming) LOOP
    merged := JSONB_SET(
      merged,
      ARRAY[child_key],
      CASE
        WHEN JSONB_TYPEOF(merged->child_key) = 'object' AND JSONB_TYPEOF(child_value) = 'object'
          THEN public.aqua_jsonb_deep_merge(merged->child_key, child_value)
        ELSE child_value
      END,
      TRUE
    );
  END LOOP;
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION public.aqua_jsonb_deep_merge(JSONB, JSONB) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aqua_apply_jsonb_patch(p_current JSONB, p_operations JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  operation JSONB;
  operation_name TEXT;
  operation_path TEXT[];
  current_data JSONB := COALESCE(p_current, '{}'::JSONB);
  current_value JSONB;
BEGIN
  IF JSONB_TYPEOF(p_operations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'operations must be a JSON array';
  END IF;
  FOR operation IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_operations) LOOP
    operation_name := operation->>'op';
    SELECT COALESCE(ARRAY_AGG(path_part.value), ARRAY[]::TEXT[])
      INTO operation_path
      FROM JSONB_ARRAY_ELEMENTS_TEXT(operation->'path') path_part(value);
    IF CARDINALITY(operation_path) = 0 THEN RAISE EXCEPTION 'patch paths must not be empty'; END IF;
    IF operation_name = 'set' THEN
      current_data := JSONB_SET(current_data, operation_path, COALESCE(operation->'value', 'null'::JSONB), TRUE);
    ELSIF operation_name = 'delete' THEN
      current_data := current_data #- operation_path;
    ELSIF operation_name = 'merge_object' THEN
      current_value := current_data #> operation_path;
      IF JSONB_TYPEOF(operation->'value') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'merge_object value must be a JSON object';
      END IF;
      current_data := JSONB_SET(
        current_data,
        operation_path,
        public.aqua_jsonb_deep_merge(
          CASE WHEN JSONB_TYPEOF(current_value) = 'object' THEN current_value ELSE '{}'::JSONB END,
          operation->'value'
        ),
        TRUE
      );
    ELSIF operation_name = 'append_unique' THEN
      current_value := current_data #> operation_path;
      IF JSONB_TYPEOF(current_value) IS DISTINCT FROM 'array' THEN current_value := '[]'::JSONB; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM JSONB_ARRAY_ELEMENTS(current_value) existing(value)
        WHERE existing.value = operation->'value'
      ) THEN
        current_data := JSONB_SET(current_data, operation_path, current_value || JSONB_BUILD_ARRAY(operation->'value'), TRUE);
      END IF;
    ELSE
      RAISE EXCEPTION 'unsupported patch operation: %', operation_name;
    END IF;
  END LOOP;
  RETURN current_data;
END;
$$;

REVOKE ALL ON FUNCTION public.aqua_apply_jsonb_patch(JSONB, JSONB) FROM public, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.app_datastore_patch_receipts (
  app_key TEXT NOT NULL,
  operation_id UUID NOT NULL,
  request_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_key, operation_id)
);
ALTER TABLE public.app_datastore_patch_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_datastore_patch_receipts FROM public, anon, authenticated;
CREATE INDEX IF NOT EXISTS app_datastore_patch_receipts_created_idx
  ON public.app_datastore_patch_receipts(created_at);

DROP FUNCTION IF EXISTS public.apply_app_datastore_patch(TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.apply_app_datastore_patch(
  p_app_key TEXT,
  p_operation_id UUID,
  p_operations JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claimed BOOLEAN := FALSE;
  existing_payload JSONB;
  request_payload JSONB := JSONB_BUILD_OBJECT('mainOperations', p_operations);
  current_data JSONB;
BEGIN
  IF p_app_key IS NULL OR BTRIM(p_app_key) = '' THEN RAISE EXCEPTION 'app key is required'; END IF;
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'operation id is required'; END IF;

  -- Reconciliation is process-local and bounded to request recovery. Thirty
  -- days is deliberately far beyond that lifetime while bounding receipts.
  -- Global age pruning means a write to any active realm eventually clears
  -- dormant demo/one-shot realm receipts as well.
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
    IF existing_payload IS DISTINCT FROM request_payload THEN
      RAISE EXCEPTION 'operation id payload mismatch';
    END IF;
    SELECT data INTO current_data FROM public.app_datastores WHERE app_key = p_app_key;
    RETURN JSONB_BUILD_OBJECT(
      'operationId', p_operation_id::TEXT,
      'main', COALESCE(current_data, '{}'::JSONB)
    );
  END IF;

  INSERT INTO public.app_datastores(app_key, data) VALUES (p_app_key, '{}'::JSONB)
  ON CONFLICT (app_key) DO NOTHING;
  SELECT data INTO current_data FROM public.app_datastores WHERE app_key = p_app_key FOR UPDATE;
  current_data := public.aqua_apply_jsonb_patch(current_data, p_operations);
  UPDATE public.app_datastores SET data = current_data WHERE app_key = p_app_key;
  RETURN JSONB_BUILD_OBJECT('operationId', p_operation_id::TEXT, 'main', current_data);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_app_datastore_patch(TEXT, UUID, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_app_datastore_patch(TEXT, UUID, JSONB) TO service_role;
COMMENT ON FUNCTION public.apply_app_datastore_patch(TEXT, UUID, JSONB) IS
  'Applies one receipt-deduplicated AquaCRM state patch without replaying it over concurrent successors.';
