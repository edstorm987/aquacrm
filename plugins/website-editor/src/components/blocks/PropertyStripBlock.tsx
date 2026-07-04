"use client";

// PropertyStrip — Notion-style key-value rows in a disclosure.
// Chapter §15a row 4 ("X more properties" disclosure exposing date /
// status / tags / phase / etc.). Rendered with native <details> so
// keyboard + screen-readers work without custom JS.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface PropRow {
  key: string;
  type: "phase" | "select" | "date" | "text" | "url";
  value: string;
}

export default function PropertyStripBlock({ block }: BlockRenderProps) {
  const rows = (block.props.rows as PropRow[] | undefined) ?? [];
  const collapsedLabel = (block.props.collapsedLabel as string | undefined)
    ?? `${rows.length} more propert${rows.length === 1 ? "y" : "ies"}`;

  return (
    <section data-block-type="property-strip" style={{ padding: "8px 24px", color: "var(--inc-text, currentColor)", ...blockStylesToCss(block.styles) }}>
      <details style={{ maxWidth: 720, margin: "0 auto" }}>
        <summary style={{
          fontSize: 13, opacity: 0.6, cursor: "pointer", listStyle: "none",
          padding: "8px 0",
          borderBottom: "1px solid var(--inc-divider, rgba(255,255,255,0.06))",
        }}>
          ▾ {collapsedLabel}
        </summary>
        <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(120px, max-content) 1fr", gap: "8px 16px" }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "contents" }}>
              <dt style={{ fontSize: 13, opacity: 0.55 }}>{r.key}</dt>
              <dd style={{ margin: 0, fontSize: 13 }}>
                <PropertyValue type={r.type} value={r.value} />
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

function PropertyValue({ type, value }: { type: PropRow["type"]; value: string }) {
  if (type === "phase" || type === "select") {
    return (
      <span style={{
        display: "inline-block", padding: "2px 8px", borderRadius: 4,
        background: "var(--inc-chip-bg, rgba(255,255,255,0.06))",
        color: "var(--inc-chip-text, currentColor)",
        fontSize: 12, fontWeight: 500,
      }}>{value}</span>
    );
  }
  if (type === "url") {
    return (
      <a href={value} target="_blank" rel="noreferrer"
        style={{ color: "var(--inc-link, var(--brand-accent, #ff6b35))", textDecoration: "underline" }}
      >{value}</a>
    );
  }
  return <span>{value}</span>;
}
