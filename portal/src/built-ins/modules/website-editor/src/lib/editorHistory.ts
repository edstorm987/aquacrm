// R021 — Editor undo/redo history.
//
// Ring-buffer state machine. `createHistory(initial)` returns a
// `HistoryState` snapshot; `pushSnapshot`, `undo`, `redo`, `jumpTo`
// are pure functions returning a new state. The host page wraps
// these in a React `useState`/`useReducer` (or a `useEditorHistory`
// hook — see below).
//
// Pure module — no React imports at module scope so the smoke can
// exercise the state machine without rendering.

import type { Block } from "../types/block";

export interface Snapshot {
  ts: number;
  tree: Block[];
  action: string;     // e.g. "insert hero", "delete block_xyz"
}

export interface HistoryState {
  pageId: string;
  // Ring buffer ordered oldest-first. The current snapshot is at
  // `entries[cursor]`.
  entries: Snapshot[];
  cursor: number;     // index into entries
  capacity: number;   // max entries — drops oldest beyond
}

export const DEFAULT_CAPACITY = 50;

export function createHistory(
  pageId: string,
  initial: Block[],
  action = "open page",
  capacity: number = DEFAULT_CAPACITY,
  ts = Date.now(),
): HistoryState {
  return {
    pageId,
    entries: [{ ts, tree: initial, action }],
    cursor: 0,
    capacity,
  };
}

// Push a new snapshot. If cursor isn't at the head (operator hit
// undo then made a fresh edit), drop the redo tail before append.
// Capacity: trim oldest snapshots when over.
export function pushSnapshot(
  state: HistoryState,
  tree: Block[],
  action: string,
  ts = Date.now(),
): HistoryState {
  // Truncate any redo-tail past the cursor.
  let entries = state.entries.slice(0, state.cursor + 1);
  entries = [...entries, { ts, tree, action }];
  // Capacity trim — drop oldest beyond the cap.
  while (entries.length > state.capacity) entries.shift();
  return {
    ...state,
    entries,
    cursor: entries.length - 1,
  };
}

export function undo(state: HistoryState): HistoryState {
  if (state.cursor <= 0) return state;
  return { ...state, cursor: state.cursor - 1 };
}

export function redo(state: HistoryState): HistoryState {
  if (state.cursor >= state.entries.length - 1) return state;
  return { ...state, cursor: state.cursor + 1 };
}

export function jumpTo(state: HistoryState, index: number): HistoryState {
  if (index < 0 || index >= state.entries.length) return state;
  return { ...state, cursor: index };
}

export function currentSnapshot(state: HistoryState): Snapshot | null {
  return state.entries[state.cursor] ?? null;
}

export function canUndo(state: HistoryState): boolean {
  return state.cursor > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.cursor < state.entries.length - 1;
}

// Convenience: the action label for the snapshot we'd undo TO (the
// previous snapshot's action), used as the Undo button's tooltip
// ("Undo: insert hero").
export function undoActionLabel(state: HistoryState): string | null {
  if (!canUndo(state)) return null;
  return state.entries[state.cursor]?.action ?? null;
}

export function redoActionLabel(state: HistoryState): string | null {
  if (!canRedo(state)) return null;
  return state.entries[state.cursor + 1]?.action ?? null;
}
