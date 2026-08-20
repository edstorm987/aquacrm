# `src/lib/server/devDocs.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (14)

- `PROJECT_ROOT`
- `interface DevDocEntry (4 members)`
- `interface DevDocTreeNode (7 members)`
- `interface DevDocsIndex (4 members)`
- `devDocsAccessible(session: SessionPayload | null | undefined): boolean`
- `assertDevDocsAccess(session: SessionPayload | null | undefined): void`
- `buildDocTree(entries: DevDocEntry[]): DevDocTreeNode[]`
- `async scanDevDocs(): Promise<DevDocsIndex>`
- `async listDevDocs(session: SessionPayload | null | undefined): Promise<DevDocsIndex>`
- `interface DevDocContent (5 members)`
- `async readDevDoc(session: SessionPayload | null | undefined, relPath: string): Promise<DevDocContent>`
- `interface DevDocBlocker (3 members)`
- `parseBlockers(markdown: string): DevDocBlocker[]`
- `async scanBlockers(): Promise<DevDocBlocker[]>`

## Depends on (3)

- [`src/lib/server/devModeAccess.ts`](./devModeAccess.md)
- [`src/lib/server/effectiveRole.ts`](./effectiveRole.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (47)

- [`scripts/smoke-dev-console-topbar.test.ts`](../../../scripts/smoke-dev-console-topbar.test.md)
- [`scripts/smoke-dev-docs.test.ts`](../../../scripts/smoke-dev-docs.test.md)
- [`src/app/api/portal/dev-team/console/route.ts`](../../app/api/portal/dev-team/console/route.md)
- [`src/app/api/portal/dev-team/docs/route.ts`](../../app/api/portal/dev-team/docs/route.md)
- [`src/app/api/portal/dev-team/editor/route.ts`](../../app/api/portal/dev-team/editor/route.md)
- [`src/app/api/portal/dev-team/findings/image/route.ts`](../../app/api/portal/dev-team/findings/image/route.md)
- [`src/app/api/portal/dev-team/findings/route.ts`](../../app/api/portal/dev-team/findings/route.md)
- [`src/app/api/portal/dev-team/plans/route.ts`](../../app/api/portal/dev-team/plans/route.md)
- [`src/app/api/portal/dev-team/thoughts/route.ts`](../../app/api/portal/dev-team/thoughts/route.md)
- [`src/app/api/portal/dev-team/updates/route.ts`](../../app/api/portal/dev-team/updates/route.md)
- [`src/app/api/portal/dev-team/workers/route.ts`](../../app/api/portal/dev-team/workers/route.md)
- [`src/app/portal/agency/dev-docs/_DevDocViewer.tsx`](../../app/portal/agency/dev-docs/_DevDocViewer.md)
- [`src/app/portal/agency/dev-docs/_DevDocsIndex.tsx`](../../app/portal/agency/dev-docs/_DevDocsIndex.md)
- [`src/app/portal/agency/dev-docs/_DocTree.tsx`](../../app/portal/agency/dev-docs/_DocTree.md)
- [`src/app/portal/agency/dev-docs/page.tsx`](../../app/portal/agency/dev-docs/page.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/agency/page.tsx`](../../app/portal/agency/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/app/portal/dev-team/api/page.tsx`](../../app/portal/dev-team/api/page.md)
- [`src/app/portal/dev-team/auditor/page.tsx`](../../app/portal/dev-team/auditor/page.md)
- [`src/app/portal/dev-team/docs/page.tsx`](../../app/portal/dev-team/docs/page.md)
- [`src/app/portal/dev-team/editor/page.tsx`](../../app/portal/dev-team/editor/page.md)
- [`src/app/portal/dev-team/findings/page.tsx`](../../app/portal/dev-team/findings/page.md)
- [`src/app/portal/dev-team/inspector/page.tsx`](../../app/portal/dev-team/inspector/page.md)
- [`src/app/portal/dev-team/layout.tsx`](../../app/portal/dev-team/layout.md)
- [`src/app/portal/dev-team/library/_LibraryDocViewer.tsx`](../../app/portal/dev-team/library/_LibraryDocViewer.md)
- [`src/app/portal/dev-team/library/_LibraryIndex.tsx`](../../app/portal/dev-team/library/_LibraryIndex.md)
- [`src/app/portal/dev-team/library/_LibraryTree.tsx`](../../app/portal/dev-team/library/_LibraryTree.md)
- [`src/app/portal/dev-team/library/page.tsx`](../../app/portal/dev-team/library/page.md)
- [`src/app/portal/dev-team/logs/page.tsx`](../../app/portal/dev-team/logs/page.md)
- [`src/app/portal/dev-team/notes/page.tsx`](../../app/portal/dev-team/notes/page.md)
- [`src/app/portal/dev-team/page.tsx`](../../app/portal/dev-team/page.md)
- [`src/app/portal/dev-team/plans/new/page.tsx`](../../app/portal/dev-team/plans/new/page.md)
- [`src/app/portal/dev-team/tasks/page.tsx`](../../app/portal/dev-team/tasks/page.md)
- [`src/app/portal/dev-team/updates/page.tsx`](../../app/portal/dev-team/updates/page.md)
- [`src/app/portal/dev-team/working/page.tsx`](../../app/portal/dev-team/working/page.md)
- [`src/lib/server/devConsoleStatus.ts`](./devConsoleStatus.md)
- [`src/lib/server/devDocEdits.ts`](./devDocEdits.md)
- [`src/lib/server/devTeamAuditor.ts`](./devTeamAuditor.md)
- [`src/lib/server/devTeamBoard.ts`](./devTeamBoard.md)
- [`src/lib/server/devTeamFindings.ts`](./devTeamFindings.md)
- [`src/lib/server/devTeamPlans.ts`](./devTeamPlans.md)
- [`src/lib/server/devTeamTasks.ts`](./devTeamTasks.md)
- [`src/lib/server/devTeamThoughts.ts`](./devTeamThoughts.md)
- [`src/lib/server/devTeamUpdates.ts`](./devTeamUpdates.md)
- [`src/lib/server/devTeamWorkers.ts`](./devTeamWorkers.md)

