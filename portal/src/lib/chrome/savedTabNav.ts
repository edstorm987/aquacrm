// The namespace a saved tab uses once it is a nav row.
//
// Deliberately its OWN module with no imports at all. It lives here rather than
// in `sidebarLayout.ts` because that file begins `import "server-only"`, and
// these two functions are needed by client components — `SidebarReorder` builds
// the id when a tab is dropped into a panel, and `Sidebar` reads it back to
// decide whether a row keeps its saved-tab controls.
//
// Putting them in the server module compiled and type-checked and passed the
// whole suite, and broke the page at runtime with "You're importing a module
// that depends on server-only". Pure string helpers shared across the boundary
// need a home on the boundary.
const SAVED_TAB_NAV_PREFIX = "saved:";

/** The id a saved tab uses as a nav row, namespaced so it cannot collide. */
export function savedTabNavId(tabId: string): string {
  return `${SAVED_TAB_NAV_PREFIX}${tabId}`;
}

/**
 * The saved tab behind a nav row id, or null for a real nav item.
 *
 * Added 2026-08-30 because a merged saved tab has to stay recognisable AFTER it
 * joins a panel. Ed: *"the saved tabs loose all their controls once reordered
 * with the defaults."* It could rename, re-icon and unpin while it sat in the
 * Saved section and became an ordinary row the moment it was dragged into one,
 * so arranging it quietly removed the ability to un-arrange it.
 */
export function savedTabIdFromNavId(navId: string): string | null {
  return navId.startsWith(SAVED_TAB_NAV_PREFIX)
    ? navId.slice(SAVED_TAB_NAV_PREFIX.length) || null
    : null;
}
