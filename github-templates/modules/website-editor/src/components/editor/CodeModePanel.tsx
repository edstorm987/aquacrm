"use client";

// R020 — Code mode panel. JSON editor on the left, live-preview
// callback on the right. Live preview is host-page-rendered (host
// passes a `renderPreview` callback that receives the last-good
// tree); this component owns the JSON state machine + validation +
// copy/paste affordances.
//
// Behaviour:
//   - On mount: textarea seeded with stringified `initialTree`.
//   - Edit: parse + validate. Errors show inline (line/col when
//     available); preview keeps rendering the last-good tree.
//   - Save: confirms structural diff via compareTrees when the
//     tree differs from the original; calls `onSave(newTree)`.
//   - Copy: copies the current textarea content via
//     `navigator.clipboard.writeText`.
//   - Paste: replaces the textarea with clipboard content (no
//     auto-save; operator clicks Save explicitly).

import { useEffect, useMemo, useRef, useState } from "react";
import type { Block } from "../../types/block";
import {
  parseBlockTreeJson,
  formatBlockTreeJson,
  compareTrees,
} from "../../lib/blockTreeJson";

interface Props {
  initialTree: Block[];
  onSave: (next: Block[]) => void;
  // Host-rendered preview pane. Receives the last-good tree.
  renderPreview?: (lastGood: Block[]) => React.ReactNode;
}

export default function CodeModePanel({ initialTree, onSave, renderPreview }: Props) {
  const [text, setText] = useState(() => formatBlockTreeJson(initialTree));
  const [error, setError] = useState<{ message: string; line?: number; col?: number } | null>(null);
  const [confirm, setConfirm] = useState<{ next: Block[]; summary: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const lastGoodRef = useRef<Block[]>(initialTree);

  // Re-validate whenever the textarea changes.
  const parseResult = useMemo(() => parseBlockTreeJson(text), [text]);
  useEffect(() => {
    if (parseResult.ok) {
      lastGoodRef.current = parseResult.blocks;
      setError(null);
    } else {
      setError({
        message: parseResult.error,
        ...(parseResult.line ? { line: parseResult.line, col: parseResult.col } : {}),
      });
    }
  }, [parseResult]);

  function attemptSave(): void {
    if (!parseResult.ok) return;
    const next = parseResult.blocks;
    const diff = compareTrees(initialTree, next);
    if (diff.identical) {
      // Nothing changed — no-op.
      return;
    }
    const summary = `Block count: ${diff.countA} → ${diff.countB}` +
      (diff.firstDifferenceAt ? `. First diff at ${diff.firstDifferenceAt}.` : "");
    setConfirm({ next, summary });
  }

  function commitSave(): void {
    if (confirm) {
      onSave(confirm.next);
      setConfirm(null);
    }
  }

  async function copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — operator copies manually.
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      const v = await navigator.clipboard.readText();
      if (v) setText(v);
    } catch {
      // Clipboard unavailable / no permission — operator pastes manually.
    }
  }

  function reformat(): void {
    if (parseResult.ok) setText(formatBlockTreeJson(parseResult.blocks));
  }

  return (
    <section data-component="code-mode-panel"
      style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
        height: "100%", minHeight: 480,
        color: "var(--brand-text, currentColor)",
        background: "var(--brand-bg, #0b1220)",
      }}>
      <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--brand-border, rgba(255,255,255,0.08))" }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.05))",
          fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.6))",
        }}>
          <span style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "monospace" }}>
            JSON tree
          </span>
          <button onClick={reformat} disabled={!parseResult.ok}
            style={btnStyle(false)}>Reformat</button>
          <button onClick={copyAll} style={btnStyle(false)}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={pasteFromClipboard} style={btnStyle(false)}>Paste</button>
          <button onClick={attemptSave} disabled={!parseResult.ok} style={btnStyle(true)}>Save</button>
        </header>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, padding: 12,
            background: "var(--brand-bg-elevated, rgba(0,0,0,0.4))",
            color: "var(--brand-text, currentColor)",
            border: "none", outline: "none", resize: "none",
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            fontSize: 12, lineHeight: 1.55,
            tabSize: 2,
          }}
          aria-label="BlockTree JSON"
        />

        {error && (
          <p role="alert" style={{
            padding: "8px 12px", margin: 0,
            background: "rgba(239,68,68,0.12)",
            color: "#fecaca", fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            borderTop: "1px solid rgba(239,68,68,0.25)",
          }}>
            {error.line ? `[${error.line}:${error.col}] ` : ""}{error.message}
            <br />
            <span style={{ opacity: 0.6, fontSize: 11 }}>Preview shows last-good tree.</span>
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <header style={{
          padding: "8px 12px", borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.05))",
          fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.6))",
          textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "monospace",
        }}>
          Live preview {error && <span style={{ color: "#fbbf24", marginLeft: 8 }}>(last-good)</span>}
        </header>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {renderPreview ? renderPreview(lastGoodRef.current) : (
            <pre style={{
              padding: 12, fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
              whiteSpace: "pre-wrap", margin: 0,
            }}>
              {`Host page passes a renderPreview(lastGood) to render the live
view here. ${lastGoodRef.current.length} top-level block(s) staged.`}
            </pre>
          )}
        </div>
      </div>

      {confirm && (
        <div role="dialog" aria-label="Confirm save"
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}>
          <div style={{
            width: 480, maxWidth: "92vw", padding: 24,
            background: "var(--brand-bg-elevated, #0b1220)",
            border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
            borderRadius: "var(--brand-radius-md, 12px)",
            color: "var(--brand-text, #f5f3ec)",
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Save tree changes?</h2>
            <p style={{ fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.6))", marginBottom: 16 }}>
              This replaces the page&apos;s BlockTree with the parsed JSON.
            </p>
            <p style={{ fontSize: 12, fontFamily: "monospace", padding: 10, marginBottom: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
              borderRadius: "var(--brand-radius-sm, 4px)",
            }}>{confirm.summary}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirm(null)} style={btnStyle(false)}>Cancel</button>
              <button onClick={commitSave} style={btnStyle(true)}>Save tree</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "5px 10px", fontSize: 11,
    background: primary ? "var(--brand-primary, rgba(56,189,248,0.18))" : "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
    color: primary ? "var(--brand-text, #fff)" : "var(--brand-text, currentColor)",
    border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
    borderRadius: "var(--brand-radius-sm, 4px)",
    cursor: "pointer", fontFamily: "inherit",
  };
}
