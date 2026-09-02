-- Renew an existing product-workspace lease without ever reacquiring it.
-- `claim_product_workspace_lease` intentionally permits an expired row to be
-- acquired. Reusing that acquisition function for heartbeats creates an ABA
-- race: a delayed heartbeat can arrive after another holder acquired, changed
-- state and released the same row, then silently reacquire and commit stale
-- state. Renewal succeeds only while this holder still owns an unexpired row.
CREATE OR REPLACE FUNCTION public.renew_product_workspace_lease(
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
  observed_expiry TIMESTAMPTZ;
BEGIN
  IF COALESCE(BTRIM(p_app_key), '') = ''
    OR COALESCE(BTRIM(p_workspace_key), '') = ''
    OR COALESCE(BTRIM(p_holder_id), '') = '' THEN
    RAISE EXCEPTION 'app key, workspace key and holder id are required';
  END IF;

  lease_interval := make_interval(
    secs => GREATEST(1000, LEAST(COALESCE(p_lease_ms, 60000), 60000))::DOUBLE PRECISION / 1000.0
  );

  UPDATE public.product_workspace_leases
  SET lease_expires_at = NOW() + lease_interval,
      updated_at = NOW()
  WHERE app_key = p_app_key
    AND workspace_key = p_workspace_key
    AND holder_id = p_holder_id
    AND lease_expires_at > NOW()
  RETURNING * INTO lease;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'state', 'claimed',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM lease.lease_expires_at) * 1000)
    );
  END IF;

  SELECT lease_expires_at INTO observed_expiry
  FROM public.product_workspace_leases
  WHERE app_key = p_app_key AND workspace_key = p_workspace_key;

  RETURN jsonb_build_object(
    'state', 'held',
    'leaseExpiresAt', COALESCE(
      FLOOR(EXTRACT(EPOCH FROM observed_expiry) * 1000),
      FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.renew_product_workspace_lease(TEXT, TEXT, TEXT, INTEGER)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_product_workspace_lease(TEXT, TEXT, TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.renew_product_workspace_lease(TEXT, TEXT, TEXT, INTEGER) IS
  'Renews only a currently owned, unexpired product-workspace lease; never reacquires after an ownership gap.';
