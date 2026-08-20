# `src/built-ins/modules/website-editor/src/__smoke__/blocks.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke test — imports the manifest and asserts every promised piece is present.  Why this isn't tsc-only: - tsc catches type mismatches but won't surface a circular import or a runtime require()-fails-but-types-line-up bug. - Walking the registry forces every block module to actually evaluate. - Hitting the manifest counts confirms the api/pages/blocks arrays are populated, not empty.  Run via `npm test`. Exits non-zero on any assertion failure.

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`src/built-ins/modules/website-editor/index.ts`](../../index.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/starterLoader.ts`](../server/starterLoader.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

