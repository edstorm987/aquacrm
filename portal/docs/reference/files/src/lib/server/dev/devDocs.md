# `src/lib/server/dev/devDocs.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

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

## Depends on (4)

- [`src/lib/server/auth/effectiveRole.ts`](../auth/effectiveRole.md)
- [`src/lib/server/dev/devMarkdownCache.ts`](./devMarkdownCache.md)
- [`src/lib/server/dev/devModeAccess.ts`](./devModeAccess.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (55)

- [`scripts/smoke-dev-console-topbar.test.ts`](../../../../scripts/smoke-dev-console-topbar.test.md)
- [`scripts/smoke-dev-docs.test.ts`](../../../../scripts/smoke-dev-docs.test.md)
- [`src/app/api/portal/dev-team/console/route.ts`](../../../app/api/portal/dev-team/console/route.md)
- [`src/app/api/portal/dev-team/docs/route.ts`](../../../app/api/portal/dev-team/docs/route.md)
- [`src/app/api/portal/dev-team/editor/route.ts`](../../../app/api/portal/dev-team/editor/route.md)
- [`src/app/api/portal/dev-team/findings/image/route.ts`](../../../app/api/portal/dev-team/findings/image/route.md)
- [`src/app/api/portal/dev-team/findings/route.ts`](../../../app/api/portal/dev-team/findings/route.md)
- [`src/app/api/portal/dev-team/plans/route.ts`](../../../app/api/portal/dev-team/plans/route.md)
- [`src/app/api/portal/dev-team/roadmap/route.ts`](../../../app/api/portal/dev-team/roadmap/route.md)
- [`src/app/api/portal/dev-team/thoughts/route.ts`](../../../app/api/portal/dev-team/thoughts/route.md)
- [`src/app/api/portal/dev-team/updates/route.ts`](../../../app/api/portal/dev-team/updates/route.md)
- [`src/app/api/portal/dev-team/workers/route.ts`](../../../app/api/portal/dev-team/workers/route.md)
- [`src/app/api/portal/dev/editor-activity/route.ts`](../../../app/api/portal/dev/editor-activity/route.md)
- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/agency/dev-docs/_DevDocViewer.tsx`](../../../app/portal/agency/dev-docs/_DevDocViewer.md)
- [`src/app/portal/agency/dev-docs/_DevDocsIndex.tsx`](../../../app/portal/agency/dev-docs/_DevDocsIndex.md)
- [`src/app/portal/agency/dev-docs/_DocTree.tsx`](../../../app/portal/agency/dev-docs/_DocTree.md)
- [`src/app/portal/agency/dev-docs/page.tsx`](../../../app/portal/agency/dev-docs/page.md)
- [`src/app/portal/agency/layout.tsx`](../../../app/portal/agency/layout.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../../app/portal/clients/page.md)
- [`src/app/portal/dev-team/api/_Section.tsx`](../../../app/portal/dev-team/api/_Section.md)
- [`src/app/portal/dev-team/auditor/_Section.tsx`](../../../app/portal/dev-team/auditor/_Section.md)
- [`src/app/portal/dev-team/chat/page.tsx`](../../../app/portal/dev-team/chat/page.md)
- [`src/app/portal/dev-team/docs/page.tsx`](../../../app/portal/dev-team/docs/page.md)
- [`src/app/portal/dev-team/editor/_Section.tsx`](../../../app/portal/dev-team/editor/_Section.md)
- [`src/app/portal/dev-team/editor/page.tsx`](../../../app/portal/dev-team/editor/page.md)
- [`src/app/portal/dev-team/editor/studio/page.tsx`](../../../app/portal/dev-team/editor/studio/page.md)
- [`src/app/portal/dev-team/findings/_Section.tsx`](../../../app/portal/dev-team/findings/_Section.md)
- [`src/app/portal/dev-team/inspector/_Section.tsx`](../../../app/portal/dev-team/inspector/_Section.md)
- [`src/app/portal/dev-team/layout.tsx`](../../../app/portal/dev-team/layout.md)
- [`src/app/portal/dev-team/library/_LibraryDocViewer.tsx`](../../../app/portal/dev-team/library/_LibraryDocViewer.md)
- [`src/app/portal/dev-team/library/_LibraryIndex.tsx`](../../../app/portal/dev-team/library/_LibraryIndex.md)
- [`src/app/portal/dev-team/library/_LibraryTree.tsx`](../../../app/portal/dev-team/library/_LibraryTree.md)
- [`src/app/portal/dev-team/library/_Section.tsx`](../../../app/portal/dev-team/library/_Section.md)
- [`src/app/portal/dev-team/logs/_Section.tsx`](../../../app/portal/dev-team/logs/_Section.md)
- [`src/app/portal/dev-team/notes/page.tsx`](../../../app/portal/dev-team/notes/page.md)
- [`src/app/portal/dev-team/page.tsx`](../../../app/portal/dev-team/page.md)
- [`src/app/portal/dev-team/plans/new/page.tsx`](../../../app/portal/dev-team/plans/new/page.md)
- [`src/app/portal/dev-team/roadmap/page.tsx`](../../../app/portal/dev-team/roadmap/page.md)
- [`src/app/portal/dev-team/updates/_Section.tsx`](../../../app/portal/dev-team/updates/_Section.md)
- [`src/app/portal/layout.tsx`](../../../app/portal/layout.md)
- [`src/lib/server/dev/devConsoleStatus.ts`](./devConsoleStatus.md)
- [`src/lib/server/dev/devDocEdits.ts`](./devDocEdits.md)
- [`src/lib/server/dev/devTeamAuditor.ts`](./devTeamAuditor.md)
- [`src/lib/server/dev/devTeamBoard.ts`](./devTeamBoard.md)
- [`src/lib/server/dev/devTeamFindings.ts`](./devTeamFindings.md)
- [`src/lib/server/dev/devTeamPlans.ts`](./devTeamPlans.md)
- [`src/lib/server/dev/devTeamRoadmap.ts`](./devTeamRoadmap.md)
- [`src/lib/server/dev/devTeamTasks.ts`](./devTeamTasks.md)
- [`src/lib/server/dev/devTeamThoughts.ts`](./devTeamThoughts.md)
- [`src/lib/server/dev/devTeamUpdates.ts`](./devTeamUpdates.md)
- [`src/lib/server/dev/devTeamWorkers.ts`](./devTeamWorkers.md)

