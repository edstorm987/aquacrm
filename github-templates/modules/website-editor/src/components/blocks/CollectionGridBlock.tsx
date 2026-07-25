"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

export default function CollectionGridBlock({ block }: BlockRenderProps) {
  const showFilters = block.props.showFilters !== false;

  const style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: showFilters ? "240px 1fr" : "1fr",
    gap: 32,
    width: "100%",
    ...blockStylesToCss(block.styles),
  };

  return (
    <div data-block-type="collection-grid" style={style}>
      {showFilters && (
        <aside style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
          <p style={{ textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 10, opacity: 0.5, marginBottom: 12 }}>Filters</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["Category", "Price", "Availability"].map(label => (
              <details key={label} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, opacity: 0.85 }}>{label}</summary>
                <p style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>Live filter UI ships at runtime.</p>
              </details>
            ))}
          </div>
        </aside>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <article key={i} style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ aspectRatio: "1/1", background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: 8 }} />
            <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 2px" }}>Item {i + 1}</p>
            <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>£0.00</p>
          </article>
        ))}
      </div>
    </div>
  );
}
