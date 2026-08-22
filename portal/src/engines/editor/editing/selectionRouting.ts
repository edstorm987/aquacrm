/**
 * ONE selection mechanism, THREE destinations.
 *
 * Ed, many times over:
 *
 *   "the way it works is just the words i get a browser and the right menu when
 *    i click on an item aqua tag knows the exact item since its mapped
 *    everything then i get the exact text i can change it on the right menu for
 *    just the words. for the ai i just need broswer aqua tagged so the element
 *    section works and then you just differ it to the ai simples browser + ai
 *    combo now for dev its all of them + the vs way"
 *
 * The click is the same click at every depth. The Aqua Tag has mapped the page,
 * so one click resolves to one exact element and reports it. What the MODE
 * decides is only where that element is SENT — and the depths are cumulative,
 * not three separate editors.
 *
 * ── "Just the words" is a rung no more — merged into Visual, 2026-08-22 ─────
 * The quote above names a text-only depth whose whole offer was the exact
 * words, editable. Ed's later call: "id want to actually just combine it into
 * visual mode as its the same you select element change type it add it in" —
 * and he is right: it was the same selection landing on the same element
 * panel, minus the styling. So nothing behavioural was lost. Off a portal the
 * visual depth routes to the element panel with the words editable, styling
 * beside them. What was deleted is the rung, not the words.
 *
 * This lives in its own module, with no React and no DOM, because the routing
 * rule is the part most worth pinning: it is the answer to "why did clicking
 * the page do nothing / take me to the wrong panel", which is the bug this
 * whole piece of work exists to fix. A rule buried inside a 2,000-line
 * component cannot be tested; this one can be, and is.
 */

import type { EditingMode } from "./modes";

/**
 * Inspector tabs a selection can be routed to.
 *
 * A subset of the editor's tabs on purpose — these are the only three that can
 * meaningfully receive "the operator just pointed at this element".
 */
export type SelectionDestination = "element" | "assistant" | "builder";

export interface SelectionRoute {
  /** The inspector tab the selection opens. */
  tab: SelectionDestination;
  /**
   * Whether the exact text is offered as an editable field.
   *
   * False in "Just tell it": there the words are described TO the assistant,
   * and putting an editable copy beside it invites changing the same sentence
   * in two places at once.
   */
  editWords: boolean;
  /** Whether the depth also offers the element's styles. */
  editStyles: boolean;
  /**
   * Whether this depth wants the code surface as well ("all of them + the vs
   * way"). Developer only.
   */
  revealSource: boolean;
  /** Where the click went, in one sentence, for the editor's status line. */
  reason: string;
}

/**
 * Where a selection goes at this depth.
 *
 * `portalTarget` is the ONE thing that bends the answer, and only for the
 * visual depth: the visual builder edits an Aqua-hosted portal document made of
 * blocks. A tagged page that is not an Aqua portal — a client's website, Ed's
 * game — has no such document, so sending its selection to the Builder would
 * open a panel with nothing in it. It goes to the element panel instead, which
 * at that depth carries the styles as well as the words.
 *
 * Note what this deliberately does NOT do: switch to the builder unconditionally.
 * The old listener did (`setTab("builder")` for every message it accepted), and
 * that is a large part of why the words never appeared — even on the one path
 * that worked, the operator was moved to a panel they had not asked for.
 */
export function routeTagSelection(
  mode: EditingMode,
  options: { portalTarget: boolean },
): SelectionRoute {
  if (mode === "assist") {
    return {
      tab: "assistant",
      editWords: false,
      editStyles: false,
      revealSource: false,
      reason: "Sent to Aqua Editor AI — describe the change you want.",
    };
  }

  if (mode === "visual") {
    return options.portalTarget
      ? {
        tab: "builder",
        editWords: true,
        editStyles: true,
        revealSource: false,
        reason: "Sent to the builder.",
      }
      : {
        // The old "Just the words" depth, absorbed: the same element panel,
        // the same editable words — with the styling now beside them.
        tab: "element",
        editWords: true,
        editStyles: true,
        reason: "The words and the styling of what you clicked.",
        revealSource: false,
      };
  }

  // developer — cumulative: everything above, plus the code.
  return {
    tab: "element",
    editWords: true,
    editStyles: true,
    revealSource: true,
    reason: "The element, its styling, and where it came from.",
  };
}

/**
 * Whether a depth uses the tagged browser to select at all.
 *
 * Every one of them does — that is the point of "one mechanism". Kept as a
 * named function rather than a `true` scattered through the component so the
 * claim is somewhere a test can hold it, and so a future depth that genuinely
 * does not select has an obvious place to say so.
 */
export function modeSelectsThroughTag(mode: EditingMode): boolean {
  return mode === "assist" || mode === "visual" || mode === "developer";
}
