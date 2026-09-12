-- ABUSE-BASE-001 — durable atomic admission limiter.
--
-- Additive and self-contained: one new table and one service-role-only RPC.
-- Nothing existing is altered. NOT auto-applied by this run (the isolated
-- worker does not apply migrations or contact a database); it is a release-gate
-- artifact for the durable adapter in
-- portal/src/lib/server/security/admissionLimiter.ts.
--
-- The RPC is the AUTHORITY behind the process-local fast pre-filter: it counts
-- admissions for (dimension, key) within a fixed window in ONE atomic upsert, so
-- concurrent callers across instances cannot lose a hit. Fixed `search_path`,
-- SECURITY DEFINER, and service-role-only grants keep it off the anon/
-- authenticated surface entirely.

CREATE TABLE IF NOT EXISTS public.abuse_admission_counters (
  dimension    text    NOT NULL,
  bucket_key   text    NOT NULL,
  window_start bigint  NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (dimension, bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS abuse_admission_counters_window_idx
  ON public.abuse_admission_counters (window_start);

-- Only service_role (which bypasses RLS) may touch the counters; anon and
-- authenticated are denied by default with RLS enabled and grants revoked.
ALTER TABLE public.abuse_admission_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.abuse_admission_counters FROM public, anon, authenticated;
GRANT ALL ON TABLE public.abuse_admission_counters TO service_role;

CREATE OR REPLACE FUNCTION public.abuse_admission_check(
  p_dimension text,
  p_key       text,
  p_max       integer,
  p_window_ms bigint,
  p_now_ms    bigint DEFAULT NULL
)
RETURNS TABLE(allowed boolean, hits integer, reset_at bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now          bigint := COALESCE(p_now_ms, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint);
  v_window_start bigint;
  v_hits         integer;
BEGIN
  IF p_dimension IS NULL OR BTRIM(p_dimension) = '' THEN RAISE EXCEPTION 'dimension is required'; END IF;
  IF p_key IS NULL OR BTRIM(p_key) = '' THEN RAISE EXCEPTION 'key is required'; END IF;
  IF p_max IS NULL OR p_max < 0 THEN RAISE EXCEPTION 'max must be non-negative'; END IF;
  IF p_window_ms IS NULL OR p_window_ms <= 0 THEN RAISE EXCEPTION 'window must be positive'; END IF;

  v_window_start := (v_now / p_window_ms) * p_window_ms;

  -- One atomic upsert: the (dimension, key, window) counter is created or
  -- incremented in a single statement, so concurrent callers cannot lose a hit.
  INSERT INTO public.abuse_admission_counters(dimension, bucket_key, window_start, hits)
  VALUES (p_dimension, p_key, v_window_start, 1)
  ON CONFLICT (dimension, bucket_key, window_start)
  DO UPDATE SET hits = public.abuse_admission_counters.hits + 1
  RETURNING public.abuse_admission_counters.hits INTO v_hits;

  -- Bounded, cheap self-cleanup of long-closed windows so no separate reaper is
  -- required; never touches the current window.
  DELETE FROM public.abuse_admission_counters
  WHERE window_start < v_now - GREATEST(p_window_ms * 4, 3600000);

  allowed  := v_hits <= p_max;
  hits     := v_hits;
  reset_at := v_window_start + p_window_ms;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.abuse_admission_check(text, text, integer, bigint, bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abuse_admission_check(text, text, integer, bigint, bigint)
  TO service_role;
COMMENT ON FUNCTION public.abuse_admission_check(text, text, integer, bigint, bigint) IS
  'ABUSE-BASE-001: atomic windowed admission counter for IP / subject-digest / tenant-install / provider-budget dimensions. Service-role only.';
