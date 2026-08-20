# `src/app/portal/dev-team/working/_liveWorkerView.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Pure view helpers for the "Live right now" panel.  They live outside `_LiveWorkers.tsx` for one reason: a "use client" component cannot be imported by the smoke suite, so anything that decides what the founder READS — how long ago something happened, which workers are still live — would otherwise be untestable. These are plain functions over plain data; the component only renders what they return. One check-in as the workers API sends it (server decides `active`).

## Exports (3)

- `interface PanelCheckIn (6 members)`
- `ago(ms: number, now: number): string`
- `splitCheckIns<T extends PanelCheckIn>(checkIns: T[], now: number, windowMs: number): { active: T[]; older: T[] }`

## Used by (1)

- [`src/app/portal/dev-team/working/_LiveWorkers.tsx`](./_LiveWorkers.md)

