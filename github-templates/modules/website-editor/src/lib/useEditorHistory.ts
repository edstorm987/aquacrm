"use client";

// R021 — `useEditorHistory(pageId, initialTree)` hook.
//
// Wraps the pure history state machine in `editorHistory.ts` with
// React state. Returns the current tree + `pushSnapshot / undo /
// redo / jumpTo` callbacks + capability flags.

import { useCallback, useEffect, useState } from "react";
import {
  createHistory,
  pushSnapshot as pushPure,
  undo as undoPure,
  redo as redoPure,
  jumpTo as jumpPure,
  currentSnapshot,
  canUndo,
  canRedo,
  undoActionLabel,
  redoActionLabel,
  DEFAULT_CAPACITY,
  type HistoryState,
  type Snapshot,
} from "./editorHistory";
import type { Block } from "../types/block";

export interface EditorHistoryHandle {
  state: HistoryState;
  current: Snapshot | null;
  tree: Block[];
  push: (tree: Block[], action: string) => void;
  undo: () => void;
  redo: () => void;
  jumpTo: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export function useEditorHistory(
  pageId: string,
  initialTree: Block[],
  capacity = DEFAULT_CAPACITY,
): EditorHistoryHandle {
  const [state, setState] = useState(() => createHistory(pageId, initialTree, "open page", capacity));

  // If the operator switches pages, reset the history to the new
  // page's initial tree.
  useEffect(() => {
    setState(createHistory(pageId, initialTree, "open page", capacity));
  }, [pageId, capacity]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback((tree: Block[], action: string) => {
    setState(s => pushPure(s, tree, action));
  }, []);
  const undo = useCallback(() => setState(s => undoPure(s)), []);
  const redo = useCallback(() => setState(s => redoPure(s)), []);
  const jumpTo = useCallback((index: number) => setState(s => jumpPure(s, index)), []);

  const current = currentSnapshot(state);
  return {
    state,
    current,
    tree: current?.tree ?? initialTree,
    push,
    undo,
    redo,
    jumpTo,
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    undoLabel: undoActionLabel(state),
    redoLabel: redoActionLabel(state),
  };
}
