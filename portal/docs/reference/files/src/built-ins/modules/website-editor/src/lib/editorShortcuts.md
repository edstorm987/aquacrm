# `src/built-ins/modules/website-editor/src/lib/editorShortcuts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R018 — Editor keyboard shortcut registry + dispatch.  `KeyBinding` describes a key combo + scope. `matchKey` resolves a `KeyboardEvent` against a list. The host page binds a single global `keydown` listener that calls `dispatchShortcut`.  Pure module — no DOM imports at module scope; safe to import in SSR / smoke contexts.

## Exports (8)

- `type ShortcutScope`
- `interface KeyBinding (7 members)`
- `DEFAULT_BINDINGS: readonly KeyBinding[]`
- `interface KeyEventLike (5 members)`
- `matchesBinding(e: KeyEventLike, b: KeyBinding): boolean`
- `interface DispatchOptions (2 members)`
- `resolveShortcut(e: KeyEventLike, opts: DispatchOptions): KeyBinding | null`
- `formatBinding(b: KeyBinding): string`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r018-editor-shortcuts.test.ts`](../__smoke__/r018-editor-shortcuts.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/ShortcutsHelpModal.tsx`](../components/editor/ShortcutsHelpModal.md)

