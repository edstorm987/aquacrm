# `src/app/portal/agency/_DevTeamStation.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Console station — the Command Centre's fourth entry point.  Deliberately NOT a mount of `/portal/dev-team/page.tsx`: that route carries its own founder gate, its own light portal chrome, and its own header — both would double up inside the command shell. This is a dark HUD reading the SAME live sources the workspace does, in the Command Centre's visual language (deep `#020b11` ground, `#62e8ff` instrument frame, grid overlay) so it sits beside Radar rather than looking bolted on.  It shows QUEUES, not just counts. A number tells you something is wrong; a queue tells you what, and every row here clicks through to the surface that can do something about it. Everything is sourced from what already exists — `scanDevTeamBoard`/`composeLanes` (state.md workers table + each plan's own status line + `scanBlockers`) and `listFindings`. If a number can't be sourced honestly it isn't shown.  Cost note: it stays off the expensive reader on purpose. `scanWorkerSignals` walks src/ + scripts/ + docs/, and this station renders on EVERY dashboard load (it is streamed, but still built) whether or not the founder opens it. `readCheckIns()` is the cheap half of that module — a handful of small JSON files — and it is the SAME source the topbar console reads, so the two surfaces can never quote different worker counts at each other.  Gating lives in `page.tsx` (`devDocsAccessible(session)`): this component is only ever constructed for a founder in Dev Mode, so it does no gating itself.

## Exports (1)

- `async DevTeamStation()`

## Depends on (4)

- [`src/lib/server/dev/devConsoleStatus.ts`](../../../lib/server/dev/devConsoleStatus.md)
- [`src/lib/server/dev/devTeamBoard.ts`](../../../lib/server/dev/devTeamBoard.md)
- [`src/lib/server/dev/devTeamFindings.ts`](../../../lib/server/dev/devTeamFindings.md)
- [`src/lib/server/dev/devTeamWorkers.ts`](../../../lib/server/dev/devTeamWorkers.md)

## Used by (1)

- [`src/app/portal/agency/page.tsx`](./page.md)

