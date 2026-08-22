# `scripts/smoke-engines-editor.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The Dev Editor Engine now lives under src/engines/editor/ (structural consolidation, docs/development/STRUCTURE.md). This pins the new home so a regression that moves it back to src/lib/ — or breaks the @/engines alias — fails loudly. Purely a location contract: it imports a moved module by its NEW path and asserts an expected export.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

