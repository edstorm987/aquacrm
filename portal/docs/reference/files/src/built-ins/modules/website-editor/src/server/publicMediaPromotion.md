# `src/built-ins/modules/website-editor/src/server/publicMediaPromotion.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Public media promotion — the publish-time walker.  On publish (see `publishPage`), approved website media that the editor stored inline as `data:` URIs is pushed to the public CDN bucket and the block tree is rewritten to reference the durable public URL instead. This is the "auto-public on publish" gate: draft blocks keep their inline data URLs (nothing public by default); only the published copy is promoted.  Pure + injectable: the caller supplies a `promote(dataUrl) => publicUrl` function (backed by the `publicMedia` foundation port). Identical data URLs promote once (dedup), and a promotion failure is fail-open — the original data URL is kept so a storage hiccup never blocks a publish.

## Exports (3)

- `type MediaPromoter`
- `interface PromotionResult (2 members)`
- `async promoteBlockTreeMedia(blocks: Block[], promote: MediaPromoter): Promise<PromotionResult>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`scripts/smoke-public-media-promotion.test.ts`](../../../../../../scripts/smoke-public-media-promotion.test.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](./pages.md)

