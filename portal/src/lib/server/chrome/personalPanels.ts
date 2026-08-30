import "server-only";

// The one place a person's own arrangement is applied to their nav.
//
// Every workspace assembles its own panels — Agency from `buildSidebar`, Dev
// Team, Team and the client workspace from literals — and each of them then
// renders `<Sidebar panels={…}>`. Ed asked for *anyone* to be able to reorder
// their sidebar, which means all of them, and five copies of "read the layout,
// apply the order" would be five chances to drift. `smoke-chrome-layout` sweeps
// for a `<Sidebar panels={` that did not come through here.
//
// ── It fails OPEN, deliberately ───────────────────────────────────────────
//
// If the layout cannot be read for any reason, the caller gets the panels it
// passed in, unchanged. A personal arrangement is a convenience; the nav is how
// somebody reaches their work. Losing the arrangement is an annoyance, and
// losing the nav is being locked out of the app — so every failure here resolves
// to the default arrangement rather than to nothing.

import { getSession } from "@/lib/server/auth/auth";
import { applyPersonalChrome, type NavPanel } from "@/lib/chrome/sidebarLayout";
import { getUserChromeLayout } from "@/lib/server/chrome/userChromeLayout";
import { applyDepartmentLens } from "@/lib/chrome/departmentLens";
import { getActiveDepartmentId } from "@/lib/server/chrome/activeDepartment";

/**
 * `panels`, arranged the way this person arranged them.
 *
 * Reads only — `getUserChromeLayout` returns an empty arrangement for somebody
 * who has never dragged anything and stores nothing. That matters more here
 * than anywhere else in the app: this runs on every authenticated navigation,
 * so a write on this path would be a write on every page load (issue #21).
 */
export async function withPersonalChrome(panels: NavPanel[]): Promise<NavPanel[]> {
  try {
    const session = await getSession();
    if (!session) return panels;
    // The department hat first, the personal arrangement second. Order matters:
    // arranging is about the rows you HAVE, so narrowing after arranging would
    // leave a person's order applied to rows they cannot currently see.
    const department = await getActiveDepartmentId();
    const lensed = applyDepartmentLens(panels, department);

    const layout = getUserChromeLayout(session.agencyId, session.userId);
    // Nothing arranged and nothing saved: return the very same array, so a
    // person who has never touched this gets today's behaviour exactly.
    if (!layout.panelOrder.length && !Object.keys(layout.itemOrder).length && !layout.savedTabs.length) {
      return lensed;
    }
    return applyPersonalChrome(lensed, {
      panelOrder: layout.panelOrder,
      itemOrder: layout.itemOrder,
      savedTabs: layout.savedTabs.map(tab => ({
        id: tab.id,
        href: tab.href,
        label: tab.label,
        placement: tab.placement,
        order: tab.order,
        icon: tab.icon,
      })),
    });
  } catch {
    return panels;
  }
}
