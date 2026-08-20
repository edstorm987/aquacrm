import "server-only";

/**
 * True when Supabase rejected a write because `brand_enquiries.agency_id`
 * does not exist yet.
 *
 * The migration adding the column
 * (`supabase/migrations/20260820150000_brand_enquiries_agency_scope.sql`)
 * is applied BY HAND by Ed, so there is a window where this code is live
 * against the old schema. Public enquiry capture must not fail during that
 * window: the insert paths try the column first and, on this exact error,
 * retry without it — `metadata.agencyId` still records the tenant, and the
 * migration's backfill + trigger promote it into the column later.
 *
 * PGRST204 is PostgREST's "column not found in schema cache" code; the
 * message check keeps an unrelated missing column from being swallowed.
 */
export function isMissingAgencyIdColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  return error.code === "PGRST204" && /agency_id/i.test(error.message ?? "");
}
