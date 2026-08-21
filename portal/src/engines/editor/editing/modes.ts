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
    summary: "Build it — blocks, pages and brand, on top of the live page.",
    tabs: ["assistant", "builder", "content", "pages", "brand", "versions"],
  },
  {
    id: "developer",
    label: "Dev",
    summary: "The code and the repository. Bring the browser in when you need to see it.",
    tabs: ["assistant", "builder", "content", "pages", "brand", "code", "repository", "versions"],
  },
];

export function editingMode(id: string | null | undefined): EditingModeDefinition {
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
 * Switching from Developer to "Just the words" while sitting on the code tab
 * must land somewhere real rather than on a blank panel — and the first tab of
 * the new mode is the one that mode considers most useful.
 */
export function tabForMode(mode: EditingMode, currentTab: string): string {
  const definition = editingMode(mode);
  return definition.tabs.includes(currentTab) ? currentTab : definition.tabs[0];
}
