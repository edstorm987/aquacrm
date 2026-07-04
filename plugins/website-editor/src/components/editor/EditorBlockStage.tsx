"use client";

// Inline block editor — replaces the iframe-of-the-standalone-block-editor
// in /admin/editor's Block mode so we get one chrome instead of two.
//
// Three-pane micro-layout: block library on the left, drag/drop canvas in
// the middle, block properties on the right. Loads the EditorPage on
// mount, holds blocks in local state, debounce-saves through the existing
// editorPages API. Undo/redo + keyboard shortcuts mirror the standalone
// editor but are scoped to this component.
//
// The outer super-editor still wraps this with its own outliner (left)
// and topbar (above) so the operator gets one continuous experience.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, BlockType } from "../../types/block";
import type { EditorPage } from "../../types/editorPage";
import { getPage, updatePage } from "../../lib/editorPages";
import {
  appendChild, createBlock, duplicateBlock, findBlock, insertSibling,
  moveBlock, removeBlock, updateBlock,
} from "../canvas/blockTreeOps";
import Canvas from "../canvas/Canvas";
import Sidebar from "../canvas/Sidebar";
import PropertiesPanel from "../canvas/PropertiesPanel";
import TouchDndProvider from "../canvas/touchDnd";
import type { DeviceState } from "../../lib/devicePresets";

const SAVE_DEBOUNCE_MS = 500;
const HISTORY_CAP = 50;

interface Props {
  siteId: string;
  pageId: string;
  device: DeviceState;
  // Surface save state up to the super-editor's topbar.
  onSavingChange?: (saving: boolean) => void;
  // History controls — wired to the topbar's undo/redo buttons via refs.
  registerHistory?: (api: { undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean }) => void;
  // Push undo/redo availability up so the topbar can disable its buttons.
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export default function EditorBlockStage({ siteId, pageId, device, onSavingChange, registerHistory, onHistoryChange }: Props) {
  const [page, setPage] = useState<EditorPage | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History stacks. Stored in refs (not state) — mutation needn't trigger
  // a render of every block in the canvas just to bump the undo length.
  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  // Tick state purely so consumers (the topbar) can read fresh canUndo/canRedo
  // through their api ref. We bump on every mutation.
  const [, bumpHistoryRev] = useState(0);

  // Load page on mount / when target changes.
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setBlocks([]);
    setSelectedId(null);
    setError(null);
    void (async () => {
      const p = await getPage(siteId, pageId);
      if (cancelled) return;
      if (!p) { setError("Page not found"); return; }
      setPage(p);
      setBlocks(p.blocks);
      undoStack.current = [];
      redoStack.current = [];
      bumpHistoryRev(r => r + 1);
    })();
    return () => { cancelled = true; };
  }, [siteId, pageId]);

  const scheduleSave = useCallback((next: Block[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    onSavingChange?.(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const updated = await updatePage(siteId, pageId, { blocks: next });
        if (updated) setPage(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        onSavingChange?.(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [siteId, pageId, onSavingChange]);

  // Push current undo/redo availability to the parent so its topbar
  // buttons can disable themselves accurately.
  const announceHistory = useCallback(() => {
    onHistoryChange?.(undoStack.current.length > 0, redoStack.current.length > 0);
  }, [onHistoryChange]);

  const mutate = useCallback((next: Block[], opts?: { skipHistory?: boolean }) => {
    if (!opts?.skipHistory) {
      undoStack.current.push(blocks);
      if (undoStack.current.length > HISTORY_CAP) undoStack.current.shift();
      redoStack.current = [];
      bumpHistoryRev(r => r + 1);
      announceHistory();
    }
    setBlocks(next);
    scheduleSave(next);
  }, [blocks, scheduleSave, announceHistory]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(blocks);
    bumpHistoryRev(r => r + 1);
    announceHistory();
    setBlocks(prev);
    scheduleSave(prev);
  }, [blocks, scheduleSave, announceHistory]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(blocks);
    bumpHistoryRev(r => r + 1);
    announceHistory();
    setBlocks(next);
    scheduleSave(next);
  }, [blocks, scheduleSave, announceHistory]);

  // Expose history controls to the parent (super-editor's topbar).
  useEffect(() => {
    registerHistory?.({
      undo, redo,
      canUndo: () => undoStack.current.length > 0,
      canRedo: () => redoStack.current.length > 0,
    });
  }, [registerHistory, undo, redo]);

  // Re-announce on the initial mount + after every load so the topbar
  // sees the right state when switching pages.
  useEffect(() => { announceHistory(); }, [announceHistory, blocks]);

  // Inline rich-text edits dispatched by Heading/Text blocks.
  useEffect(() => {
    function onCommit(e: Event) {
      const detail = (e as CustomEvent).detail as { id: string; key: string; value: unknown } | undefined;
      if (!detail) return;
      const target = findBlock(blocks, detail.id);
      if (!target) return;
      mutate(updateBlock(blocks, detail.id, {
        props: { ...target.block.props, [detail.key]: detail.value },
      }));
    }
    window.addEventListener("lk-block-text-commit", onCommit);
    return () => window.removeEventListener("lk-block-text-commit", onCommit);
  }, [blocks, mutate]);

  // Keyboard shortcuts — Cmd+Z, Cmd+Shift+Z, Cmd+D, Delete/Backspace.
  // Cmd+S is owned by the super-editor (publish) so we don't grab it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (cmd && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        mutate(duplicateBlock(blocks, selectedId));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        mutate(removeBlock(blocks, selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocks, selectedId, mutate, undo, redo]);

  // ── Canvas + Properties handlers ────────────────────────────────────────

  function handleDropOnCanvas(type: BlockType) {
    mutate([...blocks, createBlock(type)]);
  }
  function handleDropBeside(targetId: string, type: BlockType, position: "before" | "after" | "inside") {
    const newBlock = createBlock(type);
    if (position === "inside") mutate(appendChild(blocks, targetId, newBlock));
    else mutate(insertSibling(blocks, targetId, newBlock, position));
    setSelectedId(newBlock.id);
  }
  function handleMoveBeside(sourceId: string, targetId: string, position: "before" | "after" | "inside") {
    mutate(moveBlock(blocks, sourceId, targetId, position));
  }
  function handlePatchSelected(patch: Partial<Block>) {
    if (!selectedId) return;
    mutate(updateBlock(blocks, selectedId, patch));
  }
  function handleDuplicateSelected() {
    if (!selectedId) return;
    mutate(duplicateBlock(blocks, selectedId));
  }
  function handleRemoveSelected() {
    if (!selectedId) return;
    mutate(removeBlock(blocks, selectedId));
    setSelectedId(null);
  }
  function handleDuplicateBlock(id: string) {
    mutate(duplicateBlock(blocks, id));
  }
  function handleRemoveBlock(id: string) {
    mutate(removeBlock(blocks, id));
    if (selectedId === id) setSelectedId(null);
  }
  function handleMoveBlockUp(id: string) {
    const target = findBlock(blocks, id);
    if (!target) return;
    const siblings = target.parent
      ? findBlock(blocks, target.parent.id)?.block.children ?? []
      : blocks;
    const idx = siblings.findIndex(b => b.id === id);
    if (idx <= 0) return;
    const prev = siblings[idx - 1];
    if (!prev) return;
    mutate(moveBlock(blocks, id, prev.id, "before"));
  }
  function handleMoveBlockDown(id: string) {
    const target = findBlock(blocks, id);
    if (!target) return;
    const siblings = target.parent
      ? findBlock(blocks, target.parent.id)?.block.children ?? []
      : blocks;
    const idx = siblings.findIndex(b => b.id === id);
    if (idx < 0 || idx >= siblings.length - 1) return;
    const next = siblings[idx + 1];
    if (!next) return;
    mutate(moveBlock(blocks, id, next.id, "after"));
  }
  function handlePatchProps(id: string, patch: Record<string, unknown>) {
    const target = findBlock(blocks, id);
    if (!target) return;
    mutate(updateBlock(blocks, id, { props: { ...target.block.props, ...patch } }));
  }

  if (error) {
    return (
      <div className="text-center text-[12px] text-red-300 mt-12 max-w-md mx-auto">
        {error}
      </div>
    );
  }
  if (!page) {
    return (
      <div className="text-center text-[12px] text-brand-cream/45 mt-12">Loading page…</div>
    );
  }

  const selectedBlock = selectedId ? findBlock(blocks, selectedId)?.block ?? null : null;

  return (
    <>
      <TouchDndProvider />
      <div className="flex-1 min-h-0 flex">
        <Sidebar
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddTopLevel={handleDropOnCanvas}
        />
        <div className="flex-1 min-w-0 overflow-auto bg-[#050505]">
          <Canvas
            blocks={blocks}
            selectedId={selectedId}
            device={device}
            themeId={page.themeId}
            onSelect={setSelectedId}
            onDropOnCanvas={handleDropOnCanvas}
            onDropBeside={handleDropBeside}
            onMoveBeside={handleMoveBeside}
            onMoveUp={handleMoveBlockUp}
            onMoveDown={handleMoveBlockDown}
            onDuplicate={handleDuplicateBlock}
            onRemove={handleRemoveBlock}
            onPatchProps={handlePatchProps}
          />
        </div>
        <PropertiesPanel
          block={selectedBlock}
          onPatch={handlePatchSelected}
          onDuplicate={handleDuplicateSelected}
          onRemove={handleRemoveSelected}
        />
      </div>
    </>
  );
}
