"use client";

// BlockToolbar — floating quick-actions bar that appears on the
// selected block in the visual editor. Wix / Squarespace style:
// hover the block, see a 5-button strip on the top-right with
// move-up / move-down / duplicate / settings / delete.
//
// Lives inside BlockWrapper (Canvas.tsx) so it positions absolutely
// to the wrapper. The wrapper passes in callbacks; this component
// just renders the chrome.

interface Props {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onSettings?: () => void;
  onRemove: () => void;
  // Drag handle — operator grabs this to drag the block. The actual
  // drag listener lives on the wrapper, but we surface a visible
  // grip so users know they can drag.
  dragHandleRef?: React.Ref<HTMLDivElement>;
}

export default function BlockToolbar({
  label, canMoveUp, canMoveDown,
  onMoveUp, onMoveDown, onDuplicate, onSettings, onRemove,
  dragHandleRef,
}: Props) {
  return (
    <div
      className="absolute z-20 flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-[#0a0a0a] border border-brand-orange shadow-lg"
      style={{ top: -32, right: 0 }}
      onClick={e => e.stopPropagation()}
    >
      <div
        ref={dragHandleRef}
        className="px-1.5 py-1 text-brand-cream/65 hover:text-brand-cream cursor-grab active:cursor-grabbing"
        title="Drag to move"
        aria-label="Drag handle"
      >
        ⋮⋮
      </div>
      <span className="text-[10px] tracking-wider uppercase text-brand-cream/55 px-1">{label}</span>
      <span className="w-px h-4 bg-white/10 mx-0.5" />
      <ToolButton onClick={onMoveUp} disabled={!canMoveUp} title="Move up">↑</ToolButton>
      <ToolButton onClick={onMoveDown} disabled={!canMoveDown} title="Move down">↓</ToolButton>
      <ToolButton onClick={onDuplicate} title="Duplicate (⌘D)">⧉</ToolButton>
      {onSettings && <ToolButton onClick={onSettings} title="Settings">⚙</ToolButton>}
      <ToolButton onClick={onRemove} danger title="Delete (Del)">🗑</ToolButton>
    </div>
  );
}

function ToolButton({
  onClick, disabled, danger, title, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`px-1.5 py-1 text-[12px] rounded transition-colors ${
        danger
          ? "text-red-300/70 hover:text-red-300 hover:bg-red-500/10"
          : "text-brand-cream/65 hover:text-brand-cream hover:bg-white/5"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
