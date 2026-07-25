"use client";

// R023 — Find-and-replace modal.
//
// Pure UI: receives a `pages` array (the operator's editing scope),
// runs `findAcrossPages` on every keystroke, surfaces matches
// grouped by page. "Replace all" calls back to the host with a
// fresh BlockTree per page; host commits via its existing
// page-PATCH endpoint.

import { useMemo, useState } from "react";
import {
  findAcrossPages,
  totalMatches,
  replaceInTree,
  type Match,
  type PageMatchSummary,
} from "../../lib/findReplace";
import type { Block } from "../../types/block";

export interface PageInput {
  id: string;
  title: string;
  blocks: Block[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  pages: PageInput[];
  scope: "page" | "variant" | "all";
  onScopeChange: (s: "page" | "variant" | "all") => void;
  // Operator clicks a result row → fires with the page id + the
  // block id so host scrolls + selects.
  onJump?: (pageId: string, blockId: string) => void;
  // Operator hits Replace All — host receives an array of
  // `{ pageId, blocks }` to commit. Confirm modal is shown
  // upstream (we surface count + warning here).
  onReplaceAll: (changes: Array<{ pageId: string; blocks: Block[]; replacements: number }>) => void | Promise<void>;
}

export default function FindReplaceModal({
  open, onClose, pages, scope, onScopeChange, onJump, onReplaceAll,
}: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const summaries = useMemo<PageMatchSummary[]>(() => {
    if (!query) return [];
    return findAcrossPages(pages, query, { caseSensitive, wholeWord });
  }, [pages, query, caseSensitive, wholeWord]);

  const total = totalMatches(summaries);

  async function commitReplaceAll(): Promise<void> {
    setBusy(true);
    try {
      const changes = summaries.map(s => {
        const pg = pages.find(p => p.id === s.pageId)!;
        const result = replaceInTree(pg.blocks, query, replacement, { caseSensitive, wholeWord });
        return { pageId: s.pageId, blocks: result.blocks, replacements: result.replacements };
      }).filter(c => c.replacements > 0);
      await onReplaceAll(changes);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Find and replace"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20"
    >
      <div style={{
        width: 720, maxWidth: "94vw", maxHeight: "76vh",
        background: "var(--brand-bg-elevated, #0b1220)",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--brand-radius-md, 12px)",
        display: "flex", flexDirection: "column",
        color: "var(--brand-text, #f5f3ec)", overflow: "hidden",
      }}>
        <header style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Find and replace</h2>
          <button onClick={onClose} aria-label="Close find-and-replace"
            style={{ background: "transparent", border: "none", color: "var(--brand-text-muted, rgba(255,255,255,0.55))", fontSize: 22, cursor: "pointer" }}
          >×</button>
        </header>

        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find…"
            autoFocus
            style={inputStyle}
          />
          <input
            value={replacement}
            onChange={e => setReplacement(e.target.value)}
            placeholder="Replace with…"
            style={inputStyle}
          />
        </div>

        <div style={{ padding: "0 16px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={toggleLabel}>
            <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
            Case-sensitive
          </label>
          <label style={toggleLabel}>
            <input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} />
            Whole word
          </label>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
            {(["page", "variant", "all"] as const).map(s => (
              <button key={s}
                onClick={() => onScopeChange(s)}
                aria-pressed={scope === s}
                style={chipStyle(scope === s)}
              >{s === "page" ? "This page" : s === "variant" ? "This variant" : "All pages"}</button>
            ))}
          </span>
        </div>

        <p style={{
          padding: "0 16px 8px", fontSize: 12,
          color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
        }}>
          {!query
            ? "Type to search."
            : total === 0
              ? "No matches in scope."
              : `${total} match${total === 1 ? "" : "es"} across ${summaries.length} page${summaries.length === 1 ? "" : "s"}.`}
        </p>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          {summaries.map(s => (
            <div key={s.pageId} style={{ marginBottom: 12 }}>
              <p style={{
                fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em",
                color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
                marginBottom: 4,
              }}>{s.pageTitle} <span style={{ opacity: 0.6 }}>· {s.matches.length}</span></p>
              {s.matches.map((m, i) => (
                <ResultRow key={`${s.pageId}-${i}`} m={m} pageId={s.pageId} onJump={onJump} />
              ))}
            </div>
          ))}
        </div>

        <footer style={{
          padding: "10px 16px", borderTop: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button onClick={onClose} style={btnStyle(false)}>Close</button>
          <button
            onClick={() => total > 0 && setConfirmOpen(true)}
            disabled={total === 0}
            style={btnStyle(true)}
          >
            Replace all{total > 0 ? ` (${total})` : ""}
          </button>
        </footer>
      </div>

      {confirmOpen && (
        <div role="dialog" aria-label="Confirm replace all"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <div style={{
            width: 440, maxWidth: "92vw", padding: 20,
            background: "var(--brand-bg-elevated, #0b1220)",
            border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
            borderRadius: "var(--brand-radius-md, 12px)",
            color: "var(--brand-text, #f5f3ec)",
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Replace all?</h3>
            <p style={{ fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.6))" }}>
              {total} match{total === 1 ? "" : "es"} across {summaries.length} page{summaries.length === 1 ? "" : "s"}
              {total > 50 && <span style={{ display: "block", color: "#fbbf24", marginTop: 4 }}>⚠ Large change ({total} matches) — review carefully.</span>}
            </p>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setConfirmOpen(false)} disabled={busy} style={btnStyle(false)}>Cancel</button>
              <button onClick={commitReplaceAll} disabled={busy} style={btnStyle(true)}>
                {busy ? "Replacing…" : "Replace all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ m, pageId, onJump }: { m: Match; pageId: string; onJump?: (pageId: string, blockId: string) => void }) {
  return (
    <button
      onClick={() => onJump?.(pageId, m.blockId)}
      style={{
        width: "100%", textAlign: "left", padding: "6px 8px",
        background: "var(--brand-bg, rgba(255,255,255,0.02))",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
        borderRadius: "var(--brand-radius-sm, 4px)",
        color: "var(--brand-text, currentColor)",
        cursor: onJump ? "pointer" : "default",
        marginBottom: 4, fontSize: 12,
      }}
    >
      <p style={{ margin: 0, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.55))" }}>
        {m.blockType}.{m.prop} <span style={{ opacity: 0.5 }}>· {m.path}</span>
      </p>
      <p style={{ margin: "2px 0 0 0" }}>{m.snippet}</p>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 13,
  background: "var(--brand-bg, rgba(0,0,0,0.4))",
  color: "var(--brand-text, currentColor)",
  border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
  borderRadius: "var(--brand-radius-sm, 6px)",
};

const toggleLabel: React.CSSProperties = {
  fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.65))",
  display: "inline-flex", alignItems: "center", gap: 6,
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px", fontSize: 11,
    background: active ? "var(--brand-primary, rgba(56,189,248,0.18))" : "var(--brand-bg, rgba(255,255,255,0.05))",
    color: active ? "var(--brand-text, #fff)" : "var(--brand-text-muted, rgba(255,255,255,0.65))",
    border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
    borderRadius: "var(--brand-radius-sm, 4px)",
    cursor: "pointer",
  };
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", fontSize: 12,
    background: primary ? "var(--brand-primary, rgba(56,189,248,0.2))" : "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
    color: primary ? "var(--brand-text, #fff)" : "var(--brand-text, currentColor)",
    border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
    borderRadius: "var(--brand-radius-sm, 6px)",
    cursor: "pointer",
  };
}
