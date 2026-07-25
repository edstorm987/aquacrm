"use client";

// R021 — Undo/Redo toolbar + History dropdown.
//
// Pure UI: receives the `useEditorHistory` handle (or any object
// with the same shape), renders Undo / Redo buttons + a "History"
// dropdown that lists the last 20 snapshots with click-to-jump.

import { useState } from "react";
import type { HistoryState, Snapshot } from "../../lib/editorHistory";

interface HandleLike {
  state: HistoryState;
  undo: () => void;
  redo: () => void;
  jumpTo: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

interface Props {
  history: HandleLike;
  // Optional — host can render a thumbnail per snapshot on hover.
  renderThumb?: (s: Snapshot) => React.ReactNode;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function HistoryToolbar({ history, renderThumb }: Props) {
  const [open, setOpen] = useState(false);
  const recent = history.state.entries.slice(-20).reverse();
  const baseIndex = history.state.entries.length - recent.length;

  return (
    <div data-component="history-toolbar" style={{ display: "inline-flex", gap: 4, alignItems: "center", position: "relative" }}>
      <button
        onClick={history.undo}
        disabled={!history.canUndo}
        title={history.undoLabel ? `Undo: ${history.undoLabel}` : "Nothing to undo"}
        aria-label="Undo"
        style={iconBtnStyle(history.canUndo)}
      >↺</button>
      <button
        onClick={history.redo}
        disabled={!history.canRedo}
        title={history.redoLabel ? `Redo: ${history.redoLabel}` : "Nothing to redo"}
        aria-label="Redo"
        style={iconBtnStyle(history.canRedo)}
      >↻</button>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          padding: "4px 10px", fontSize: 11,
          background: open ? "var(--brand-primary, rgba(56,189,248,0.18))" : "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
          color: "var(--brand-text, currentColor)",
          border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
          borderRadius: "var(--brand-radius-sm, 4px)",
          cursor: "pointer",
        }}
      >History ▾</button>

      {open && (
        <div role="menu" aria-label="History"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            zIndex: 40, minWidth: 280, maxHeight: 480, overflowY: "auto",
            background: "var(--brand-bg-elevated, #0b1220)",
            border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
            borderRadius: "var(--brand-radius-md, 8px)",
            padding: 4,
          }}>
          {recent.length === 0 && (
            <p style={{ padding: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.5))", fontSize: 12 }}>
              No history yet.
            </p>
          )}
          {recent.map((snap, localIdx) => {
            const realIdx = baseIndex + (recent.length - 1 - localIdx);
            const isCurrent = realIdx === history.state.cursor;
            return (
              <button
                key={`${snap.ts}-${realIdx}`}
                role="menuitem"
                onClick={() => { history.jumpTo(realIdx); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "6px 10px",
                  background: isCurrent ? "var(--brand-primary, rgba(56,189,248,0.18))" : "transparent",
                  color: "var(--brand-text, currentColor)",
                  border: "none", cursor: "pointer",
                  borderRadius: "var(--brand-radius-sm, 4px)",
                  display: "flex", flexDirection: "column", gap: 2,
                  fontSize: 12,
                }}
              >
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: isCurrent ? 600 : 400 }}>
                    {isCurrent && "● "}{snap.action}
                  </span>
                  <span style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.5))", fontSize: 10, fontFamily: "monospace" }}>
                    {fmtTime(snap.ts)}
                  </span>
                </span>
                {renderThumb && <div style={{ marginTop: 2 }}>{renderThumb(snap)}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function iconBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28,
    background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
    color: "var(--brand-text, currentColor)",
    border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
    borderRadius: "var(--brand-radius-sm, 4px)",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.4,
    fontSize: 14,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
}
