# `scripts/smoke-editor-element-palette.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** ─── PHASE 2 — mounting the block library in the Dev Editor ─────────────────  Ed: "the visual editor components are lost … i cant select and build anything what the hell is going on."  Nothing was lost. THREE separate things kept the vocabulary out of the editor, and this file pins each one so none of them can come back:  1. REGISTRATION IS AN IMPORT SIDE EFFECT. `blockRegistry.ts` calls `registerElementDefinitions` at module scope, and nothing in the editor's bundle imported it — so `listElementDefinitions("website")` answered [] there, correctly, forever. 2. THE PALETTE WAS A HARDCODED PORTAL LIST. `DevEditor` read `CLIENT_PORTAL_BLOCK_REGISTRY` and only that, so the add menu on a non-portal project had literally nothing in it. 3. THE BUILDER TAB WAS GATED ON `portalTarget`, which is false for every project Ed creates — so the tab did not even render.  The IMPORTANT ordering detail in this file: the very first thing it does is count the website definitions, BEFORE anything has awaited the loader. That number must be 0. If a future import at the top of this file pulls the plugin in transitively, that assertion fails and tells you the split was lost — which is the whole point of `websiteVocabulary.ts`.

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)
- [`src/engines/editor/elements/palette.ts`](../src/engines/editor/elements/palette.md)
- [`src/engines/editor/elements/registry.ts`](../src/engines/editor/elements/registry.md)
- [`src/engines/editor/elements/websiteElements.ts`](../src/engines/editor/elements/websiteElements.md)
- [`src/lib/portal/clientPortalBuilder.ts`](../src/lib/portal/clientPortalBuilder.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

