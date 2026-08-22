# `src/engines/editor/server/workLifecycle.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (7)

- `type WorkLifecycleDeps`
- `type DraftState`
- `interface DraftStatus (10 members)`
- `async readDraftStatus(input: { agencyId: string; project: DevProject }, deps: WorkLifecycleDeps = {}): Promise<DraftStatus>`
- `type WorkHistoryEntry`
- `interface WorkHistory (2 members)`
- `async readWorkHistory(input: { agencyId: string; project: DevProject }, deps: WorkLifecycleDeps = {}): Promise<WorkHistory>`

## Depends on (4)

- [`src/engines/editor/server/githubSource.ts`](./githubSource.md)
- [`src/engines/editor/server/sourceEdit.ts`](./sourceEdit.md)
- [`src/lib/server/dev/devTeamWorkers.ts`](../../../lib/server/dev/devTeamWorkers.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/dev/lifecycle/route.ts`](../../../app/api/portal/dev/lifecycle/route.md)

