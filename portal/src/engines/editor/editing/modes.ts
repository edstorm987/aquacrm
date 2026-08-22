/**
 * How deep somebody wants to go, kept separate from what they are editing.
 *
 * The Studio's tabs answer "what am I changing?" — content, layout, brand,
 * code. That is a different question from "how much do I want to be shown?",
 * and collapsing the two is why an editor feels intimidating to one person and
 * restrictive to the next. Six tabs in front of somebody who came to fix a
 * typo is noise; hiding the code from somebody who wants it is a dead end.
 *
 * So the mode is chosen once and gates the tabs. Same editor, three depths.
 */

export type EditingMode = "assist" | "visual" | "developer";

export interface EditingModeDefinition {
  id: EditingMode;
  label: string;
  /** What it is for, in the words of somebody choosing it. */
  summary: string;
  /**
   * Which inspector tabs are offered. Ordered as listed, so the tab somebody
   * in this mode wants first is first.
   */
  tabs: string[];
}

export const EDITING_MODES: EditingModeDefinition[] = [
  {
    id: "assist",
    label: "Just tell it",
    summary: "The page and the assistant, together. Point at anything and describe the change.",
    // The shallowest depth of all: you do not learn the tool, you talk to it.
    // Content rides along so an answer can be applied by hand without switching
    // mode — the assistant proposes, a person still accepts.
    tabs: ["assistant", "content"],
  },
  {
    id: "visual",
    label: "Visual builder",
    summary: "Build it — the words, blocks, pages and brand, on top of the live page.",
    // "element" is where a click on the tagged page lands: the exact text of
    // the thing clicked, editable, with its styling beside it. It used to be
    // a whole depth of its own — "Just the words", `id: "simple"` — merged
    // here 2026-08-22 because it was the same interaction at a lesser depth.
    // Ed: "id want to actually just combine it into visual mode as its the
    // same you select element change type it add it in". `editingMode()`
    // still answers for a saved "simple", by name — see the migration there.
    tabs: ["assistant", "builder", "element", "content", "pages", "brand", "versions"],
  },
  {
    id: "developer",
    label: "Dev",
    summary: "The code and the repository. Bring the browser in when you need to see it.",
    // Cumulative by design — Ed: "now for dev its all of them + the vs way".
    //
    // "librarian" is Dev-only on purpose: it answers "where does X live / what
    // can I reuse" over the project's files, the docs library and the symbol
    // reference (the file-finding skill, `lib/server/dev/fileFinding.ts`) —
    // a developer's question. The Librarian FINDS; the assistant tab EDITS.
    // It is not a portal-document tab and needs no tag, so once offered, the
    // default rule in `inspectorTabsFor` rightly offers it on every target.
    // OFFERED is the operative word: it is declared on this ladder but held
    // out of `INSPECTOR_TABS` below until the DevEditor mount pass — see the
    // note there for why the two must land together.
    //
    // "drafts" / "history" / "notes" are the WORK LIFECYCLE (dev-editor-finish
    // phase 14), Dev-only like the Librarian. Ed: "in the right side we also
    // need notes and drafts version control logs for the project in dev mode".
    // Drafts is the project's edit branch AS the draft (the repository is the
    // draft store — never a second one), History is that branch's commits plus
    // the Dev Team's check-ins in one honest feed, Notes is per project. None
    // needs a portal document or a tag, so the default rule offers them on
    // every developer target; a project with no repository is told so in the
    // panel's own words rather than by a vanishing tab.
    tabs: ["assistant", "builder", "element", "content", "pages", "brand", "code", "repository", "drafts", "history", "notes", "librarian", "versions"],
  },
];

/**
 * Every inspector tab, in the order the rail and the mobile strip show them.
 *
 * The order lives HERE rather than beside the icons in `DevEditor.tsx` so the
 * rule below and the rendering cannot end up listing different tabs.
 */
export const INSPECTOR_TABS = [
  "assistant",
  "settings",
  "builder",
  "element",
  "content",
  "pages",
  "brand",
  "code",
  "repository",
  // The work-lifecycle trio (phase 14), Dev mode only — the ladder above
  // gates them. Same compile-unit rule as the Librarian below: each entry
  // here demands its TAB_META row and panel branch in DevEditor.tsx, and tsc
  // holds the three together through the exhaustive Record<InspectorTab,…>.
  "drafts",
  "history",
  "notes",
  // "librarian" — the file-finding panel, Dev mode only (the ladder above
  // gates it). Mounted 2026-08-22 together with its TAB_META row and panel
  // branch in DevEditor.tsx: TAB_META is an exhaustive Record<InspectorTab,…>,
  // so this list entry and that row are ONE compile unit — tsc holds them
  // together. (The note that used to live here:
  // BookOpenText }` and the inspector mounts `<LibrarianPanel/>`, insert
  // "librarian" here and the rail offers it. Until then `inspectorTabsFor`
  // filters it out, so nothing renders a tab that has no panel.
  "librarian",
  "versions",
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number];

/**
 * Tabs that edit an Aqua-hosted PORTAL DOCUMENT and cannot exist without one.
 *
 * "code" here is the portal's own custom CSS/JS layer, not the repository —
 * that is the Repo tab. "pages" are the portal's own pages; "versions" is its
 * release history; "brand" is its theme. Every one of these reads and writes
 * `ClientPortalDesignDocument`, so on a repository there is literally nothing
 * for them to point at.
 *
 * ─── What was WRONGLY in this set ────────────────────────────────────────
 *
 * `builder` was, and that is the bug Ed hit as "the visual editor components
 * are lost … i cant select and build anything". The Builder tab asks WHICH
 * VOCABULARY this target speaks, and every target has one — a portal speaks
 * the portal's 16 names, a site or a repository speaks the website's 70
 * elements (`elements/palette.ts`). Gating a vocabulary question on
 * "is there a portal document?" meant the Builder never rendered for a
 * project of kind "software", which is every project Ed creates.
 *
 * `content` was too, and it half belongs: on a portal it is the block and page
 * content editor, which genuinely needs the document. Its non-portal case is
 * handled explicitly below rather than by removing it from this set.
 *
 * THREE different questions, kept apart on purpose:
 *   • which vocabulary?          → every target has one   (builder)
 *   • is there a portal document? → this set              (pages/brand/…)
 *   • can a live page be clicked? → the Aqua Tag alone    (element)
 */
const PORTAL_DOCUMENT_TABS = new Set<InspectorTab>([
  "content",
  "pages",
  "brand",
  "versions",
  "code",
]);

/**
 * Which tabs are actually offered, given the depth AND what is connected.
 *
 * The depth answers "how much do I want to be shown?"; the target answers
 * "what is there to show?". Both gate, and the second one is where a real bug
 * lived: the Element tab was gated on `browserAvailable`, which is
 * `portalTarget || tagMapped` — true on every portal. So opening the portal
 * builder at `/portal/agency/portals/editor` added an Element tab that no click
 * could ever fill (the Aqua-hosted preview at `/client-preview` does not carry
 * `/aqua-tag.js`; it reports through the first-party block protocol instead),
 * and the extra column narrowed every tab in the mobile strip, which sizes
 * itself `repeat(N, 1fr)`.
 *
 * `tagMapped` is the right gate because the Element panel is filled by the TAG
 * and by nothing else — Ed's rule, unchanged: the tag connected is what makes a
 * click resolve to an exact element.
 */
export function inspectorTabsFor(
  mode: EditingMode,
  target: { portalTarget: boolean; tagMapped: boolean },
): InspectorTab[] {
  const offered = editingMode(mode).tabs;
  return INSPECTOR_TABS.filter(tab => {
    // Settings is always reachable: it is how you point the editor somewhere
    // else, which you must be able to do from wherever you are.
    if (tab === "settings") return true;
    if (!offered.includes(tab)) return false;
    if (tab === "element") return target.tagMapped;
    // The vocabulary question. Offered wherever the depth offers it, on every
    // target, because every target has a palette.
    if (tab === "builder") return true;
    // Off a portal, "content" means the WORDS on the tagged page — which is
    // the Element panel, filled by the tag and by nothing else. So it is
    // offered only where the tag answers AND this depth does not already
    // offer Element. Since "Just the words" merged into Visual (2026-08-22)
    // exactly one depth qualifies: "assist", whose modes row deliberately
    // carries content so an assistant's answer can be applied by hand without
    // switching mode. Every deeper mode offers Element itself, so content
    // there would be the same panel twice.
    if (tab === "content" && !target.portalTarget) {
      return target.tagMapped && !offered.includes("element");
    }
    return target.portalTarget || !PORTAL_DOCUMENT_TABS.has(tab);
  });
}

export function editingMode(id: string | null | undefined): EditingModeDefinition {
  // ── MIGRATION: "simple" ("Just the words") merged into Visual, 2026-08-22 ──
  // Ed: "id want to actually just combine it into visual mode as its the same
  // you select element change type it add it in". The rung is gone; the words
  // live at the visual depth. A saved "simple" — an old URL, a stored
  // preference, anywhere a mode was ever written down — must land on "visual"
  // BY NAME, not by falling through the unknown-id default below. The default
  // happens to be "visual" today; a migration that only works because two
  // rules coincide stops working the day the default moves.
  if (id === "simple") id = "visual";
  // Defaults to the visual mode rather than the deepest one: a first-time
  // opener should meet a designer's tool, not a developer's. Named explicitly
  // rather than indexed, so adding a mode to the list cannot silently move it.
  return EDITING_MODES.find(mode => mode.id === id)
    ?? EDITING_MODES.find(mode => mode.id === "visual")!;
}

/** Whether a tab is offered in this mode. */
export function modeAllowsTab(mode: EditingMode, tab: string): boolean {
  return editingMode(mode).tabs.includes(tab);
}

/**
 * Keeps the current tab valid when the mode changes.
 *
 * Switching from Developer to a shallower depth while sitting on the code tab
 * must land somewhere real rather than on a blank panel — and the first tab of
 * the new mode is the one that mode considers most useful.
 */
export function tabForMode(mode: EditingMode, currentTab: string): string {
  const definition = editingMode(mode);
  return definition.tabs.includes(currentTab) ? currentTab : definition.tabs[0];
}
