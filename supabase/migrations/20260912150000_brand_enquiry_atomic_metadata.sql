-- BRAND-ERASURE-001 — race-safe brand-enquiry metadata operations.
--
-- Additive: two service-role-only RPCs, no schema change. NOT applied by this
-- worker (no migration applied, no database contacted). Release-gate artifact
-- for src/lib/server/enquiries/brandEnquiryMetadataOps.ts and the erasure/writer
-- wiring.
--
-- Today every writer of `brand_enquiries.metadata` (and client erasure) does a
-- read-whole / modify / write-whole round trip, so two race with a lost update
-- and a stale whole-value write can RESTORE the client lineage / PII an erasure
-- removed. These make the operations atomic and commutative:
--   * a writer MERGES only its own top-level keys (never the whole blob);
--   * erasure REMOVES only the lineage keys, under a row lock.
-- A merge and an erase of disjoint keys then commute in either order.

-- ── Writer merge: atomic top-level key merge, never touching lineage ──────────
CREATE OR REPLACE FUNCTION public.brand_enquiry_metadata_merge(
  p_id        uuid,
  p_agency_id text,
  p_patch     jsonb
)
RETURNS TABLE(updated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be a json object';
  END IF;
  -- Lineage is owned by routing/erasure, never by a response/call/classification
  -- writer; a patch that carried it could reintroduce a removed link.
  IF p_patch ? 'clientId' OR p_patch ? 'clientLinkedAt' OR p_patch ? 'identityResolution' THEN
    RAISE EXCEPTION 'writer patch may not touch client lineage keys';
  END IF;

  UPDATE public.brand_enquiries
  SET metadata = COALESCE(metadata, '{}'::jsonb) || p_patch
  WHERE id = p_id AND agency_id = p_agency_id;

  updated := FOUND;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_enquiry_metadata_merge(uuid, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brand_enquiry_metadata_merge(uuid, text, jsonb)
  TO service_role;
COMMENT ON FUNCTION public.brand_enquiry_metadata_merge(uuid, text, jsonb) IS
  'BRAND-ERASURE-001: atomic top-level metadata merge for brand-enquiry writers; refuses lineage keys. Service-role only.';

-- ── Erasure: remove exactly one client's lineage/PII under a row lock ─────────
CREATE OR REPLACE FUNCTION public.brand_enquiry_erase_client_lineage(
  p_id        uuid,
  p_agency_id text,
  p_client_id text
)
RETURNS TABLE(changed boolean, stripped boolean, review text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m        jsonb;
  ir       jsonb;
  routed   boolean;
  names    boolean;
  resolved boolean;
  next_m   jsonb;
BEGIN
  -- One atomic read+write: the row lock makes a concurrent merge wait, so it
  -- merges its (disjoint) keys onto the ALREADY-erased metadata.
  SELECT metadata INTO m FROM public.brand_enquiries
  WHERE id = p_id AND agency_id = p_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    changed := false; stripped := false; review := 'none'; RETURN NEXT; RETURN;
  END IF;

  m  := COALESCE(m, '{}'::jsonb);
  ir := m->'identityResolution';
  routed   := (m->>'clientId') = p_client_id;
  names    := (ir->>'clientId') = p_client_id;
  resolved := (ir->>'status') = 'resolved' AND names;

  next_m := m;
  IF routed THEN
    next_m := next_m - 'clientId' - 'clientLinkedAt';
  END IF;
  IF ir IS NOT NULL AND names THEN
    next_m := jsonb_set(next_m, '{identityResolution}', (ir - 'clientId' - 'clientName'));
  END IF;
  IF resolved THEN
    next_m := next_m - 'replies' - 'calls' - 'formCapture';
  END IF;

  IF resolved THEN
    UPDATE public.brand_enquiries
    SET metadata = next_m, name = NULL, email = NULL, phone = NULL,
        contact_method = NULL, message = NULL, source_url = NULL
    WHERE id = p_id AND agency_id = p_agency_id;
  ELSIF next_m IS DISTINCT FROM m THEN
    UPDATE public.brand_enquiries SET metadata = next_m
    WHERE id = p_id AND agency_id = p_agency_id;
  END IF;

  changed  := (next_m IS DISTINCT FROM m) OR resolved;
  stripped := resolved;
  review   := CASE
    WHEN (routed OR names) AND NOT resolved THEN
      CASE
        WHEN (ir->>'status') = 'resolved'
          AND COALESCE(ir->>'clientId', '') <> ''
          AND (ir->>'clientId') <> p_client_id
        THEN 'sharedIdentity'
        ELSE 'legacyUnscoped'
      END
    ELSE 'none'
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_enquiry_erase_client_lineage(uuid, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brand_enquiry_erase_client_lineage(uuid, text, text)
  TO service_role;
COMMENT ON FUNCTION public.brand_enquiry_erase_client_lineage(uuid, text, text) IS
  'BRAND-ERASURE-001: atomic, idempotent, row-locked removal of one client''s brand-enquiry lineage/PII, preserving routing-vs-identity independence. Service-role only.';
