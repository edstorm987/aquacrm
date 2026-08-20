# `src/built-ins/modules/website-editor/src/server/extensionPorts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Round-6 optional ports the editor accepts via container builder.  Both ports are **optional**: when undefined, the editor's save UI gracefully degrades (toggle hidden, saves fall back to shared portal storage). T1's foundation broker resolves them when: - PortalExportPort: T2 R11 `@aqua/plugin-portal-export` is installed for the agency. - GitOpsPort:       T6's deployment work ships a candidate impl.  The shapes here are the contract this plugin commits to. Other plugins implement them; the foundation injects them.

## Exports (14)

- `interface FilePreviewEntry (4 members)`
- `interface SaveResult (4 members)`
- `interface PreviewResult (2 members)`
- `interface PortalExportPort (8 members)`
- `interface GitFileStatus (3 members)`
- `interface GitStatus (5 members)`
- `interface GitCommitResult (3 members)`
- `interface GitPushResult (3 members)`
- `interface GitOpsPort (6 members)`
- `setPortalExportPort(impl: PortalExportPort | null): void`
- `setGitOpsPort(impl: GitOpsPort | null): void`
- `getPortalExportPort(): PortalExportPort | null`
- `getGitOpsPort(): GitOpsPort | null`
- `isClientRepoModeAvailable(): boolean`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/lib/customPages.ts`](../lib/customPages.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)
- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../types/theme.md)

## Used by (5)

- [`src/built-ins/modules/website-editor/src/__smoke__/save-target.test.ts`](../__smoke__/save-target.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/DiffPreviewPane.tsx`](../components/editor/DiffPreviewPane.md)
- [`src/built-ins/modules/website-editor/src/lib/gitOps.ts`](../lib/gitOps.md)
- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](../lib/savePipeline.md)
- [`src/built-ins/modules/website-editor/src/pages/GitStatusPage.tsx`](../pages/GitStatusPage.md)

