// Which chrome controls a person may keep on the topbar itself.
//
// Ed, 2026-08-29: *"on mobile we have the little drawer thing but it would be
// useful if I can bring some of them to the topbar and out of the drawer so if
// I really need something it can be one click away."*
//
// ── The list is closed, and that is the point ─────────────────────────────
//
// A stored pin is an id, not a snapshot of the control. That is the same
// "order, not content" rule `userChromeLayout` follows, and it matters for the
// same reason: an id a person can no longer see must be ignored rather than
// resurrect anything, and a control that did not exist when they last arranged
// their bar must appear in its default place rather than vanish. Both fall out
// of normalising every stored list against THIS registry on read.
//
// ── Why ids and not labels ────────────────────────────────────────────────
//
// The label is what the pin sheet shows and what the accessible name says; it
// is free to change with the copy. The id is the contract with a record that
// may have been written months ago on a different device, so it never changes.

/** Every control that can be collapsed into the mobile drawer, in bar order. */
export const TOPBAR_CONTROL_IDS = [
  "company",
  // "Working as" — the department hat. Sits by the company switcher because
  // both answer "which context am I in", and both change what the rest of the
  // chrome shows.
  "department",
  // "My Radar" — your own week's peek. Distinct from "radar", which is the
  // BUSINESS Radar quick look. Sits by "department" because they are two halves
  // of one habit: the hat, and the judgement of the hat.
  "my-radar",
  "search",
  "advisor",
  "privacy",
  "dev-console",
  "radar",
  "inspector",
  "notifications",
  "colour-mode",
] as const;

export type TopbarControlId = (typeof TOPBAR_CONTROL_IDS)[number];

/**
 * How many controls may be kept on the bar at once.
 *
 * Two, because that is what Ed asked for and what the row can carry on a large
 * phone — measured on 2026-08-29 at 320/360/390/430 CSS px. The row's own
 * demand is 180px on the left (menu, back, the page-pin pair) and 92px on the
 * right (the drawer toggle and the account menu), plus 30px of padding and
 * gaps; a slot costs 48px. So two slots fit from about 398px, one from about
 * 350px, and a session that also carries the "Back to website" exit link needs
 * 48px more than that for each.
 *
 * This is a CEILING on what may be stored, never a promise about what is shown.
 * The bar measures itself and holds back any slot that does not fit — see
 * `TopbarOverflow`. Storing a second pin that a small phone cannot show is
 * deliberate: the same account is used on a bigger screen, where it can.
 */
export const MAX_TOPBAR_CONTROLS = 2;

const KNOWN = new Set<string>(TOPBAR_CONTROL_IDS);

export function isTopbarControlId(value: unknown): value is TopbarControlId {
  return typeof value === "string" && KNOWN.has(value);
}

/**
 * A stored pin list, made safe to render.
 *
 * Defensive because this record is written by a client that can be older than
 * the server after a deploy: unknown ids are dropped rather than reserving a
 * slot for a control that is not there, duplicates collapse, and the list is
 * cut to the cap. A malformed value degrades to "nothing pinned", which is the
 * shipped arrangement, never to a throw inside the chrome.
 */
export function normaliseTopbarControls(value: unknown): TopbarControlId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<TopbarControlId>();
  for (const entry of value) {
    if (!isTopbarControlId(entry) || seen.has(entry)) continue;
    seen.add(entry);
    if (seen.size >= MAX_TOPBAR_CONTROLS) break;
  }
  return [...seen];
}
