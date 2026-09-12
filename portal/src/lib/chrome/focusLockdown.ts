// Locking a department hat down to just that role.
//
// Ed: *"the modes solely focus on it — no Command Centre or anything it normally
// would have… the idea is to focus into that role only, not have access to all
// operations, the entire journey etc. focus down fully."*
//
// Phase 1's lens NARROWED the sidebar to the rows a department covers, but it
// still left the macro shell in place: the Command Centre home, the Operations
// hub (the door to every function and the whole journey), and Tools. Wearing a
// hat still let you step back out to everything. This strips that shell so a hat
// is a real lockdown: the role's own surfaces, plus the two universal personal
// rows Ed chose to keep — My Radar and the Inbox — and nothing else. The top bar
// (and its "Working as → Owner" way out) is untouched.
//
// ── Still subtractive, still safe ─────────────────────────────────────────
//
// The lens's security argument is that a hat can only ever REMOVE rows, so a
// forged cookie can never widen access. This preserves that: it removes the
// macro-shell rows, and the only rows it adds back (My Radar, Inbox) are taken
// from the ORIGINAL, already-role-filtered panels — i.e. rows the person is
// already entitled to. A person not entitled to the Inbox has no Inbox row to
// re-add, so they still get nothing extra. It never introduces a row that was
// not already the person's to see.
//
// Executive is deliberately exempt: it is the oversight seat, broad by design,
// and lands on the Command Centre deck rather than a single-function workspace.
// Only the five operational focus-home departments lock down.

import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { focusHomeDepartment } from "@/lib/access/focusHome";

type NavItem = NavPanel["items"][number];

/** The macro-shell rows a hat hides: the Command Centre, the Operations hub
 *  (the gateway to every function and the whole journey), and Tools. */
const MACRO_DOORS = new Set(["home", "operations-home", "tools"]);

/** The two universal personal rows kept under every hat, in this order. */
const KEEP_SHELL = ["my-radar", "inbox"] as const;

/** The Sales hat is an acquisition loop, in the order work usually happens. */
const SALES_FOCUS_ORDER = ["scouting", "researching", "prospecting", "meetings", "inbox", "contacts"] as const;

/**
 * `focused` (already lensed + revealed) reduced to just the department's own
 * surfaces plus My Radar and the Inbox.
 *
 * Returns `focused` unchanged when there is no hat, an unknown hat, or the
 * Executive hat — so the owner's sidebar and the oversight seat are untouched.
 *
 * @param original the entitled, pre-lens panels — the source of the personal
 *   rows re-added, so nothing the person is not already entitled to can appear.
 * @param focused  the lensed + revealed panels to lock down.
 */
export function focusLockdown(original: NavPanel[], focused: NavPanel[], departmentId: string | undefined): NavPanel[] {
  if (!focusHomeDepartment(departmentId)) return focused;

  // The personal shell rows the person actually has, in the fixed order, taken
  // from the entitled panels so this can only ever re-add something they own.
  const entitled = new Map<string, NavItem>();
  for (const panel of original) for (const item of panel.items) if (!entitled.has(item.id)) entitled.set(item.id, item);

  if (departmentId === "sales") {
    const focusedItems = new Map<string, NavItem>();
    for (const panel of focused) for (const item of panel.items) if (!focusedItems.has(item.id)) focusedItems.set(item.id, item);
    const items = SALES_FOCUS_ORDER
      .map(id => focusedItems.get(id) ?? entitled.get(id))
      .filter((item): item is NavItem => Boolean(item))
      .map(item => item.id === "inbox" ? { ...item, label: "Inbox" } : item);
    const out: NavPanel[] = items.length ? [{ id: "sales", label: "Sales", order: 0, items }] : [];
    const settings = focused.find(panel => panel.id === "settings");
    if (settings) out.push(settings);
    return out;
  }

  const shellItems = KEEP_SHELL.map(id => entitled.get(id)).filter((item): item is NavItem => Boolean(item));

  const out: NavPanel[] = [];
  if (shellItems.length) out.push({ id: "main", label: "", order: 0, items: shellItems });

  // Keep the department's own function panels (the revealed group), macro doors
  // stripped defensively; drop the old macro "main" (replaced above) and hold
  // Settings for the footer.
  for (const panel of focused) {
    if (panel.id === "main" || panel.id === "settings") continue;
    const items = panel.items.filter(item => !MACRO_DOORS.has(item.id));
    if (items.length) out.push({ ...panel, items });
  }

  const settings = focused.find(panel => panel.id === "settings");
  if (settings) out.push(settings);

  return out;
}
