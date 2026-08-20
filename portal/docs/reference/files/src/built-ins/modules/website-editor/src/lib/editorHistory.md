# `src/built-ins/modules/website-editor/src/lib/editorHistory.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R021 — Editor undo/redo history.  Ring-buffer state machine. `createHistory(initial)` returns a `HistoryState` snapshot; `pushSnapshot`, `undo`, `redo`, `jumpTo` are pure functions returning a new state. The host page wraps these in a React `useState`/`useReducer` (or a `useEditorHistory` hook — see below).  Pure module — no React imports at module scope so the smoke can exercise the state machine without rendering.

## Exports (13)

- `interface Snapshot (3 members)`
- `interface HistoryState (4 members)`
- `DEFAULT_CAPACITY`
- `createHistory(pageId: string, initial: Block[], action = "open page", capacity: number = DEFAULT_CAPACITY, ts = Date.now()): HistoryState`
- `pushSnapshot(state: HistoryState, tree: Block[], action: string, ts = Date.now()): HistoryState`
- `undo(state: HistoryState): HistoryState`
- `redo(state: HistoryState): HistoryState`
- `jumpTo(state: HistoryState, index: number): HistoryState`
- `currentSnapshot(state: HistoryState): Snapshot | null`
- `canUndo(state: HistoryState): boolean`
- `canRedo(state: HistoryState): boolean`
- `undoActionLabel(state: HistoryState): string | null`
- `redoActionLabel(state: HistoryState): string | null`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/r021-undo-redo.test.ts`](../__smoke__/r021-undo-redo.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/HistoryToolbar.tsx`](../components/editor/HistoryToolbar.md)
- [`src/built-ins/modules/website-editor/src/lib/useEditorHistory.ts`](./useEditorHistory.md)

