# `src/engines/editor/server/sourceEdit.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (10)

- `SOURCE_SCAN_FILE_CAP`
- `interface SourceEditDeps (7 members)`
- `class SourceEditUnavailable`
    - `constructor(code: "no-repository" | "no-token", message: string)`
- `sourceEditTarget(agencyId: string, project: DevProject, deps: SourceEditDeps = {}): GitHubRepoSource`
- `interface FindWordsResult (9 members)`
- `async findWordsInProject(input: { agencyId: string; project: DevProject; text: string; }, deps: SourceEditDeps = {}): Promise<FindWordsResult>`
- `editBranchName(project: DevProject): string`
- `interface PublishWordsInput (12 members)`
- `interface PublishWordsResult (6 members)`
- `async publishWordsEdit(input: PublishWordsInput, deps: SourceEditDeps = {}): Promise<PublishWordsResult>`

## Depends on (8)

- [`src/engines/editor/server/devProjects.ts`](./devProjects.md)
- [`src/engines/editor/server/githubSource.ts`](./githubSource.md)
- [`src/engines/editor/server/patch.ts`](./patch.md)
- [`src/engines/editor/server/publish.ts`](./publish.md)
- [`src/engines/editor/server/registry.ts`](./registry.md)
- [`src/engines/editor/server/sourceMatch.ts`](./sourceMatch.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../../../lib/server/integrations/integrationConnections.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (10)

- [`scripts/smoke-editor-words-publish.test.ts`](../../../../scripts/smoke-editor-words-publish.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/portal/dev/lifecycle/route.ts`](../../../app/api/portal/dev/lifecycle/route.md)
- [`src/app/api/portal/dev/repo-write/route.ts`](../../../app/api/portal/dev/repo-write/route.md)
- [`src/app/api/portal/dev/source-edit/route.ts`](../../../app/api/portal/dev/source-edit/route.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/engines/editor/server/repoWrite.ts`](./repoWrite.md)
- [`src/engines/editor/server/workLifecycle.ts`](./workLifecycle.md)

