# `src/built-ins/modules/website-editor/src/lib/draftPublished.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R035 — Draft / published state helpers.  Existing EditorPage already carries the four fields we need: - blocks             : current persisted tree - draftBlocks?       : edits that haven't been published - publishedBlocks?   : last published snapshot (Round-2 addition) - publishedAt?       : timestamp of last publish - status             : "draft" | "published"  R035 ships pure helpers + a status chip + a storefront resolver so all callers (editor / storefront / sitemap) read the same way.  Conventions established here: getDraftTree(p)      = p.draftBlocks ?? p.blocks getPublishedTree(p)  = p.publishedBlocks ?? (status === "published" ? p.blocks : null)  "blocks" is the live operator-facing tree; if no separate draftBlocks/publishedBlocks rows exist yet (older rows from pre-R035 edits), `blocks` is treated as both — the chip then renders "Published" or "Draft" based purely on `status`.

## Exports (12)

- `getDraftTree(page: EditorPage): Block[]`
- `getPublishedTree(page: EditorPage): Block[] | null`
- `hasDraftAhead(page: EditorPage): boolean`
- `type PageStatus`
- `pageStatus(page: EditorPage): PageStatus`
- `interface SaveToDraftPatch (2 members)`
- `saveToDraftPatch(blocks: Block[], now: number = Date.now()): SaveToDraftPatch`
- `interface PromoteToPublishedPatch (7 members)`
- `promoteToPublishedPatch(page: EditorPage, by: string, now: number = Date.now()): PromoteToPublishedPatch`
- `type StorefrontSource`
- `interface ResolvedStorefrontTree (3 members)`
- `resolveStorefrontTree(page: EditorPage, opts: { preview?: boolean } = {}): ResolvedStorefrontTree`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r035-draft-published.test.ts`](../__smoke__/r035-draft-published.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/PageStatusChip.tsx`](../components/editor/PageStatusChip.md)

