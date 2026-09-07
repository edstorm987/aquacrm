// Wearing a department hat: making the narrowed rows actually paint.
//
// The "Working as <department>" lens (`applyDepartmentLens`) already narrows the
// sidebar to a department's rows — but the agency IA-v2 override files the
// business functions (Journey, Fulfilment, Finance, Marketing…) into a single
// panel marked `hidden: true` (see `sidebarLayout.ts` — they render as cards on
// the Operations hub, and Topbar quick-search still reaches them). The Sidebar
// skips hidden panels, so those rows survive the lens in the data but never
// paint. The result: putting on a hat trimmed a panel nobody could see, and the
// visible sidebar looked identical under every hat — which read as broken.
//
// This reveals them. When (and ONLY when) a department hat is on, the surviving
// hidden panel is un-hidden and relabelled to the department, so the sidebar
// visibly becomes that department's. It is deliberately the smallest possible
// change:
//
// ── It only ever un-hides; it never adds a row ────────────────────────────
//
// This runs AFTER the lens, so every row it reveals is one the lens already
// kept — i.e. one the actor was already entitled to (the lens is an
// intersection with what they can view). Flipping `hidden` and relabelling is
// presentation only; the item set is untouched. So this cannot widen access any
// more than the lens could, and the same safety property holds: the worst a bug
// here can do is show or hide your own already-permitted rows.
//
// ── Owner / no hat is byte-identical ──────────────────────────────────────
//
// With no department active it returns the SAME array, so somebody who never
// switches profile gets exactly today's sidebar, unrebuilt.

import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { departmentProfile } from "@/lib/access/departmentProfiles";

/**
 * `panels`, with the department's own (previously hidden, search-only) rows
 * revealed while a hat is on.
 *
 * @param panels      Panels already narrowed by `applyDepartmentLens`.
 * @param departmentId The active "Working as" department, or undefined for the
 *                     owner's full view.
 */
export function revealFocusPanels(panels: NavPanel[], departmentId: string | undefined): NavPanel[] {
  const profile = departmentProfile(departmentId);
  // No hat (or an unrecognised one): return the exact same array untouched.
  if (!profile) return panels;
  return panels.map(panel =>
    panel.hidden && panel.items.length > 0
      // The Operations panel becomes the department's own group; any other
      // hidden-but-surviving panel simply gets shown under its own label.
      ? { ...panel, hidden: false, label: panel.id === "ops" ? profile.label : panel.label }
      : panel,
  );
}
