# `src/built-ins/modules/website-editor/src/__smoke__/r018-editor-shortcuts.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R018 Editor keyboard shortcuts + Cmd-K command palette.  Asserts: - DEFAULT_BINDINGS surfaces every prompt-required shortcut - matchesBinding handles meta/Ctrl cross-platform, case-insensitive - resolveShortcut respects scope filtering - formatBinding emits ⌘/⇧/⌥ glyphs + arrow/Esc/Del symbols - CommandPalette renders nothing when `open=false` - CommandPalette filters via fuzzy search + ranks groups - ShortcutsHelpModal renders Global + Block-selected sections

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/components/editor/CommandPalette.tsx`](../components/editor/CommandPalette.md)
- [`src/built-ins/modules/website-editor/src/components/editor/ShortcutsHelpModal.tsx`](../components/editor/ShortcutsHelpModal.md)
- [`src/built-ins/modules/website-editor/src/lib/editorShortcuts.ts`](../lib/editorShortcuts.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

