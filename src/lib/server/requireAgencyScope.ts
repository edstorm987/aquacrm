// R023 — `lead` role boundary helper.
//
// Most route handlers assume `session.agencyId` resolves to a real
// agency record. Leads are global tenants (no agency) — they should
// never reach those handlers. This helper centralises the 403 so
// callers can drop one line at the top of any agency-scoped endpoint:
//
//   const session = await requireSession();
//   requireAgencyScope(session);    // throws 403 for lead role
//
// Pairs with `requireRole` — that gates by allowed-role list, this
// gates by whether the session has any agency scope at all.

import { AuthError } from "./auth";
import type { SessionPayload } from "@/server/types";
import { LEAD_AGENCY_ID, isLeadRole } from "@/server/types";

export function isAgencyScopedSession(session: SessionPayload): boolean {
  if (isLeadRole(session.role)) return false;
  if (session.agencyId === LEAD_AGENCY_ID) return false;
  if (!session.agencyId) return false;
  return true;
}

export function requireAgencyScope(session: SessionPayload): void {
  if (!isAgencyScopedSession(session)) {
    throw new AuthError(403, "agency_scope_required");
  }
}
