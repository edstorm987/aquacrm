# `src/built-ins/modules/website-editor/src/__smoke__/r020-code-mode.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R020 Code mode JSON tree editor.  Asserts: - parseBlockTreeJson accepts valid trees + flags errors with line/col - validateBlockTree catches missing id/type/children-shape - formatBlockTreeJson round-trips through parse - compareTrees identifies identical / count-diff / first-difference - CodeModePanel renders dual panels + JSON header + buttons - CodeModePanel surfaces last-good preview marker on invalid edit

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/components/editor/CodeModePanel.tsx`](../components/editor/CodeModePanel.md)
- [`src/built-ins/modules/website-editor/src/lib/blockTreeJson.ts`](../lib/blockTreeJson.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

