# `src/engines/editor/server/publish.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (7)

- `interface PublishTarget (3 members)`
- `interface PublishRequest (7 members)`
- `interface PublishOutcome (6 members)`
- `interface PullRequestRef (5 members)`
- `async openPullRequest(input: { repository: string; branch: string; base: string; title: string; body?: string; token: string; fetchImpl?: typeof fetch; }): Promise<PullRequestRef>`
- `async mergePullRequest(input: { repository: string; number: number; method?: "merge" | "squash" | "rebase"; confirm?: boolean; token: string; fetchImpl?: typeof fetch; }): Promise<{ merged: boolean; message: string }>`
- `async publishEdits(request: PublishRequest): Promise<PublishOutcome>`

## Depends on (1)

- [`src/engines/editor/server/patch.ts`](./patch.md)

## Used by (6)

- [`scripts/smoke-editor-words-publish.test.ts`](../../../../scripts/smoke-editor-words-publish.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../../../scripts/smoke-work-lifecycle.test.md)
- [`src/engines/editor/server/repoWrite.ts`](./repoWrite.md)
- [`src/engines/editor/server/sourceEdit.ts`](./sourceEdit.md)

