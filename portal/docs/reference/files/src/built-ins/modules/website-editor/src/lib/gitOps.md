# `src/built-ins/modules/website-editor/src/lib/gitOps.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (7)

- `interface ClientStatus (4 members)`
- `async fetchClientStatus(clientId: string): Promise<ClientStatus>`
- `async stageFiles(clientId: string, files: string[]): Promise<{ ok: boolean; error?: string }>`
- `async unstageFiles(clientId: string, files: string[]): Promise<{ ok: boolean; error?: string }>`
- `async commitFiles(clientId: string, message: string, author?: string): Promise<GitCommitResult & { available: boolean }>`
- `async pushBranch(clientId: string, branch?: string): Promise<GitPushResult & { available: boolean }>`
- `async openPullRequest(clientId: string, title: string, body?: string): Promise<{ ok: boolean; url?: string; error?: string; available: boolean }>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/pages/GitStatusPage.tsx`](../pages/GitStatusPage.md)

