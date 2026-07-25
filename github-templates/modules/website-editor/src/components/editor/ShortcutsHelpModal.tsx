"use client";

// R018 — Shortcuts help modal. Renders the full keyboard shortcut
// list grouped by scope. Triggered by `?` (per `editorShortcuts.ts`
// `help:open`).

import { DEFAULT_BINDINGS, formatBinding, type KeyBinding } from "../../lib/editorShortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
  bindings?: readonly KeyBinding[];
}

export default function ShortcutsHelpModal({ open, onClose, bindings = DEFAULT_BINDINGS }: Props) {
  if (!open) return null;

  const global = bindings.filter(b => b.scope === "global");
  const blockSelected = bindings.filter(b => b.scope === "block-selected");

  return (
    <div role="dialog" aria-label="Keyboard shortcuts" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div style={{
        width: 540, maxWidth: "92vw", maxHeight: "80vh",
        background: "var(--brand-bg-elevated, #0b1220)",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--brand-radius-md, 12px)",
        overflow: "hidden", display: "flex", flexDirection: "column",
        color: "var(--brand-text, #f5f3ec)",
      }}>
        <header style={{
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, fontFamily: "var(--brand-font-heading, inherit)" }}>Keyboard shortcuts</h2>
            <p style={{ fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.55))", margin: 0 }}>
              Press <code>?</code> any time to reopen this list.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close shortcuts help"
            style={{ background: "transparent", border: "none", color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 22, cursor: "pointer" }}
          >×</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <Section title="Global" bindings={global} />
          <Section title="When a block is selected" bindings={blockSelected} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, bindings }: { title: string; bindings: KeyBinding[] }) {
  if (bindings.length === 0) return null;
  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em",
        color: "var(--brand-text-muted, rgba(255,255,255,0.45))",
        margin: "0 0 8px 0",
      }}>{title}</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {bindings.map(b => (
          <li key={b.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "8px 6px", fontSize: 13,
            borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.04))",
          }}>
            <span style={{ flex: 1 }}>{b.label}</span>
            <kbd style={{
              padding: "2px 8px",
              background: "var(--brand-bg-elevated, rgba(255,255,255,0.06))",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
              borderRadius: "var(--brand-radius-sm, 4px)",
              fontFamily: "monospace", fontSize: 12,
              color: "var(--brand-text-muted, rgba(255,255,255,0.7))",
            }}>{formatBinding(b)}</kbd>
          </li>
        ))}
      </ul>
    </section>
  );
}
