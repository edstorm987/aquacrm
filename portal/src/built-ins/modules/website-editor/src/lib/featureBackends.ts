// Which EDITOR FEATURES have no server behind them.
//
// Sibling to `blockBackends.ts`, which answers the same question for palette
// blocks. Kept separate rather than merged because the two are different
// categories with different answers: a block is something a visitor interacts
// with on a published page, a feature is something the operator uses inside the
// editor. Merging them would mean one list whose entries mean two things.
//
// ── Found by the 2026-08-28 production-grade audit ───────────────────────
//
// `lib/funnels.ts` and `lib/splitTests.ts` both fetch from
// `/api/portal/website-editor/{funnels,split-tests}`. **Neither route exists** —
// not under `src/app/api/portal/website-editor/` (which does not exist at all)
// and not among the twenty handlers in `src/api/handlers/`. Both files say so
// in their own headers, as a "Round-2 TODO".
//
// The problem is not the missing backend. It is what the UI does about it:
//
//   • `listFunnels()` returns the empty cache when the fetch 404s, so the
//     editor renders "no funnels" — indistinguishable from a real empty state.
//   • `NewFunnelModal` lets somebody type a name, click Create, and shows
//     **"Failed to create funnel."** — which reads as a transient error. It is
//     not transient. It will fail every time, forever, until the API is built.
//
// Somebody will retry that button, assume the editor is broken, and never be
// told the truth. That is the "mask" this file removes: the same
// label-it-honestly answer `blockBackends.ts` gives, applied to features.
//
// Delete an entry here the moment its route lands — an entry that outlives its
// gap is worse than none, because it tells people a working feature is broken.

export interface FeatureBackendGap {
  /** Stable id, matching the lib module it describes. */
  id: "funnels" | "split-tests";
  label: string;
  /** The endpoint that does not exist. */
  missingRoute: string;
  /** Said to the operator, in the UI. Plain, and specific about what to expect. */
  reason: string;
}

export const FEATURE_BACKEND_GAPS: readonly FeatureBackendGap[] = [
  {
    id: "funnels",
    label: "Funnels",
    missingRoute: "/api/portal/website-editor/funnels",
    reason:
      "Funnels have no server yet, so they cannot be created or saved. The screen is here and the "
      + "editor understands them — what is missing is the API behind it. Nothing you enter would be kept.",
  },
  {
    id: "split-tests",
    label: "Split tests",
    missingRoute: "/api/portal/website-editor/split-tests",
    reason:
      "Split tests have no server yet, so variants cannot be created or measured. Any list you see "
      + "here is empty because the feature is unbuilt, not because you have none.",
  },
];

export function featureBackendGap(id: FeatureBackendGap["id"]): FeatureBackendGap | undefined {
  return FEATURE_BACKEND_GAPS.find(gap => gap.id === id);
}
