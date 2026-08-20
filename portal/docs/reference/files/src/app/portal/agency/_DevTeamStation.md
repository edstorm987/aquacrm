# `src/app/portal/agency/_DevTeamStation.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Team station — the Command Centre's fourth entry point.  Deliberately NOT a mount of `/portal/dev-team/page.tsx`: that route carries its own founder gate, its own light portal chrome, and its own header — both would double up inside the command shell. This is a lean, dark HUD overview reading the SAME live sources (`scanDevTeamBoard` → which itself composes `scanBlockers()` over docs/context/state.md) and then handing off to the full workspace through one prominent CTA.  Gating lives in `page.tsx` (`devDocsAccessible(session)`): this component is only ever constructed for a founder in Dev Mode, so it does no gating itself.

## Exports (1)

- `async DevTeamStation()`

## Depends on (1)

- [`src/lib/server/devTeamBoard.ts`](../../../lib/server/devTeamBoard.md)

## Used by (1)

- [`src/app/portal/agency/page.tsx`](./page.md)

