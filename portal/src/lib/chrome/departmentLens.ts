// Wearing a department: what the sidebar shows while you are working as one.
//
// Ed, 2026-08-29: *"say owner needs to do sales, he will go to owner's profile
// and then switch to sales profile — reason being if you look at the micro
// you'll see the impact rather than a macro view."*
//
// ── The safety property that matters most ─────────────────────────────────
//
// **A lens can only ever REMOVE rows.** It is applied to panels that have
// already been assembled and role-filtered, so putting one on narrows what you
// see and can never reveal something you were not already entitled to. That is
// deliberate and it is why this is allowed to be a purely presentational
// client-side concern: the worst a bug here can do is hide your own nav.
//
// If a lens could ADD rows it would be a permission system, it would need to
// agree with `requireAccessCapability` for ever, and the day they disagreed
// would be a breach. So: intersection only, and a test pins it.
//
// ── Why hiding empty panels matters ───────────────────────────────────────
//
// Narrowing usually empties several panels completely. Leaving their headings
// behind would produce a sidebar of empty section titles — which reads as
// broken rather than as focused, and is the fastest way to make somebody take
// the hat back off.

import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { navVisibleUnderLens } from "@/lib/access/navElementKeys";
import { departmentProfile, type DepartmentProfile } from "@/lib/access/departmentProfiles";

/** Every element key a department covers, whether to use or merely to see. */
export function lensElementKeys(profile: DepartmentProfile): Set<string> {
  return new Set<string>([...profile.use, ...profile.view]);
}

/**
 * `panels`, narrowed to one department.
 *
 * Returns the SAME array when there is no active department, so somebody who
 * never switches profile gets exactly today's sidebar — not a rebuilt copy of
 * it that happens to look the same.
 */
export function applyDepartmentLens(panels: NavPanel[], departmentId: string | undefined): NavPanel[] {
  const profile = departmentProfile(departmentId);
  if (!profile) return panels;

  const allowed = lensElementKeys(profile);
  return panels
    .map(panel => ({ ...panel, items: panel.items.filter(item => navVisibleUnderLens(item.id, allowed)) }))
    // A heading with nothing under it reads as broken, not as focused.
    .filter(panel => panel.items.length > 0);
}

/**
 * Is this department worth offering to somebody?
 *
 * A lens that would empty the sidebar entirely is worse than no lens: it looks
 * like the app broke. So the switcher only offers a department the person has
 * at least one visible row for — which, because lensing is an intersection with
 * what they can already reach, also means a staff member is never offered a
 * department they have no access to work in.
 */
export function departmentHasVisibleNav(panels: NavPanel[], departmentId: string): boolean {
  return applyDepartmentLens(panels, departmentId).length > 0;
}
