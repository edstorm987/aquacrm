-- ABUSE-BASE — bounded durable atomic admission limiter.
--
-- Additive, unapplied foundation. Raw caller keys never enter this schema: the
-- server supplies a fixed-size HMAC-SHA256 digest. One row per
-- (dimension, digest, policy-window) carries its own expiry. A service-role-only
-- singleton ledger serializes NEW-key allocation so the active table cannot
-- exceed its hard cap without making the existing hot-key increment path global.
-- Ordinary app calls pass no time override: the database selects the window.
-- The explicit time parameter is retained only for deterministic acceptance and
-- is guarded against moving an already-committed row to an older window.

CREATE TABLE IF NOT EXISTS public.abuse_admission_counters (
  dimension       text    NOT NULL
    CHECK (dimension IN ('ip', 'subject', 'tenant-install', 'provider-budget')),
  bucket_key_hash char(64) NOT NULL
    CHECK (bucket_key_hash ~ '^[0-9a-f]{64}$'),
  window_ms       bigint  NOT NULL
    CHECK (window_ms BETWEEN 1000 AND 2592000000),
  window_start    bigint  NOT NULL CHECK (window_start >= 0),
  expires_at      bigint  NOT NULL,
  hits            integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  CHECK (expires_at = window_start + window_ms),
  PRIMARY KEY (dimension, bucket_key_hash, window_ms)
);

CREATE INDEX IF NOT EXISTS abuse_admission_counters_expires_idx
  ON public.abuse_admission_counters (expires_at);

CREATE TABLE IF NOT EXISTS public.abuse_admission_capacity (
  singleton       boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  active_counters integer NOT NULL DEFAULT 0
    CHECK (active_counters BETWEEN 0 AND 100000)
);

INSERT INTO public.abuse_admission_capacity(singleton, active_counters)
VALUES (TRUE, 0)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.abuse_admission_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_admission_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.abuse_admission_counters FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.abuse_admission_capacity FROM public, anon, authenticated;
GRANT ALL ON TABLE public.abuse_admission_counters TO service_role;
GRANT ALL ON TABLE public.abuse_admission_capacity TO service_role;

CREATE OR REPLACE FUNCTION public.abuse_admission_check(
  p_dimension text,
  p_key_hash  text,
  p_max       integer,
  p_window_ms bigint,
  p_now_ms    bigint DEFAULT NULL
)
RETURNS TABLE(allowed boolean, hits integer, reset_at bigint, observed_at bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now            bigint := COALESCE(p_now_ms, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint);
  v_window_start   bigint;
  v_reset_at       bigint;
  v_hits           integer;
  v_active         integer;
  v_deleted        integer;
  v_existing_start bigint;
  v_existing_expiry bigint;
  v_capacity_limit constant integer := 100000;
BEGIN
  IF p_dimension IS NULL OR p_dimension NOT IN ('ip', 'subject', 'tenant-install', 'provider-budget') THEN
    RAISE EXCEPTION 'invalid dimension';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid key digest';
  END IF;
  IF p_max IS NULL OR p_max < 0 OR p_max > 1000000 THEN
    RAISE EXCEPTION 'max is outside the supported range';
  END IF;
  IF p_window_ms IS NULL OR p_window_ms < 1000 OR p_window_ms > 2592000000 THEN
    RAISE EXCEPTION 'window is outside the supported range';
  END IF;
  IF v_now < 0 THEN RAISE EXCEPTION 'time must be non-negative'; END IF;

  v_window_start := (v_now / p_window_ms) * p_window_ms;
  v_reset_at := v_window_start + p_window_ms;
  observed_at := v_now;

  -- Existing live keys never take the global new-key allocation lock. This
  -- update is row-atomic and the fixed window/expiry predicate prevents an old
  -- policy row from being incremented into a later window.
  UPDATE public.abuse_admission_counters
  SET hits = public.abuse_admission_counters.hits + 1
  WHERE dimension = p_dimension
    AND bucket_key_hash = p_key_hash
    AND window_ms = p_window_ms
    AND window_start = v_window_start
    AND expires_at = v_reset_at
  RETURNING public.abuse_admission_counters.hits INTO v_hits;

  IF FOUND THEN
    allowed := v_hits <= p_max;
    hits := v_hits;
    reset_at := v_reset_at;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Serialize only NEW-window/new-key allocation. The capacity row is an exact
  -- count maintained in the same transaction as expiry deletion and insertion,
  -- preventing concurrent unique-key floods from racing past the hard cap.
  SELECT active_counters INTO v_active
  FROM public.abuse_admission_capacity
  WHERE singleton = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'capacity authority is unavailable'; END IF;

  DELETE FROM public.abuse_admission_counters WHERE expires_at <= v_now;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_active := GREATEST(0, v_active - v_deleted);

  -- A same-key transaction may have inserted while this call waited for the
  -- capacity lock. Recheck and increment it rather than allocating twice.
  UPDATE public.abuse_admission_counters
  SET hits = public.abuse_admission_counters.hits + 1
  WHERE dimension = p_dimension
    AND bucket_key_hash = p_key_hash
    AND window_ms = p_window_ms
    AND window_start = v_window_start
    AND expires_at = v_reset_at
  RETURNING public.abuse_admission_counters.hits INTO v_hits;

  IF FOUND THEN
    UPDATE public.abuse_admission_capacity SET active_counters = v_active WHERE singleton = TRUE;
    allowed := v_hits <= p_max;
    hits := v_hits;
    reset_at := v_reset_at;
    RETURN NEXT;
    RETURN;
  END IF;

  -- The key exists but belongs to another fixed window. This can only be a
  -- late/stale explicit-clock call after a newer window has already committed,
  -- or an older row that survived unusual clock movement. The singleton lock
  -- is already held: never move a row backwards and never count an update as
  -- an insert.
  SELECT window_start, expires_at
  INTO v_existing_start, v_existing_expiry
  FROM public.abuse_admission_counters
  WHERE dimension = p_dimension
    AND bucket_key_hash = p_key_hash
    AND window_ms = p_window_ms
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.abuse_admission_capacity
    SET active_counters = v_active
    WHERE singleton = TRUE;

    IF v_existing_start > v_window_start THEN
      -- A stale request must not rewind or spend a newer window. Deny it
      -- deterministically without mutating the counter or the row ledger.
      allowed := FALSE;
      hits := p_max + 1;
      reset_at := v_reset_at;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_existing_start < v_window_start THEN
      -- Monotonic forward repair for a non-expired older row. Cardinality is
      -- unchanged, so the capacity ledger remains v_active.
      UPDATE public.abuse_admission_counters
      SET window_start = v_window_start,
          expires_at = v_reset_at,
          hits = 1
      WHERE dimension = p_dimension
        AND bucket_key_hash = p_key_hash
        AND window_ms = p_window_ms
      RETURNING public.abuse_admission_counters.hits INTO v_hits;
      allowed := v_hits <= p_max;
      hits := v_hits;
      reset_at := v_reset_at;
      RETURN NEXT;
      RETURN;
    END IF;

    -- Equal starts with a different expiry violates the table invariant. The
    -- exception rolls back cleanup/ledger changes and the adapter fails closed.
    RAISE EXCEPTION 'counter window state is inconsistent: %', v_existing_expiry;
  END IF;

  IF v_active >= v_capacity_limit THEN
    UPDATE public.abuse_admission_capacity SET active_counters = v_active WHERE singleton = TRUE;
    allowed := FALSE;
    hits := p_max + 1;
    reset_at := v_reset_at;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.abuse_admission_counters(
    dimension, bucket_key_hash, window_ms, window_start, expires_at, hits
  ) VALUES (
    p_dimension, p_key_hash, p_window_ms, v_window_start, v_reset_at, 1
  )
  RETURNING public.abuse_admission_counters.hits INTO v_hits;
  -- New-key allocation is serialized by the singleton row. With every
  -- existing primary-key row handled above, reaching this point means the
  -- INSERT succeeded and cardinality increased by exactly one.
  UPDATE public.abuse_admission_capacity
  SET active_counters = v_active + 1
  WHERE singleton = TRUE;

  allowed := v_hits <= p_max;
  hits := v_hits;
  reset_at := v_reset_at;
  RETURN NEXT;
END;
$$;

-- Explicit bounded retention primitive for the separately reviewed scheduler
-- lane. Admission also performs this cleanup whenever a new window/key is
-- allocated; this RPC makes expiry deterministic even when only hot keys remain.
CREATE OR REPLACE FUNCTION public.gc_abuse_admission_counters(
  p_now_ms bigint DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now     bigint := COALESCE(p_now_ms, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint);
  v_active  integer;
  v_deleted integer;
BEGIN
  IF v_now < 0 THEN RAISE EXCEPTION 'time must be non-negative'; END IF;
  SELECT active_counters INTO v_active
  FROM public.abuse_admission_capacity
  WHERE singleton = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'capacity authority is unavailable'; END IF;

  DELETE FROM public.abuse_admission_counters WHERE expires_at <= v_now;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  UPDATE public.abuse_admission_capacity
  SET active_counters = GREATEST(0, v_active - v_deleted)
  WHERE singleton = TRUE;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.abuse_admission_check(text, text, integer, bigint, bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abuse_admission_check(text, text, integer, bigint, bigint)
  TO service_role;
REVOKE ALL ON FUNCTION public.gc_abuse_admission_counters(bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gc_abuse_admission_counters(bigint)
  TO service_role;
COMMENT ON FUNCTION public.abuse_admission_check(text, text, integer, bigint, bigint) IS
  'ABUSE-BASE: bounded monotonic fixed-window admission over server-HMACed keys; database-clock by default, explicit clock only for deterministic acceptance. Service-role only.';
COMMENT ON FUNCTION public.gc_abuse_admission_counters(bigint) IS
  'ABUSE-BASE: delete expired pseudonymous admission counters and reconcile the bounded capacity ledger. Service-role only; scheduler wiring is a separate reviewed lane.';
