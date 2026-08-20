import "server-only";

import { isMissingAgencyIdColumnRead } from "./enquiryAgencyColumn";
import type { ScopedSupabaseClient } from "./scoped";

/**
 * Tenant-ownership guard for `brand_enquiries`.
 *
 * WHY THIS EXISTS — defence in depth. Every internal portal route that touches
 * a website enquiry addresses the row by its id (or by email/phone) and trusts
 * row-level security to keep it inside the caller's agency. Today that trust is
 * misplaced: `profiles.agency_id` is not populated for anyone, so
 * `current_profile_agency_id()` is null and the null-tolerant policy degrades to
 * "any internal user manages EVERY agency's brand_enquiries". Ids are not secret
 * (any internal user can enumerate them), so a route that only checks the id can
 * be driven across tenants — erasing, replying to, or reading another agency's
 * enquiry. This guard is the app-level check that closes that hole regardless of
 * the RLS posture.
 *
 * It must work BOTH before and after the hand-applied agency_id migration
 * (`supabase/migrations/20260820150000_brand_enquiries_agency_scope.sql`):
 *  - after: the row carries a first-class `agency_id` column;
 *  - before: the column does not exist, but `metadata.agencyId` is written on
 *    every row today, so ownership falls back to it.
 *
 * A non-owned row and a missing row both return `null` — identically, with no
 * existence oracle — so a caller cannot tell a foreign id from a made-up one.
 */

export interface OwnedEnquiryRow {
  id: string;
  agency_id?: string | null;
  metadata: Record<string, unknown> | null;
}

/** Columns every guarded load needs for the ownership decision itself. */
const OWNERSHIP_COLUMNS = ["id", "agency_id", "metadata"] as const;
const OWNERSHIP_COLUMNS_LEGACY = ["id", "metadata"] as const;

/**
 * True iff the row belongs to `agencyId`.
 *
 * Ownership is: the `agency_id` column equals the caller's agency, OR the column
 * is null/absent (pre-migration, or a capture-only hold the trigger has not
 * defaulted yet) AND `metadata.agencyId` equals it. A row whose column names a
 * DIFFERENT agency is never owned via metadata — the column is authoritative
 * once set.
 */
export function enquiryBelongsToAgency(
  row: { agency_id?: string | null; metadata?: Record<string, unknown> | null } | null | undefined,
  agencyId: string,
): boolean {
  if (!row || !agencyId) return false;
  const column = typeof row.agency_id === "string" ? row.agency_id.trim() : "";
  if (column) return column === agencyId;
  const metaAgencyId = row.metadata && typeof row.metadata === "object"
    ? (row.metadata as Record<string, unknown>).agencyId
    : undefined;
  return typeof metaAgencyId === "string" && metaAgencyId.trim() === agencyId;
}

function buildSelect(columns: readonly string[], extra: readonly string[]): string {
  return Array.from(new Set([...columns, ...extra])).join(", ");
}

/**
 * Load a `brand_enquiries` row by id and return it ONLY if it belongs to
 * `agencyId`. Returns `null` for a foreign row exactly as for a missing one.
 *
 * `columns` is any extra columns the caller needs beyond the ownership set
 * (`id, agency_id, metadata`). The projection includes `agency_id`; if the
 * column does not exist yet the select is retried without it and ownership falls
 * back to `metadata.agencyId`.
 */
export async function loadOwnedEnquiry<Row extends OwnedEnquiryRow = OwnedEnquiryRow>(
  supabase: ScopedSupabaseClient,
  options: { id: string; agencyId: string; columns?: readonly string[] },
): Promise<Row | null> {
  const extra = options.columns ?? [];
  const load = (columns: readonly string[]) =>
    supabase
      .from("brand_enquiries")
      .select(buildSelect(columns, extra))
      .eq("id", options.id)
      .maybeSingle();

  let { data, error } = await load(OWNERSHIP_COLUMNS);
  if (error && isMissingAgencyIdColumnRead(error)) {
    // Pre-migration: the tenant column is not there yet. Read the rest and let
    // metadata.agencyId decide ownership.
    ({ data, error } = await load(OWNERSHIP_COLUMNS_LEGACY));
  }
  if (error) throw new Error(`Could not load website enquiry: ${error.message}`);

  const row = (data ?? null) as Row | null;
  return enquiryBelongsToAgency(row, options.agencyId) ? row : null;
}

/**
 * Pick the one candidate `brand_enquiries` row that belongs to `agencyId`, or
 * `null` when none does — the admin-client counterpart of `loadOwnedEnquiry`.
 *
 * form-capture matches a newly-submitted form to the enquiry the site posted a
 * moment earlier, by email/phone, using the RLS-bypassing admin client. Matching
 * without a tenant check would let a stranger's newer row (another agency reused
 * the same email) shadow the right one and receive the capture. This accepts a
 * candidate ONLY when its tenancy equals the resolved agency; a row belonging to
 * anyone else is treated as no match, so the capture is held rather than filed
 * against the wrong tenant.
 */
export function pickTenantOwnedEnquiry<Row extends { agency_id?: string | null; metadata?: Record<string, unknown> | null }>(
  rows: readonly Row[] | null | undefined,
  agencyId: string,
): Row | null {
  if (!rows?.length) return null;
  return rows.find(row => enquiryBelongsToAgency(row, agencyId)) ?? null;
}
