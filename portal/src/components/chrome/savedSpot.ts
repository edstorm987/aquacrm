// "The spot to get the right location" — picking a place in a page, and finding
// it again later.
//
// Ed, 2026-08-27, on what a saved tab should capture: *"both spot and view — the
// view so we get the right icon and the spot to get the right location."* The
// view is the href and lives in the saved tab; this file is the spot.
//
// ── Why a selector AND the text ───────────────────────────────────────────
//
// A CSS selector alone is the obvious implementation and it rots the first time
// the markup around it changes — a wrapper div appears, an `nth-of-type` shifts
// by one, and the shortcut silently scrolls to the wrong card. Nothing tells the
// person; they just start distrusting their own shortcuts.
//
// So the text the element carried at save time is stored beside the selector and
// used as a fallback. That does two things: it usually still finds the right
// place after a refactor, and when it cannot, the caller knows the difference
// between "found it" and "this has moved" and can say so instead of quietly
// doing nothing.
//
// ── Why the selector is built the way it is ───────────────────────────────
//
// In preference order: an id, a `data-testid`, a `data-*` hook, then a short
// structural path. The first three survive layout changes; the last one is the
// admission that some pages have nothing stable to hold on to, and it is kept
// SHORT deliberately — a fifteen-level path is not more accurate, it is just
// more ways to be wrong.

export interface SavedSpot {
  selector: string;
  text: string;
}

/** How the spot was found, so a caller can be honest about a near miss. */
export type SpotMatch =
  | { kind: "exact"; element: Element }
  | { kind: "by-text"; element: Element }
  | { kind: "missing" };

const MAX_DEPTH = 5;
const MAX_TEXT = 120;

function escape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\\]\[#.:>+~*^$|() ]/g, "\\$&");
}

/** The visible text of an element, trimmed to something storable. */
export function spotText(element: Element): string {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}

/**
 * A selector for this element, as stable as the page allows.
 *
 * Returns "" when there is nothing usable — a caller must treat that as "no
 * spot", not as "the whole document".
 */
export function selectorFor(element: Element): string {
  if (!element || element === document.documentElement || element === document.body) return "";

  if (element.id) return `#${escape(element.id)}`;

  const testId = element.getAttribute("data-testid");
  if (testId) return `[data-testid="${escape(testId)}"]`;

  for (const attribute of ["data-panel-id", "data-section", "data-tab", "data-card", "data-nav-tone"]) {
    const value = element.getAttribute(attribute);
    if (value) return `[${attribute}="${escape(value)}"]`;
  }

  // Structural fallback. Anchored at the nearest ancestor that HAS something
  // stable, so a page that names one container gives every child a short,
  // meaningful path instead of one long fragile one from <body>.
  const parts: string[] = [];
  let node: Element | null = element;
  let depth = 0;
  while (node && depth < MAX_DEPTH && node !== document.body) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    if (node.id) { parts.unshift(`#${escape(node.id)}`); return parts.join(" > "); }
    const tag = node.tagName.toLowerCase();
    const siblings = [...parent.children].filter(child => child.tagName === node!.tagName);
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    node = parent;
    depth += 1;
  }
  return parts.length ? parts.join(" > ") : "";
}

/** Capture the spot for an element, or null when it has nothing to hold on to. */
export function spotFor(element: Element): SavedSpot | null {
  const selector = selectorFor(element);
  if (!selector) return null;
  return { selector, text: spotText(element) };
}

/**
 * Find a saved spot in the page as it is now.
 *
 * The selector first; then, if that misses or lands on something whose text no
 * longer matches at all, the text. The second pass is what stops a shortcut
 * quietly pointing at a different card after a layout change.
 */
export function findSpot(spot: SavedSpot, root: ParentNode = document): SpotMatch {
  let bySelector: Element | null = null;
  try {
    bySelector = root.querySelector(spot.selector);
  } catch {
    // A stored selector can be invalid after a browser change or a bad capture.
    bySelector = null;
  }
  if (bySelector) {
    // No text to compare against means the selector is all there is, and it
    // matched — that is an exact hit, not a doubtful one.
    if (!spot.text) return { kind: "exact", element: bySelector };
    if (spotText(bySelector).startsWith(spot.text.slice(0, 24))) return { kind: "exact", element: bySelector };
  }

  if (spot.text) {
    const needle = spot.text.slice(0, 60).toLowerCase();
    // Headings first: they are what a person actually points at when they mean
    // "this section", and matching them beats matching a stray span with the
    // same words inside a paragraph.
    const candidates = [
      ...root.querySelectorAll("h1, h2, h3, h4, [data-testid], [role='heading']"),
      ...root.querySelectorAll("section, article, li, div"),
    ];
    for (const candidate of candidates) {
      if (spotText(candidate).toLowerCase().startsWith(needle)) return { kind: "by-text", element: candidate };
    }
  }

  // The selector matched but the text did not, and nothing else did either.
  // Prefer the selector's element over nothing — it is still the best guess.
  if (bySelector) return { kind: "by-text", element: bySelector };
  return { kind: "missing" };
}
