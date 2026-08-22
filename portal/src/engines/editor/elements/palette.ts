// What can be placed here — one palette, filtered by surface.
//
// ─── The question this module answers, and the one it does not ────────────
//
// There are two separate questions about a target, and collapsing them is what
// hid the whole website block library from the Dev Editor:
//
//   1. WHICH VOCABULARY does this target speak?  ← this module
//      Every target has one. A client portal speaks the portal's 16 names; a
//      site, a repository or a game build speaks the website's 70 elements.
//      "No vocabulary" is not one of the answers.
//
//   2. IS THERE AN AQUA-HOSTED PORTAL DOCUMENT behind it?  ← `portalTarget`
//      That owns portal pages, the lifecycle stage, the draft/publish pair and
//      the portal-only inspectors. It is NOT the same question as (1), and it
//      must never be used to decide (1) again: `portalTarget` is false for
//      every project Ed creates, so gating the palette on it meant those
//      projects were offered nothing at all.
//
// A third question — "can a live page be clicked?" — belongs to the Aqua Tag
// alone (`tagMapped`). See `editing/modes.ts`.
//
// ─── Layering ─────────────────────────────────────────────────────────────
//
// Same rules as the rest of `src/engines/editor/elements`: no `server-only`,
// no plugin import, nothing that breaks under `--conditions react-server`. The
// website definitions are read through the shared registry, which the plugin
// fills on import — see `./websiteElements.ts` for how the editor makes that
// import happen without paying for it up front.

import type { ElementCategory, ElementSurface } from "./definition";
import { PORTAL_ELEMENT_PAIRINGS } from "./portalElements";
import { listElementDefinitions } from "./registry";

/** Which vocabulary a target speaks. Never "none". */
export function elementSurfaceFor(target: { portalTarget: boolean }): ElementSurface {
  return target.portalTarget ? "portal" : "website";
}

/**
 * One placeable thing, in the words of the surface it belongs to.
 *
 * `type` is the value that surface stores in a block's `type` field, which is
 * why the portal branch below reads `PORTAL_ELEMENT_PAIRINGS` rather than
 * `listElementDefinitions("portal")`: the portal's `callout` is the shared
 * `banner`, and inserting a block typed "banner" into a portal page would
 * write a type `ClientPortalBlockType` does not have. The pairing table is the
 * naming layer, and it is already derived from the shared registry — using it
 * here is not a second list.
 */
export interface ElementPaletteItem {
  type: string;
  label: string;
  /** Group header in the palette. */
  group: string;
  /** One line, where the surface's vocabulary carries one. */
  description?: string;
  /** The glyph the website library ships. Portal names carry none. */
  icon?: string;
  isContainer: boolean;
}

// ─── Group headers ────────────────────────────────────────────────────────

/**
 * The website categories, in palette order.
 *
 * The plugin's own `BlockCatalog.tsx` keeps an identical pair for its
 * standalone sidebar. This copy exists because the engine may not import the
 * plugin (see the layering note above); it is presentation only, so a drift
 * costs a header word and never a wrong element.
 */
export const WEBSITE_CATEGORY_ORDER: readonly ElementCategory[] = [
  "layout", "content", "media", "commerce", "auth", "advanced",
];

export const WEBSITE_CATEGORY_LABELS: Record<ElementCategory, string> = {
  layout: "Layout",
  content: "Content",
  media: "Media",
  commerce: "Commerce",
  auth: "Auth",
  advanced: "Advanced",
};

/**
 * The portal group headers, kept EXACTLY as the Dev Editor's add menu already
 * wrote them — this module replaced that inline map, and a palette that
 * silently renames its own headers is a regression even when every entry is
 * right.
 */
export const PORTAL_CATEGORY_LABELS: Record<string, string> = {
  content: "Content blocks",
  "live-data": "Live data",
  layout: "Layout",
};

// ─── The palette ──────────────────────────────────────────────────────────

/**
 * Everything placeable on one surface, in that surface's own order.
 *
 * The website branch returns `[]` until the vocabulary has been registered —
 * it is an import side effect, not a static table. Call `ensureWebsiteElements()`
 * first, and treat an empty result as "still loading", never as "there are
 * none".
 */
export function elementPalette(surface: ElementSurface): ElementPaletteItem[] {
  if (surface === "portal") {
    return PORTAL_ELEMENT_PAIRINGS
      .filter(pairing => pairing.palette)
      .map(pairing => ({
        type: pairing.type,
        label: pairing.label,
        description: pairing.description,
        group: PORTAL_CATEGORY_LABELS[pairing.category] ?? "Blocks",
        // The portal builder is a flat list of page blocks. Nothing in its
        // vocabulary nests, which is a fact about that surface rather than a
        // shortcut here.
        isContainer: false,
      }));
  }

  const byCategory = (category: ElementCategory) => WEBSITE_CATEGORY_ORDER.indexOf(category);
  return listElementDefinitions(surface)
    .slice()
    .sort((a, b) => byCategory(a.category) - byCategory(b.category))
    .map(definition => ({
      type: definition.type,
      label: definition.label,
      group: WEBSITE_CATEGORY_LABELS[definition.category] ?? "Elements",
      icon: definition.icon,
      isContainer: definition.isContainer,
    }));
}

/** The palette, grouped, with the headers in surface order. */
export function elementPaletteGroups(surface: ElementSurface): Array<{ group: string; items: ElementPaletteItem[] }> {
  const groups: Array<{ group: string; items: ElementPaletteItem[] }> = [];
  for (const item of elementPalette(surface)) {
    const existing = groups.find(entry => entry.group === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

// ─── What is true about placing one ───────────────────────────────────────

/**
 * Where an element from this palette can actually go, in one sentence.
 *
 * The ONE place those words are written, for the same reason
 * `devProjectTagSentence` is: a panel that paraphrases a rule ends up
 * describing a different rule from the one the code follows. Every sentence
 * below is deliberately blunt about what is not built — offering a library and
 * implying it can be dropped onto a live page would be a worse lie than the
 * empty menu this replaced.
 */
export function elementLibrarySentence(input: {
  surface: ElementSurface;
  /** A portal design document is open, so blocks have a page to land on. */
  hasPortalDocument: boolean;
  /** An Aqua Tag answers on this project's page. */
  tagMapped: boolean;
  /** Definitions counted right now. 0 on the website surface means loading. */
  count: number;
}): string {
  if (input.surface === "portal") {
    return input.hasPortalDocument
      ? "These are the portal's own blocks. Adding one puts it on the page you are looking at, in the draft — publish to send it live."
      : "These are the portal's own blocks. No portal page is open, so there is nowhere to put one yet.";
  }
  if (input.count === 0) {
    return "Loading the website element library…";
  }
  // Phase 7 changed what is true here: selecting an element can now WRITE its
  // code into the project's source, as a commit on the draft branch (see
  // `emit.ts` + `server/sourceInsert.ts` + the insert pair on repo-write).
  // What has NOT changed is the tag: its protocol still carries selections and
  // text patches, not inserts — so the loaded page never changes on the spot,
  // and these sentences must never claim it does.
  if (!input.tagMapped) {
    return `The website vocabulary — ${input.count} elements. There is no browser yet, because no Aqua Tag answers on this project (connect it in Settings) — but selecting an element can still write its code into the project's source, onto the draft branch.`;
  }
  return `The website vocabulary — ${input.count} elements. The Aqua Tag is answering, so a click on the page resolves to an exact element (see the Element panel). Inserting an element writes its code into the project's source, onto the draft branch — the tag carries selections and text patches, not inserts, so the page you are looking at changes when that commit is published and deployed, not on the spot.`;
}
