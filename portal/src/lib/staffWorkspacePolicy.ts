import type { Role } from "@/server/types";

// ONE enumerated statement of what an agency-staff identity may reach.
//
// Before this module the edge proxy carried its own inline page/API
// allowlists while the leaf pages and route handlers made their own,
// independent decisions. Nothing forced the two to agree, so a leaf handler
// could advertise staff access that the proxy silently refused — which is
// exactly how the Team Chat refusal (#25) happened, and how the staff
// department switcher, topbar pin layout, My Radar quick look and records
// search were still refused after it was "fixed".
//
// This file is the single place that enumeration lives. `src/proxy.ts`
// derives its fast optimistic boundary from it; it must not re-declare the
// lists. The leaf pages and routes remain the authoritative check — this
// policy decides what the employee workspace *offers*, never what it proves.
//
// Edge-safe on purpose: constants and pure functions only (the proxy runs on
// the edge runtime, so no fs, no node:crypto, no server-only imports).

export const STAFF_WORKSPACE_ROLE = "agency-staff" as const satisfies Role;

/**
 * Agency pages a delegated staff account may mount. Their leaf pages enforce
 * the canonical element grant, so an explicitly delegated person can open
 * them without the rest of the owner agency shell coming with them.
 */
export const STAFF_DELEGATED_AGENCY_PAGE_ROOTS = [
  "/portal/agency/people",
  "/portal/agency/fulfilment",
  "/portal/agency/portals",
] as const;

/**
 * Portal APIs the employee workspace may call.
 *
 * The first block is the employee-workspace grant as the proxy carried it
 * inline (2026-08-25), moved here unchanged.
 *
 * The second block is the shared workspace chrome. `Topbar` mounts the
 * department switcher, the My Radar control, the pin/overflow layout and
 * `PortalSearch` for EVERY agency role including staff — in the `/portal/team`
 * shell and again on the delegated agency pages above, which render under the
 * agency layout — and each of those leaf routes already admits staff
 * (`AGENCY_ROLES`), with `GET /api/portal/intelligence/my-radar` applying the
 * same `staff.overview` element gate the control itself applies before it
 * renders. The proxy refused all four, so the chrome staff were shown could
 * not do the thing it offered.
 */
export const STAFF_WORKSPACE_API_ROOTS = [
  "/api/portal/access",
  "/api/portal/dev",
  "/api/portal/site-editor/files",
  "/api/portal/dashboard-planning",
  "/api/portal/tasks",
  "/api/portal/calendar",
  "/api/portal/people",
  "/api/portal/notepad",
  "/api/portal/team-chat",
  "/api/portal/pipelines/move-client",
  "/api/portal/products",
  "/api/portal/aqua-tags/detect",
  "/api/portal/website-sources",
  "/api/portal/website-injections",

  "/api/portal/chrome",
  "/api/portal/intelligence/my-radar",
  "/api/portal/search",

  // The employee sidebar's own "My profile" row (`/portal/team` layout →
  // `/portal/account`) mounts `TwoFactorPanel` → `TwoFactorSetup`, which is
  // the ONLY place a person switches two-factor on. Both `mfa` routes act
  // exclusively on the Supabase session resolved from the caller's own
  // cookies — they take no account identifier and read no agency data — so
  // refusing them told a staff account "Unknown" about its own protection and
  // left it with no way to enable 2FA at all. Granting them adds no
  // disclosure; withholding them was a security regression.
  "/api/portal/mfa",
] as const;

/** The refusal the proxy returns for a portal API outside the policy. */
export const STAFF_WORKSPACE_API_REFUSAL = "This API is not available in the employee workspace.";

function matchesRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** True for an `/portal/agency/...` path a delegated staff account may mount. */
export function isStaffDelegatedAgencyPagePath(path: string): boolean {
  return STAFF_DELEGATED_AGENCY_PAGE_ROOTS.some(root => matchesRoot(path, root));
}

/** True for an `/api/portal/...` path the employee workspace may call. */
export function isStaffWorkspaceApiPath(path: string): boolean {
  return STAFF_WORKSPACE_API_ROOTS.some(root => matchesRoot(path, root));
}
