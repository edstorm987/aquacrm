# `src/built-ins/modules/website-editor/src/__smoke__/r011-brand-kit-css-vars.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R011 Brand-kit CSS variables.  Asserts (1) extendedBrandToCss emits the original 7 vars + 9 extended vars, (2) partial brand-kits still produce a complete dark-friendly palette via fallbacks, (3) the brand- kit/extended HTTP handlers round-trip per-install fields, (4) the looksLikeHardcodedBrandColour heuristic flags the known offenders.

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/handlers/brandKit.ts`](../api/handlers/brandKit.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/brandKitCss.ts`](../lib/brandKitCss.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

