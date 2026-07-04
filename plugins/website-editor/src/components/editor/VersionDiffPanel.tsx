"use client";

// R034 — Version diff panel.
//
// Side-by-side view comparing two saved versions of a page. Top
// strip: summary chips (added / removed / modified). Mode toggle:
// "Visual" (block-tree diff coloured by id) vs "JSON" (line-by-line
// diff over `JSON.stringify(blocks, null, 2)`).
//
// Pure presentational — host page passes the two trees in (it
// already fetched them for the Versions menu).

import { useMemo, useState } from "react";
import type { Block } from "../../types/block";
import {
  diffTrees, jsonLineDiff, summariseDiff,
  type LineDiffEntry,
} from "../../lib/blockTreeDiff";

export interface VersionDiffPanelProps {
  treeA: Block[];
  treeB: Block[];
  labelA?: string;
  labelB?: string;
  onClose?: () => void;
}

export default function VersionDiffPanel({
  treeA, treeB, labelA = "Old", labelB = "Current", onClose,
}: VersionDiffPanelProps) {
  const [mode, setMode] = useState<"visual" | "json">("visual");

  const diff = useMemo(() => diffTrees(treeA, treeB), [treeA, treeB]);
  const summary = useMemo(() => summariseDiff(diff), [diff]);
  const jsonA = useMemo(() => JSON.stringify(treeA, null, 2), [treeA]);
  const jsonB = useMemo(() => JSON.stringify(treeB, null, 2), [treeB]);
  const lineDiff = useMemo(
    () => mode === "json" ? jsonLineDiff(jsonA, jsonB) : [],
    [mode, jsonA, jsonB],
  );

  return (
    <div data-component="version-diff-panel"
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header strip */}
      <header style={{
        display: "flex", alignItems: "center", gap: 8, padding: 10,
        borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        flexWrap: "wrap",
      }}>
        <strong style={{ fontSize: 13 }}>Diff: {labelA} → {labelB}</strong>
        <Chip label="added" count={summary.addedCount} color="#34d399" />
        <Chip label="removed" count={summary.removedCount} color="#fca5a5" />
        <Chip label="modified" count={summary.modifiedCount} color="#fbbf24" />
        {summary.unchanged && (
          <span data-testid="diff-unchanged"
            style={{ fontSize: 11, color: "var(--brand-text-muted, rgba(255,255,255,0.55))" }}>
            No structural changes
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <ModeButton active={mode === "visual"} onClick={() => setMode("visual")}>Visual</ModeButton>
          <ModeButton active={mode === "json"} onClick={() => setMode("json")}>JSON</ModeButton>
          {onClose && <ModeButton onClick={onClose}>Close</ModeButton>}
        </div>
      </header>

      {/* Panes */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--brand-border, rgba(255,255,255,0.1))" }}>
        {mode === "visual" ? (
          <>
            <Pane label={labelA} blocks={treeA} highlightIds={collectHighlight(diff, "a")} />
            <Pane label={labelB} blocks={treeB} highlightIds={collectHighlight(diff, "b")} />
          </>
        ) : (
          <JsonDiffView entries={lineDiff} />
        )}
      </div>
    </div>
  );
}

function Chip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span data-testid={`diff-chip-${label}`}
      style={{
        fontSize: 11, padding: "2px 8px", borderRadius: 999,
        background: count === 0 ? "rgba(255,255,255,0.05)" : `${color}22`,
        color: count === 0 ? "var(--brand-text-muted, rgba(255,255,255,0.5))" : color,
        border: `1px solid ${count === 0 ? "rgba(255,255,255,0.08)" : color}55`,
      }}>
      {count} {label}
    </span>
  );
}

function ModeButton({ active, onClick, children }: {
  active?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      style={{
        fontSize: 11, padding: "3px 10px",
        background: active ? "var(--brand-primary, rgba(56,189,248,0.18))" : "transparent",
        color: "var(--brand-text, currentColor)",
        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
        borderRadius: "var(--brand-radius-sm, 4px)",
        cursor: "pointer",
      }}>
      {children}
    </button>
  );
}

interface PaneProps { label: string; blocks: Block[]; highlightIds: Map<string, string> }

function Pane({ label, blocks, highlightIds }: PaneProps) {
  return (
    <section data-testid={`diff-pane-${label}`}
      style={{
        background: "var(--brand-bg, #0b1220)", padding: 12,
        overflow: "auto", fontSize: 12, lineHeight: 1.5,
      }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-text-muted, rgba(255,255,255,0.5))" }}>{label}</h3>
      {blocks.length === 0 && (
        <p style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.4))" }}>(empty tree)</p>
      )}
      {blocks.map(b => (
        <BlockRow key={b.id} block={b} depth={0} highlightIds={highlightIds} />
      ))}
    </section>
  );
}

function BlockRow({ block, depth, highlightIds }: { block: Block; depth: number; highlightIds: Map<string, string> }) {
  const tone = highlightIds.get(block.id);
  const bg = tone === "added" ? "rgba(52,211,153,0.12)"
    : tone === "removed" ? "rgba(252,165,165,0.12)"
    : tone === "modified" ? "rgba(251,191,36,0.12)"
    : "transparent";
  return (
    <>
      <div data-block-id={block.id} data-tone={tone ?? "same"}
        style={{
          padding: "2px 6px", marginLeft: depth * 12,
          background: bg, borderRadius: 4,
          fontFamily: "ui-monospace, monospace",
        }}>
        <span style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.55))" }}>{block.id}</span>{" "}
        <span>{block.type}</span>
      </div>
      {(block.children ?? []).map(c => (
        <BlockRow key={c.id} block={c} depth={depth + 1} highlightIds={highlightIds} />
      ))}
    </>
  );
}

function collectHighlight(diff: ReturnType<typeof diffTrees>, side: "a" | "b"): Map<string, string> {
  const m = new Map<string, string>();
  if (side === "b") for (const b of diff.added) m.set(b.id, "added");
  if (side === "a") for (const b of diff.removed) m.set(b.id, "removed");
  for (const r of diff.modified) m.set(r.id, "modified");
  return m;
}

function JsonDiffView({ entries }: { entries: LineDiffEntry[] }) {
  return (
    <pre data-testid="diff-json-view"
      style={{
        gridColumn: "1 / span 2",
        background: "var(--brand-bg, #0b1220)", margin: 0, padding: 12,
        overflow: "auto", fontSize: 12, lineHeight: 1.45,
        fontFamily: "ui-monospace, monospace",
      }}>
      {entries.map((e, idx) => {
        const bg = e.kind === "add" ? "rgba(52,211,153,0.12)"
          : e.kind === "remove" ? "rgba(252,165,165,0.12)"
          : "transparent";
        const sigil = e.kind === "add" ? "+" : e.kind === "remove" ? "-" : " ";
        return (
          <div key={idx} data-line-kind={e.kind}
            style={{ background: bg, padding: "0 6px", whiteSpace: "pre-wrap" }}>
            <span style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.4))", display: "inline-block", width: 36 }}>
              {(e.lineA ?? "").toString().padStart(3, " ")}
              {" "}
              {(e.lineB ?? "").toString().padStart(3, " ")}
            </span>
            <span>{sigil} {e.text}</span>
          </div>
        );
      })}
    </pre>
  );
}
