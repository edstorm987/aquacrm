// Where a "Working as <department>" hat lands.
//
// Ed: *"if i choose to work as executive i get a full executive mode across the
// app, sidebar items change; same for sales it shows the sales stuff… the
// department things all custom ui so the owner can truly lock in and get what
// needs to happen done."*
//
// Phase 1 narrowed the SIDEBAR under a hat. This decides the LANDING, and Ed's
// choice was to EMBED THE FULL WORKSPACE for each hat — not a launcher of link
// cards. So a hat lands you directly in that department's real, purpose-built
// workspace: Sales → the leads/scouting/meetings board, Delivery → Fulfilment,
// Finance → the finance workspace, Marketing → Marketing, Support → the master
// inbox. Executive is the exception: it lands on its own Command Centre station
// (`focusLandingStation`), which is already the full executive deck in place.
//
// ── Why a redirect, and why it is not a trap ──────────────────────────────
//
// These five workspaces are heavy, tightly-coupled routes whose data-prep lives
// in their own page. Re-rendering them inside a wrapper would mean duplicating
// hundreds of lines per route — the one thing this codebase's rules forbid. So a
// hat sends `/portal/agency` straight to the department's real route: the whole
// workspace, reused verbatim, zero duplication. It is not a cage — the sidebar is
// already narrowed to the department (phase 1), the top bar still shows
// "Working as <department>" with the one-click way back to Owner, and taking the
// hat off makes `/portal/agency` render the Command Centre again. The redirect
// only fires when the URL carries no `?station=`, so an explicit Command Centre
// station is still reachable under a hat. This grants nothing: every target is a
// route already gated by its own access checks.

import { type DepartmentId } from "@/lib/access/departmentProfiles";

/**
 * The real workspace route each hat lands in. Executive is absent — it lands on
 * its Command Centre station instead (`focusLandingStation`).
 */
export const DEPARTMENT_WORKSPACE_HREF: Readonly<Partial<Record<DepartmentId, string>>> = {
  sales: "/portal/agency/scouting",
  delivery: "/portal/agency/fulfilment",
  finance: "/portal/agency/agency-finance",
  marketing: "/portal/agency/marketing",
  support: "/portal/agency/inbox",
};

/**
 * The workspace route a hat should land in, or `null` when the hat has none
 * (no hat, an unknown value, or Executive — which lands on its station).
 */
export function focusHomeHref(departmentId: string | undefined): string | null {
  if (!departmentId) return null;
  return DEPARTMENT_WORKSPACE_HREF[departmentId as DepartmentId] ?? null;
}

/** The department id when it has a workspace landing, else `null`. */
export function focusHomeDepartment(departmentId: string | undefined): DepartmentId | null {
  return focusHomeHref(departmentId) ? (departmentId as DepartmentId) : null;
}

/**
 * Whether the landing-follows-the-hat behaviour is on. Default ON; it exists so
 * the swap can be turned off from the deploy's environment (Railway) without a
 * code redeploy if it ever misbehaves — set `PORTAL_ROLE_FOCUS_HOME=off`.
 */
export function isFocusHomeEnabled(): boolean {
  const raw = process.env.PORTAL_ROLE_FOCUS_HOME?.trim().toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0" && raw !== "disabled";
}
