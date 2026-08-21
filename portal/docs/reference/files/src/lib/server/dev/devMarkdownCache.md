# `src/lib/server/dev/devMarkdownCache.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `async memoiseByStat<T>(namespace: string, absPath: string, compute: (info: { mtimeMs: number; size: number }) => Promise<T>): Promise<T | null>`
- `async readParsedFile<T>(namespace: string, absPath: string, parse: (text: string) => T): Promise<T | null>`
- `invalidateFile(namespace: string, absPath: string): void`
- `invalidatePath(absPath: string): void`
- `invalidateNamespace(namespace: string): void`
- `__cacheStats(): { hits: number; misses: number; size: number }`
- `__resetCache(): void`

## Used by (10)

- [`scripts/smoke-dev-team-perf.test.ts`](../../../../scripts/smoke-dev-team-perf.test.md)
- [`src/lib/server/dev/devDocEdits.ts`](./devDocEdits.md)
- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/dev/devTeamAuditor.ts`](./devTeamAuditor.md)
- [`src/lib/server/dev/devTeamBoard.ts`](./devTeamBoard.md)
- [`src/lib/server/dev/devTeamFindings.ts`](./devTeamFindings.md)
- [`src/lib/server/dev/devTeamPlans.ts`](./devTeamPlans.md)
- [`src/lib/server/dev/devTeamRoadmap.ts`](./devTeamRoadmap.md)
- [`src/lib/server/dev/devTeamTasks.ts`](./devTeamTasks.md)
- [`src/lib/server/dev/devTeamUpdates.ts`](./devTeamUpdates.md)

