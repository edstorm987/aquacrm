// Which access element each nav row belongs to.
//
// ── Why a central map and not a field on NavItem ──────────────────────────
//
// `NavItem` carries `visibleToRoles` and nothing finer, and it is declared in
// thirteen module manifests plus the core sidebar. Adding an `elementKey` field
// would mean editing every one of them before ANY of this worked, and a module
// author who forgot it would silently produce a row no lens could place.
//
// A central map is additive instead: it grows as surfaces are governed, it can
// be read by a test that lists what is still unmapped, and it follows the shape
// the access layer already uses for staff stations
// (`STAFF_STATION_ELEMENT_KEYS` in `workspaceElementAccess.ts`).
//
// ── This map is a LENS, not a permission ──────────────────────────────────
//
// Nothing here decides what anybody may do. Permissions live at the route, in
// `requireAccessCapability`, and they stay there. This decides only what is
// SHOWN while somebody is wearing a department profile — so a gap in this map
// is a row missing from a narrowed sidebar, never a door left open.
//
// That distinction is why unmapped rows are hidden under a lens rather than
// shown: wearing the sales hat means "show me sales", and a row nobody has
// placed yet is not sales. Taking the hat off shows everything again.

import type { AccessElementKey } from "@/server/types";

/**
 * Nav item id → the element it belongs to.
 *
 * Deliberately incomplete. It covers the surfaces a department profile needs to
 * narrow to; the long tail of admin and settings rows is unmapped because no
 * department lens should show them anyway.
 */
export const NAV_ELEMENT_KEYS: Readonly<Record<string, AccessElementKey>> = {
  // ── Growth / sales ──────────────────────────────────────────────────────
  "leads-pipeline.board": "growth.leads",
  "leads-pipeline.contacts": "growth.contacts",
  "leads-pipeline.campaigns": "growth.campaigns",
  "agency-marketing.leads": "growth.leads",
  "agency-marketing.campaigns": "growth.campaigns",
  "client-crm.contacts": "growth.contacts",
  "client-crm.pipelines": "growth.leads",
  "client-crm.segments": "growth.contacts",
  pipelines: "growth.leads",

  // ── Workspace ───────────────────────────────────────────────────────────
  home: "workspace.overview",
  inbox: "workspace.inbox",
  "email-sender.outbox": "workspace.inbox",
  ops: "workspace.actions",
  "operations-home": "workspace.actions",
  "my-radar": "staff.overview",

  // ── Fulfilment / delivery ───────────────────────────────────────────────
  fulfilment: "fulfilment.overview",
  fulfillment: "fulfilment.overview",
  "agency-phases": "fulfilment.projects",

  // ── Finance ─────────────────────────────────────────────────────────────
  finance: "client.commercial",

  // ── Marketing ───────────────────────────────────────────────────────────
  marketing: "client.marketing",
  "agency-marketing.calendar": "client.marketing",
  "agency-marketing.templates": "client.marketing",
  "agency-marketing.touchpoints": "client.marketing",
  content: "workspace.files",

  // ── Deliberately NOT mapped: staff and people ───────────────────────────
  //
  // `people`, `agency-hr.*` and the rest of staff management belong to no
  // department seat, because managing people is the OWNER's job — which is the
  // same reason no preset in `departmentProfiles` grants `staff.people`.
  //
  // Mapping them anyway (as the first version of this file did) produced rows
  // pointing at elements no department holds: permanently invisible under every
  // lens, while reading as governed. A smoke test now fails on exactly that,
  // because a map entry that can never match is worse than an absent one.
};

/** The element a nav row belongs to, if anybody has placed it. */
export function navElementKey(navId: string): AccessElementKey | undefined {
  return NAV_ELEMENT_KEYS[navId];
}

/**
 * Should this row be shown while wearing `allowed`?
 *
 * `allowed` is the set of element keys the active department covers. An
 * unmapped row is hidden: a lens that leaked every unplaced row would show
 * almost the whole sidebar and stop being a lens at all.
 */
export function navVisibleUnderLens(navId: string, allowed: ReadonlySet<string>): boolean {
  const key = navElementKey(navId);
  return key !== undefined && allowed.has(key);
}
