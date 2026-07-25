"use client";

// The main editing surface. Wraps BlockRenderer with drop-zone overlays
// and click-to-select. Each block is wrapped in an outline + a hover/
// selected ring so the operator sees structure even on a clean design.

import { useState } from "react";
import type { Block, BlockType } from "../../types/block";
import BlockRenderer from "../BlockRenderer";
import { getBlockDefinition, listBlocksByCategory, type BlockDefinition } from "../blockRegistry";
import {
  effectiveViewport, getDevicePreset, type DeviceState,
} from "../../lib/devicePresets";
import BlockToolbar from "./BlockToolbar";

interface CanvasProps {
  blocks: Block[];
  selectedId: string | null;
  device: "desktop" | "tablet" | "mobile" | DeviceState;
  themeId?: string;
  onSelect: (id: string) => void;
  onDropOnCanvas: (type: BlockType) => void;
  onDropBeside: (targetId: string, type: BlockType, position: "before" | "after" | "inside") => void;
  onMoveBeside: (sourceId: string, targetId: string, position: "before" | "after" | "inside") => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
  // For inline text editing — patch a block's props (used by HeadingBlock /
  // TextBlock contentEditable on double-click).
  onPatchProps?: (id: string, patch: Record<string, unknown>) => void;
}

export default function Canvas({
  blocks, selectedId, device, themeId,
  onSelect, onDropOnCanvas, onDropBeside, onMoveBeside,
  onMoveUp, onMoveDown, onDuplicate, onRemove, onPatchProps,
}: CanvasProps) {
  const [hover, setHover] = useState<string | null>(null);

  // Resolve viewport. Legacy enum maps to width-only (no zoom, no
  // chrome). New DeviceState reads through effectiveViewport.
  let frameStyle: React.CSSProperties;
  let chrome: { bezel: { top: number; right: number; bottom: number; left: number } } | null = null;
  if (typeof device === "string") {
    const w = device === "desktop" ? "100%" : device === "tablet" ? 768 : 375;
    frameStyle = { width: w, maxWidth: "100%", minHeight: "calc(100vh - 96px)" };
  } else {
    const spec = getDevicePreset(device.deviceId);
    const vp = spec ? effectiveViewport(spec, device) : { width: 1280, height: 800 };
    const responsive = device.deviceId === "responsive";
    frameStyle = {
      width: responsive ? "100%" : vp.width,
      maxWidth: responsive ? "100%" : vp.width,
      minHeight: responsive ? "calc(100vh - 96px)" : vp.height,
      transform: `scale(${device.zoom})`,
      transformOrigin: "top center",
    };
    if (device.showChrome && spec?.bezel && (spec.category === "phone" || spec.category === "tablet")) {
      chrome = { bezel: spec.bezel };
    }
  }

  const frame = (
    <div
      className="mx-auto my-6 transition-all duration-200 bg-brand-black rounded-lg shadow-2xl shadow-black/40 overflow-hidden"
      style={frameStyle}
    >
      <div
        className="relative"
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDrop={e => {
          if (e.target !== e.currentTarget && blocks.length !== 0) return;
          const type = e.dataTransfer.getData("application/x-block-type") as BlockType;
          if (type) onDropOnCanvas(type);
        }}
      >
        {blocks.length === 0 ? (
          <EmptyState onDropType={onDropOnCanvas} />
        ) : (
          <BlockTreeWithChrome
            blocks={blocks}
            allBlocks={blocks}
            selectedId={selectedId}
            hover={hover}
            setHover={setHover}
            themeId={themeId}
            onSelect={onSelect}
            onDropBeside={onDropBeside}
            onMoveBeside={onMoveBeside}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
            onPatchProps={onPatchProps}
          />
        )}
      </div>
    </div>
  );

  // Wrap the frame in a decorative device bezel when "Frame" is on
  // for a phone/tablet preset. Pure CSS — just a rounded outer shell
  // sized to bezel coordinates so the screen content sits inside it.
  const framed = chrome ? (
    <div
      className="mx-auto my-6 rounded-[36px] bg-[#1a1a1a] border-4 border-[#2a2a2a] shadow-2xl shadow-black/60"
      style={{
        padding: `${chrome.bezel.top}px ${chrome.bezel.right}px ${chrome.bezel.bottom}px ${chrome.bezel.left}px`,
        width: "max-content",
      }}
    >
      <div className="rounded-[20px] overflow-hidden">{frame}</div>
    </div>
  ) : frame;

  return (
    <div className="flex-1 min-w-0 overflow-auto bg-[#0a0a0a]">
      {framed}
    </div>
  );
}

// Inline "+" button rendered just below a hovered/selected block. Click
// to open a tiny block picker; pick to insert after the current block.
// Most-used categories first to keep the menu small.
function InlineInsert({ onPick }: { onPick: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: "absolute", left: "50%", bottom: -16, transform: "translateX(-50%)", zIndex: 11, pointerEvents: "auto" }}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Insert block here"
        aria-label="Insert block here"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--brand-accent, #ff6b35)",
          color: "#fff",
          border: "2px solid #0a0a0a",
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {open ? "×" : "+"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15,15,15,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 8,
            minWidth: 240,
            maxHeight: 320,
            overflowY: "auto",
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
          }}
        >
          <QuickPicker onPick={t => { onPick(t); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function QuickPicker({ onPick }: { onPick: (type: BlockType) => void }) {
  const groups: Array<{ label: string; items: BlockDefinition[] }> = [
    { label: "Layout",   items: listBlocksByCategory("layout") },
    { label: "Content",  items: listBlocksByCategory("content") },
    { label: "Media",    items: listBlocksByCategory("media") },
    { label: "Commerce", items: listBlocksByCategory("commerce") },
  ];
  return (
    <div>
      {groups.map(g => g.items.length > 0 && (
        <div key={g.label} style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.45, padding: "0 4px 2px", margin: 0 }}>{g.label}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {g.items.map(b => (
              <button
                key={b.type}
                type="button"
                onClick={() => onPick(b.type)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 4px", background: "transparent", border: "1px solid transparent", borderRadius: 6, color: "rgba(255,255,255,0.85)", fontSize: 9, cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 14 }}>{b.icon}</span>
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onDropType }: { onDropType: (type: BlockType) => void }) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={e => {
        const type = e.dataTransfer.getData("application/x-block-type") as BlockType;
        if (type) onDropType(type);
      }}
      className="m-12 p-24 border-2 border-dashed border-brand-orange/30 rounded-2xl text-center"
    >
      <p className="font-display text-2xl text-brand-cream mb-2">Start designing</p>
      <p className="text-[12px] text-brand-cream/55 max-w-md mx-auto">
        Drag a block from the left sidebar onto this canvas, or click any block to insert it at the top level.
      </p>
    </div>
  );
}

function BlockTreeWithChrome({
  blocks, allBlocks, selectedId, hover, setHover, themeId,
  onSelect, onDropBeside, onMoveBeside,
  onMoveUp, onMoveDown, onDuplicate, onRemove, onPatchProps,
}: {
  blocks: Block[];
  allBlocks: Block[];
  selectedId: string | null;
  hover: string | null;
  setHover: (id: string | null) => void;
  themeId?: string;
  onSelect: (id: string) => void;
  onDropBeside: (targetId: string, type: BlockType, position: "before" | "after" | "inside") => void;
  onMoveBeside: (sourceId: string, targetId: string, position: "before" | "after" | "inside") => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onPatchProps?: (id: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <div data-canvas-root>
      {blocks.map((b, i) => (
        <BlockWrapper
          key={b.id}
          block={b}
          siblingIndex={i}
          siblingCount={blocks.length}
          allBlocks={allBlocks}
          selectedId={selectedId}
          hover={hover}
          setHover={setHover}
          themeId={themeId}
          onSelect={onSelect}
          onDropBeside={onDropBeside}
          onMoveBeside={onMoveBeside}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onPatchProps={onPatchProps}
        />
      ))}
    </div>
  );
}

function BlockWrapper({
  block, siblingIndex, siblingCount, allBlocks,
  selectedId, hover, setHover, themeId,
  onSelect, onDropBeside, onMoveBeside,
  onMoveUp, onMoveDown, onDuplicate, onRemove, onPatchProps,
}: {
  block: Block;
  siblingIndex?: number;
  siblingCount?: number;
  allBlocks?: Block[];
  selectedId: string | null;
  hover: string | null;
  setHover: (id: string | null) => void;
  themeId?: string;
  onSelect: (id: string) => void;
  onDropBeside: (targetId: string, type: BlockType, position: "before" | "after" | "inside") => void;
  onMoveBeside: (sourceId: string, targetId: string, position: "before" | "after" | "inside") => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onPatchProps?: (id: string, patch: Record<string, unknown>) => void;
}) {
  const def = getBlockDefinition(block.type);
  const overlay = themeId ? block.themeStyles?.[themeId] : undefined;
  const effectiveBlock = overlay ? { ...block, styles: { ...(block.styles ?? {}), ...overlay } } : block;
  const selected = block.id === selectedId;
  const hovered = block.id === hover;
  const [dropPos, setDropPos] = useState<"before" | "after" | "inside" | null>(null);

  function handleDrop(e: React.DragEvent, position: "before" | "after" | "inside") {
    e.preventDefault();
    e.stopPropagation();
    setHover(null);
    setDropPos(null);
    const newType = e.dataTransfer.getData("application/x-block-type") as BlockType;
    const movingId = e.dataTransfer.getData("application/x-block-id");
    if (newType) {
      onDropBeside(block.id, newType, position);
      return;
    }
    if (movingId) {
      onMoveBeside(movingId, block.id, position);
    }
  }

  function handleDragOver(e: React.DragEvent, position: "before" | "after" | "inside") {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("application/x-block-id") ? "move" : "copy";
    setDropPos(position);
  }

  function handleDragLeave() {
    setDropPos(null);
  }

  // Inline text editing for heading/text/button/cta is handled by the
  // block components themselves via contentEditable + the
  // lk-block-text-commit CustomEvent (see HeadingBlock.tsx + TextBlock.tsx).
  // The editor page listens and patches. Nothing to wire here.

  const canMoveUp   = (siblingIndex ?? 0) > 0;
  const canMoveDown = (siblingIndex ?? 0) < ((siblingCount ?? 1) - 1);

  return (
    <div
      data-block-wrapper={block.id}
      onClick={e => { e.stopPropagation(); onSelect(block.id); }}
      onMouseEnter={e => { e.stopPropagation(); setHover(block.id); }}
      onMouseLeave={() => { setHover(null); setDropPos(null); }}
      draggable
      data-touch-drag-payload={JSON.stringify({ type: "x-block-id", value: block.id })}
      onDragStart={e => {
        e.stopPropagation();
        e.dataTransfer.setData("application/x-block-id", block.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{ position: "relative" }}
      className={[
        "outline-offset-[-2px] cursor-pointer transition-shadow",
        selected ? "outline outline-2 outline-brand-orange" : hovered ? "outline outline-1 outline-brand-orange/40" : "",
      ].join(" ")}
    >
      {/* Top drop zone: insert before */}
      <div
        onDragOver={e => handleDragOver(e, "before")}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, "before")}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, zIndex: 5 }}
      />
      {/* Bottom drop zone: insert after */}
      <div
        onDragOver={e => handleDragOver(e, "after")}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, "after")}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, zIndex: 5 }}
      />

      {/* Inside drop — only for containers */}
      {def?.isContainer && (
        <div
          onDragOver={e => handleDragOver(e, "inside")}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, "inside")}
          style={{ position: "absolute", top: 8, left: 0, right: 0, bottom: 8, zIndex: 1, pointerEvents: "none" }}
        />
      )}

      {/* Visible drop indicator — coloured line where the block will land */}
      {dropPos === "before" && (
        <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 3, background: "var(--brand-accent, #ff6b35)", zIndex: 15, boxShadow: "0 0 0 2px rgba(255,107,53,0.25)" }} />
      )}
      {dropPos === "after" && (
        <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 3, background: "var(--brand-accent, #ff6b35)", zIndex: 15, boxShadow: "0 0 0 2px rgba(255,107,53,0.25)" }} />
      )}
      {dropPos === "inside" && (
        <div style={{ position: "absolute", inset: 4, border: "2px dashed var(--brand-accent, #ff6b35)", borderRadius: 6, zIndex: 1, pointerEvents: "none" }} />
      )}

      {/* Floating block toolbar — appears on hover/select */}
      {(selected || hovered) && (onMoveUp || onMoveDown || onDuplicate || onRemove) && (
        <BlockToolbar
          label={def?.label ?? block.type}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={() => onMoveUp?.(block.id)}
          onMoveDown={() => onMoveDown?.(block.id)}
          onDuplicate={() => onDuplicate?.(block.id)}
          onRemove={() => onRemove?.(block.id)}
        />
      )}

      {/* Selection chip — kept for label visibility under the toolbar */}
      {selected && !hovered && (
        <span style={{ position: "absolute", top: -22, left: 0, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--brand-accent, #ff6b35)", color: "#fff", zIndex: 10 }}>
          {def?.label ?? block.type}
        </span>
      )}

      {/* Inline + insert button — appears between blocks on hover */}
      {(hovered || selected) && <InlineInsert onPick={type => onDropBeside(block.id, type, "after")} />}

      {/* Render the block + recurse into children with chrome */}
      {def
        ? <def.Component block={effectiveBlock} editorMode renderChildren={children =>
            children
              ? <>{children.map((c, ci) => <BlockWrapper key={c.id} block={c} siblingIndex={ci} siblingCount={children.length} allBlocks={allBlocks} selectedId={selectedId} hover={hover} setHover={setHover} themeId={themeId} onSelect={onSelect} onDropBeside={onDropBeside} onMoveBeside={onMoveBeside} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDuplicate={onDuplicate} onRemove={onRemove} onPatchProps={onPatchProps} />)}</>
              : null
          } />
        : <BlockRenderer blocks={[block]} editorMode themeId={themeId} />
      }
    </div>
  );
}
