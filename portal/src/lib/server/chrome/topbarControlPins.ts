import "server-only";

// Which controls this person keeps on the topbar. One place, read by `Topbar`.
//
// It sits beside `withPersonalChrome` for the same reason that exists: the
// arrangement is stored once, on the account, and every surface that renders
// the chrome has to get it from the same place or they drift. `Topbar` is that
// single caller, so unlike the sidebar there is nothing to sweep for — the
// preference cannot reach the bar by any other route.
//
// ── It fails CLOSED, and that is the opposite of the sidebar ──────────────
//
// `withPersonalChrome` fails open, returning the default arrangement, because
// losing the nav is being locked out of the app. Nothing is at stake here: a
// control that fails to promote is still one tap away in the drawer it has
// always lived in. So every failure resolves to "nothing pinned", which is the
// shipped bar.

import { getSession } from "@/lib/server/auth/auth";
import { normaliseTopbarControls, type TopbarControlId } from "@/lib/chrome/topbarControls";
import { getUserChromeLayout } from "@/lib/server/chrome/userChromeLayout";

/**
 * This person's pinned control ids, read on the server so the first paint is
 * already the bar they arranged — no promoting things into place after
 * hydration, which is the flash this read exists to avoid.
 *
 * Reads only. `getUserChromeLayout` stores nothing for somebody who has never
 * pinned anything, which matters because this runs on every authenticated
 * navigation (issue #21).
 */
export async function topbarControlPins(): Promise<TopbarControlId[]> {
  try {
    const session = await getSession();
    if (!session) return [];
    return normaliseTopbarControls(getUserChromeLayout(session.agencyId, session.userId).topbarControls);
  } catch {
    return [];
  }
}
