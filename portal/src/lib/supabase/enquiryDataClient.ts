import "server-only";

import { createSupabaseAdminClient } from "./admin";
import type { ScopedSupabaseClient } from "./scoped";

// ── brand_enquiries is SERVER-MEDIATED (assume-breach containment, Phase 1) ──
//
// THE ONE ARCHITECTURE. The assume-breach containment migration
// (20260908210000) and its corrective successor revoke ALL browser-role
// (anon / authenticated) SELECT/UPDATE/DELETE on public.brand_enquiries. The
// authenticated-RLS path the internal enquiry routes used to rely on is
// DELIBERATELY GONE — a signed-in staffer's Supabase JWT can no longer read or
// write the table directly.
//
// Instead, internal enquiry routes read and mutate through the service-role
// admin client, and TENANT OWNERSHIP IS ENFORCED IN SERVER CODE — never by RLS:
//   • loadOwnedEnquiry / enquiryBelongsToAgency (single row by id)
//   • loadActorWebsiteEnquiry (adds an access-level assertion)
//   • pickTenantOwnedEnquiry (the admin-side match for public capture)
// each check the row's agency_id (or, pre-column, metadata.agencyId) against the
// caller's session agencyId BEFORE any update/delete addresses the row by id.
// This is why the routes are safe with a key that bypasses RLS, and why the
// previous null-fail-open RLS policy (`current_profile_agency_id()` is null for
// everyone → "any internal user manages EVERY agency's enquiries") no longer
// matters: the app-level check is authoritative.
//
// Public enquiry CAPTURE is likewise server-mediated and rate-limited: the
// /api/public/form-capture and /api/public/brand-enquiry routes INSERT via this
// same admin client behind per-IP/per-contact rate limits, so browser roles do
// not need — and the corrective migration does not grant them — direct
// anonymous PostgREST INSERT.
//
// DO NOT reintroduce createScopedSupabaseClient() for brand_enquiries. If a new
// route needs enquiry data, use createEnquiryDataClient() and gate ownership
// with the helpers above.
export type EnquiryDbClient = ScopedSupabaseClient;

export function createEnquiryDataClient(): EnquiryDbClient {
  // Structurally identical SupabaseClient; the alias keeps call sites honest
  // about which access model they are on.
  return createSupabaseAdminClient() as unknown as EnquiryDbClient;
}
