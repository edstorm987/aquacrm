# `scripts/smoke-public-media-promotion.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Smoke — Public media promotion on publish (public-bucket Phase 2). Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts  § Auto-public on publish — when a website-editor page is published, inline data: media is pushed to the aquacrm-public bucket and the published blocks are rewritten to the CDN URLs. Draft stays inline (nothing public by default). Fully hermetic: a fake promoter / fake port / in-memory storage — no global process.env / globalThis.fetch mutation (that races the shared- process suite). See docs/development/plans/public-bucket.md (Phase 2).

_No exported symbols (side-effect / internal module)._

## Depends on (7)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../src/built-ins/modules/website-editor/src/server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/publicMediaPromotion.ts`](../src/built-ins/modules/website-editor/src/server/publicMediaPromotion.md)
- [`src/built-ins/modules/website-editor/src/server/staticExport.ts`](../src/built-ins/modules/website-editor/src/server/staticExport.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](../src/built-ins/modules/website-editor/src/server/storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../src/built-ins/modules/website-editor/src/types/block.md)
- [`src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts`](../src/built-ins/runtime/foundation-adapters/publicMediaAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

