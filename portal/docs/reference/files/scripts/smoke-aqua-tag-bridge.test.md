# `scripts/smoke-aqua-tag-bridge.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The drift guard between the Aqua Tag and the editor. `src/lib/integrations/aquaTagSource.ts` is a template string of browser JavaScript served at `/aqua-tag.js`. It has no module system, so it cannot import the protocol module the way every TypeScript consumer does — which is exactly how the two halves ended up disagreeing without anybody noticing: the tag posts `aqua-explorer:selected`, and the Dev editor was listening for `aqua:portal-block-select`. These tests are the substitute for an import. They read the tag's own source and assert that its message names, its protocol version, the fields it builds and the styles it will accept all match the declarations in `aquaTagBridge.ts`. Change one side and this fails until you change the other. If a test here fails, the fix is to make the two agree — never to relax the assertion.

_No exported symbols (side-effect / internal module)._

## Depends on (2)

- [`src/engines/editor/editing/aquaTagBridge.ts`](../src/engines/editor/editing/aquaTagBridge.md)
- [`src/lib/integrations/aquaTagSource.ts`](../src/lib/integrations/aquaTagSource.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

