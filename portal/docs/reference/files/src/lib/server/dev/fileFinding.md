# `src/lib/server/dev/fileFinding.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (16)

- `type FileFindingSource`
- `type FileFindingReasonKind`
- `interface FileFindingReason (3 members)`
- `interface FileFindingHit (6 members)`
- `type FileFindingRepoStatus`
- `interface FileFindingResult (8 members)`
- `interface FindFilesInput (4 members)`
- `interface FileFindingDeps (6 members)`
- `queryTerms(query: string): string[]`
- `parseReferencePage(markdown: string): ReferenceEntry[]`
- `async findFiles(input: FindFilesInput, deps: FileFindingDeps = {}): Promise<FileFindingResult>`
- `type FileFindingWorldRepo`
- `interface FileFindingWorldProject (3 members)`
- `interface FileFindingWorld (3 members)`
- `async fileFindingWorld(agencyId: string, deps: FileFindingDeps = {}): Promise<FileFindingWorld>`
- `fileFindingBrief(result: FileFindingResult): string`

## Depends on (7)

- [`src/engines/editor/server/devProjects.ts`](../../../engines/editor/server/devProjects.md)
- [`src/engines/editor/server/githubSource.ts`](../../../engines/editor/server/githubSource.md)
- [`src/engines/editor/server/workspaceFiles.ts`](../../../engines/editor/server/workspaceFiles.md)
- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/dev/devMarkdownCache.ts`](./devMarkdownCache.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../integrations/integrationConnections.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (4)

- [`scripts/smoke-file-finding-skill.test.ts`](../../../../scripts/smoke-file-finding-skill.test.md)
- [`scripts/smoke-librarian.test.ts`](../../../../scripts/smoke-librarian.test.md)
- [`src/app/api/portal/dev/librarian/route.ts`](../../../app/api/portal/dev/librarian/route.md)
- [`src/components/chrome/LibrarianDrawerControl.tsx`](../../../components/chrome/LibrarianDrawerControl.md)

