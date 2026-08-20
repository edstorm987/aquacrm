# `src/lib/server/siteEditor/patch.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface SourcePatch (4 members)`
- `type PatchRejection`
- `interface PatchedFile (5 members)`
- `type PatchResult`
- `applyPatch(input: { registry: SiteRegistry; headSha: string; patch: SourcePatch; contents: string; }): PatchResult`
- `interface PatchPlan (2 members)`
- `planPatches(input: { registry: SiteRegistry; headSha: string; patches: SourcePatch[]; read: (file: string) => string | null; }): PatchPlan`

## Depends on (1)

- [`src/lib/server/siteEditor/registry.ts`](./registry.md)

## Used by (1)

- [`src/lib/server/siteEditor/publish.ts`](./publish.md)

