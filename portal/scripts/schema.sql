-- Aqua portal — Postgres schema for the storage backend (R7).
--
-- Single-table key/value store. The foundation writes the entire
-- `PortalState` JSON into one row keyed `__portal_state__`. Plugins
-- (or future foundation rounds) can write per-namespace rows under
-- keys like `t/<agencyId>/<clientId>/<plugin>/...` without changing
-- the table.
--
-- Apply once per database:
--   createdb aqua_portal
--   psql aqua_portal -f scripts/schema.sql

CREATE TABLE IF NOT EXISTS portal_kv (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prefix lookups: `keys('t/agency/<id>/...')` style queries use
-- `text_pattern_ops` so a btree index can satisfy the LIKE prefix
-- predicate. Without this op-class the planner falls back to a seq
-- scan on locales whose default collation isn't C.
CREATE INDEX IF NOT EXISTS portal_kv_key_prefix
  ON portal_kv USING btree (key text_pattern_ops);

-- Aqua Editor AI reply claims. This is deliberately included in the generic
-- Postgres bootstrap as well as the Supabase migration: storagePostgres.ts
-- calls these functions in production, so a database created from this file
-- must expose the same atomic lease contract.
CREATE TABLE IF NOT EXISTS public.editor_ai_reply_claims (
  app_key TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'complete')),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (app_key, claim_key)
);

CREATE OR REPLACE FUNCTION public.claim_editor_ai_reply(
  p_app_key TEXT,
  p_claim_key TEXT,
  p_holder_id TEXT,
  p_lease_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  claim public.editor_ai_reply_claims%ROWTYPE;
  lease_interval INTERVAL;
BEGIN
  IF COALESCE(BTRIM(p_app_key), '') = ''
    OR COALESCE(BTRIM(p_claim_key), '') = ''
    OR COALESCE(BTRIM(p_holder_id), '') = '' THEN
    RAISE EXCEPTION 'app key, claim key and holder id are required';
  END IF;

  lease_interval := make_interval(
    secs => GREATEST(1000, LEAST(COALESCE(p_lease_ms, 90000), 300000))::DOUBLE PRECISION / 1000.0
  );

  DELETE FROM public.editor_ai_reply_claims
  WHERE app_key = p_app_key
    AND status = 'complete'
    AND completed_at < NOW() - INTERVAL '90 days';

  INSERT INTO public.editor_ai_reply_claims (
    app_key, claim_key, holder_id, status, lease_expires_at
  ) VALUES (
    p_app_key, p_claim_key, p_holder_id, 'claimed', NOW() + lease_interval
  ) ON CONFLICT (app_key, claim_key) DO NOTHING;

  SELECT * INTO claim
  FROM public.editor_ai_reply_claims
  WHERE app_key = p_app_key AND claim_key = p_claim_key
  FOR UPDATE;

  IF claim.status = 'complete' THEN
    RETURN jsonb_build_object(
      'state', 'complete',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM claim.lease_expires_at) * 1000)
    );
  END IF;

  IF claim.holder_id = p_holder_id OR claim.lease_expires_at <= NOW() THEN
    UPDATE public.editor_ai_reply_claims
    SET holder_id = p_holder_id,
        status = 'claimed',
        lease_expires_at = NOW() + lease_interval,
        updated_at = NOW(),
        completed_at = NULL
    WHERE app_key = p_app_key AND claim_key = p_claim_key
    RETURNING * INTO claim;
    RETURN jsonb_build_object(
      'state', 'claimed',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM claim.lease_expires_at) * 1000)
    );
  END IF;

  RETURN jsonb_build_object(
    'state', 'held',
    'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM claim.lease_expires_at) * 1000)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_editor_ai_reply(
  p_app_key TEXT,
  p_claim_key TEXT,
  p_holder_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.editor_ai_reply_claims
  SET status = 'complete', completed_at = NOW(), updated_at = NOW()
  WHERE app_key = p_app_key
    AND claim_key = p_claim_key
    AND holder_id = p_holder_id
    AND status = 'claimed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'editor ai reply claim is not held';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_editor_ai_reply(
  p_app_key TEXT,
  p_claim_key TEXT,
  p_holder_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.editor_ai_reply_claims
  WHERE app_key = p_app_key
    AND claim_key = p_claim_key
    AND holder_id = p_holder_id
    AND status = 'claimed';
END;
$$;

-- Lead-to-client conversion operations. One durable lease owns the conversion
-- for a canonical lead identity, and a completed response is replayable by any
-- later request. Request hashes make a materially different retry explicit
-- instead of silently rewriting an already-created client.
CREATE TABLE IF NOT EXISTS public.lead_conversion_operations (
  app_key TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'complete', 'failed')),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  result JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (app_key, claim_key)
);

CREATE OR REPLACE FUNCTION public.claim_lead_conversion(
  p_app_key TEXT,
  p_claim_key TEXT,
  p_request_hash TEXT,
  p_holder_id TEXT,
  p_lease_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  operation public.lead_conversion_operations%ROWTYPE;
  lease_interval INTERVAL;
BEGIN
  IF COALESCE(BTRIM(p_app_key), '') = ''
    OR COALESCE(BTRIM(p_claim_key), '') = ''
    OR COALESCE(BTRIM(p_request_hash), '') = ''
    OR COALESCE(BTRIM(p_holder_id), '') = '' THEN
    RAISE EXCEPTION 'app key, claim key, request hash and holder id are required';
  END IF;

  lease_interval := make_interval(
    secs => GREATEST(1000, LEAST(COALESCE(p_lease_ms, 300000), 300000))::DOUBLE PRECISION / 1000.0
  );

  INSERT INTO public.lead_conversion_operations (
    app_key, claim_key, request_hash, holder_id, status, lease_expires_at
  ) VALUES (
    p_app_key, p_claim_key, p_request_hash, p_holder_id, 'claimed', NOW() + lease_interval
  ) ON CONFLICT (app_key, claim_key) DO NOTHING;

  SELECT * INTO operation
  FROM public.lead_conversion_operations
  WHERE app_key = p_app_key AND claim_key = p_claim_key
  FOR UPDATE;

  IF operation.request_hash <> p_request_hash THEN
    RETURN jsonb_build_object(
      'state', 'conflict',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM operation.lease_expires_at) * 1000)
    );
  END IF;

  IF operation.status = 'complete' THEN
    RETURN jsonb_build_object(
      'state', 'complete',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM operation.lease_expires_at) * 1000),
      'result', operation.result
    );
  END IF;

  IF operation.status = 'claimed'
    AND operation.holder_id <> p_holder_id
    AND operation.lease_expires_at > NOW() THEN
    RETURN jsonb_build_object(
      'state', 'held',
      'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM operation.lease_expires_at) * 1000)
    );
  END IF;

  UPDATE public.lead_conversion_operations
  SET holder_id = p_holder_id,
      status = 'claimed',
      lease_expires_at = NOW() + lease_interval,
      last_error = NULL,
      updated_at = NOW(),
      completed_at = NULL
  WHERE app_key = p_app_key AND claim_key = p_claim_key
  RETURNING * INTO operation;

  RETURN jsonb_build_object(
    'state', 'claimed',
    'leaseExpiresAt', FLOOR(EXTRACT(EPOCH FROM operation.lease_expires_at) * 1000)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_lead_conversion(
  p_app_key TEXT,
  p_claim_key TEXT,
  p_request_hash TEXT,
  p_holder_id TEXT,
  p_result JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.lead_conversion_operations
  SET status = 'complete',
      result = p_result,
      last_error = NULL,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE app_key = p_app_key
    AND claim_key = p_claim_key
    AND request_hash = p_request_hash
    AND holder_id = p_holder_id
    AND status = 'claimed'
    AND lease_expires_at > NOW();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead conversion claim is not held';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_lead_conversion(
  p_app_key TEXT,
  p_claim_key TEXT,
  p_request_hash TEXT,
  p_holder_id TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.lead_conversion_operations
  SET status = 'failed',
      lease_expires_at = NOW(),
      last_error = LEFT(COALESCE(p_error, 'Lead conversion failed.'), 1000),
      updated_at = NOW()
  WHERE app_key = p_app_key
    AND claim_key = p_claim_key
    AND request_hash = p_request_hash
    AND holder_id = p_holder_id
    AND status = 'claimed'
    AND lease_expires_at > NOW();
END;
$$;

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


-- Optional: invalidate cached rows aggressively on updates if a
-- caller wants to subscribe to changes. Out of scope for R7.

-- Per-tenant scoping defense (architecture §6) is enforced at the
-- foundation layer (`withTenantScope` helpers in `tenants.ts`).
-- Postgres-side row-level security is deferred to R8 — see
-- `04-foundation-round7-postgres.md` §"RLS deferral".
