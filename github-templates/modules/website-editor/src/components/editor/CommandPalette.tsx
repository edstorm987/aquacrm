"use client";

// R018 — Cmd-K command palette.
//
// Opened via `Cmd-K` / `Ctrl-K` (host page binds the global shortcut
// using `editorShortcuts.ts`). Renders a fuzzy-search list of
// commands; arrow keys navigate, Enter executes, Esc closes.
// Operator can pass a custom command list; defaults cover Save /
// Publish / Toggle preview / Undo / Redo / "Insert <block>" entries
// derived from the current block-registry.

import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;          // shortcut display next to the label (e.g. "⌘S")
  group?: string;         // grouping header (e.g. "Insert", "Page", "Variant")
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  placeholder?: string;
}

export default function CommandPalette({ open, onClose, commands, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state on open + focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c =>
      `${c.label} ${c.group ?? ""} ${c.hint ?? ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep activeIdx clamped to filtered range.
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIdx]);

  function onKey(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) { cmd.run(); onClose(); }
      return;
    }
  }

  if (!open) return null;

  // Group filtered into Map<group, commands[]> preserving insertion order.
  const grouped = new Map<string, PaletteCommand[]>();
  for (const c of filtered) {
    const g = c.group ?? "";
    const arr = grouped.get(g) ?? [];
    arr.push(c);
    grouped.set(g, arr);
  }

  let runningIdx = 0;
  return (
    <div role="dialog" aria-label="Command palette"
      onKeyDown={onKey}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24"
    >
      <div style={{
        width: 600, maxWidth: "92vw", maxHeight: "60vh",
        background: "var(--brand-bg-elevated, #0b1220)",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--brand-radius-md, 12px)",
        overflow: "hidden", display: "flex", flexDirection: "column",
        color: "var(--brand-text, #f5f3ec)",
      }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
          placeholder={placeholder ?? "Type a command…"}
          style={{
            background: "transparent", border: "none", outline: "none",
            padding: "16px 20px", fontSize: 15,
            color: "var(--brand-text, #f5f3ec)",
            borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
          }}
        />
        <div role="listbox" style={{ flex: 1, overflowY: "auto", padding: 4 }}>
          {filtered.length === 0 && (
            <p style={{ padding: 20, color: "var(--brand-text-muted, rgba(255,255,255,0.45))", fontSize: 13, textAlign: "center" }}>
              No commands match.
            </p>
          )}
          {[...grouped.entries()].map(([group, items]) => (
            <div key={group}>
              {group && (
                <p style={{
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em",
                  color: "var(--brand-text-muted, rgba(255,255,255,0.45))",
                  padding: "8px 14px 4px",
                }}>{group}</p>
              )}
              {items.map(c => {
                const idx = runningIdx++;
                const active = idx === activeIdx;
                return (
                  <button
                    key={c.id}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => { c.run(); onClose(); }}
                    style={{
                      width: "100%", textAlign: "left", display: "flex",
                      alignItems: "center", gap: 12, padding: "8px 14px",
                      background: active ? "var(--brand-primary, rgba(56,189,248,0.18))" : "transparent",
                      border: "none", cursor: "pointer", fontSize: 13,
                      color: active ? "var(--brand-text, #fff)" : "var(--brand-text, currentColor)",
                      borderRadius: "var(--brand-radius-sm, 6px)",
                    }}
                  >
                    <span style={{ flex: 1 }}>{c.label}</span>
                    {c.hint && (
                      <span style={{
                        fontSize: 10, padding: "2px 6px",
                        background: "var(--brand-bg-elevated, rgba(255,255,255,0.06))",
                        border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
                        borderRadius: "var(--brand-radius-sm, 4px)",
                        color: "var(--brand-text-muted, rgba(255,255,255,0.65))",
                        fontFamily: "monospace",
                      }}>{c.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Click-out backdrop */}
      <button
        aria-label="Close palette"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "pointer", zIndex: -1 }}
      />
    </div>
  );
}
