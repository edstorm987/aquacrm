-- Cross-process mutex for one client/product workspace mutation. The lease is
-- deliberately separate from the JSON datastore so a stale application cache
-- cannot win the coordination race before compare-and-swap validation.
CREATE TABLE IF NOT EXISTS public.product_workspace_leases (
  app_key TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_key, workspace_key)
);

ALTER TABLE public.product_workspace_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_workspace_leases FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_workspace_leases TO service_role;

CREATE OR REPLACE FUNCTION public.claim_product_workspace_lease(
  p_app_key TEXT,
  p_workspace_key TEXT,
  p_holder_id TEXT,
  p_lease_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lease public.product_workspace_leases%ROWTYPE;
  lease_interval INTERVAL;
BEGIN
  IF COALESCE(BTRIM(p_app_key), '') = ''
    OR COALESCE(BTRIM(p_workspace_key), '') = ''
    OR COALESCE(BTRIM(p_holder_id), '') = '' THEN
    RAISE EXCEPTION 'app key, workspace key and holder id are required';
  END IF;

  lease_interval := make_interval(
    secs => GREATEST(1000, LEAST(COALESCE(p_lease_ms, 60000), 60000))::DOUBLE PRECISION / 1000.0
  );

  INSERT INTO public.product_workspace_leases (
    app_key, workspace_key, holder_id, lease_expires_at
  ) VALUES (
    p_app_key, p_workspace_key, p_holder_id, NOW() + lease_interval
  ) ON CONFLICT (app_key, workspace_key) DO NOTHING;

  SELECT * INTO lease
  FROM public.product_workspace_leases
  WHERE app_key = p_app_key AND workspace_key = p_workspace_key
  FOR UPDATE;

  IF lease.holder_id <> p_holder_id AND lease.lease_expires_at > NOW() THEN
    RETURN jsonb_build_object(
      'state', 'held',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM lease.lease_expires_at) * 1000)
    );
  END IF;

  UPDATE public.product_workspace_leases
  SET holder_id = p_holder_id,
      lease_expires_at = NOW() + lease_interval,
      updated_at = NOW()
  WHERE app_key = p_app_key AND workspace_key = p_workspace_key
  RETURNING * INTO lease;

  RETURN jsonb_build_object(
    'state', 'claimed',
    'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM lease.lease_expires_at) * 1000)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_product_workspace_lease(
  p_app_key TEXT,
  p_workspace_key TEXT,
  p_holder_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.product_workspace_leases
  WHERE app_key = p_app_key
    AND workspace_key = p_workspace_key
    AND holder_id = p_holder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_product_workspace_lease(TEXT, TEXT, TEXT, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_product_workspace_lease(TEXT, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_product_workspace_lease(TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_product_workspace_lease(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.product_workspace_leases IS
  'Short-lived mutexes serializing one client/product workspace mutation across application processes.';

