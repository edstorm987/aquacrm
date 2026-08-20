# `src/app/portal/dev-team/logs/_changesLabel.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** The "N changes · 2h" pill on Logs — pure, so the honesty of the number is testable without rendering the page.  HISTORY, because this label has been wrong in BOTH directions:  1. `scanWorkerSignals` used to truncate `recentFiles` to 200 after sorting newest-first, and this pill printed that truncated length as a total. A symbol-reference regen writes ~1,800 files in a minute, fills the cap by itself, and pushes every real edit out of the window — so Ed read "200 changes" for a window in which 1,908 files moved. 2. That was fixed at the source: `recentFiles` is now the COMPLETE list for the window, uncapped, and groupings are taken from all of it. But the pill kept its "200+" suffix and its "showing the newest 200" tooltip, which then labelled an EXACT number as a lower bound — wrong the other way.  So the pill now simply states the count, because the count is now the truth. If a cap is ever reintroduced upstream, bring back a lower-bound form with it; do not reintroduce one here on its own, or the label starts lying again. Label for the changes pill. `count` is the number of files that changed in the window — the whole truth, since `scanWorkerSignals` no longer truncates.

## Exports (2)

- `changesPillLabel(count: number, windowLabel = "2h"): string`
- `changesPillTitle(_count: number): string`

## Used by (2)

- [`scripts/smoke-dev-console-views.test.ts`](../../../../../scripts/smoke-dev-console-views.test.md)
- [`src/app/portal/dev-team/logs/_Section.tsx`](./_Section.md)

