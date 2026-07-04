"use client";

// R017 — Feature comparison table. Header row of plan / column names,
// body rows of feature → cell values. Cells render strings literally
// or boolean-flag glyphs (✓/—) when value === true|false.
//
// Props:
//   {
//     heading?, subheading?,
//     columns: [{ id, label, ctaLabel?, ctaHref?, highlighted? }],
//     rows: [{ feature, values: Record<columnId, string|boolean> }]
//   }

import type { BlockRenderProps } from "../blockRegistry";

interface Column { id: string; label: string; ctaLabel?: string; ctaHref?: string; highlighted?: boolean }
interface Row { feature: string; values: Record<string, string | boolean> }

export default function FeatureComparisonBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const subheading = block.props.subheading as string | undefined;
  const columns = (block.props.columns as Column[] | undefined) ?? [];
  const rows = (block.props.rows as Row[] | undefined) ?? [];

  return (
    <section data-block-type="feature-comparison" style={{ padding: "48px 24px", color: "var(--brand-text, currentColor)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {heading && (
          <h2 style={{ fontFamily: "var(--brand-font-heading, var(--font-playfair, Georgia, serif))", fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{heading}</h2>
        )}
        {subheading && (
          <p style={{ textAlign: "center", color: "var(--brand-text-muted, rgba(255,255,255,0.55))", marginBottom: 32, fontSize: 14 }}>{subheading}</p>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.08))" }}></th>
                {columns.map(c => (
                  <th key={c.id} style={{
                    padding: 12, textAlign: "center",
                    background: c.highlighted ? "var(--brand-bg-elevated, rgba(255,255,255,0.05))" : "transparent",
                    borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
                    borderTop: c.highlighted ? "2px solid var(--brand-primary, #0ea5e9)" : "none",
                    fontFamily: "var(--brand-font-heading, inherit)",
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{c.label}</div>
                    {c.ctaLabel && c.ctaHref && (
                      <a href={c.ctaHref} style={{
                        display: "inline-block", marginTop: 8, padding: "6px 12px", fontSize: 12,
                        background: c.highlighted ? "var(--brand-primary, #0ea5e9)" : "var(--brand-bg-elevated, rgba(255,255,255,0.06))",
                        color: c.highlighted ? "var(--brand-text, #fff)" : "var(--brand-text, currentColor)",
                        border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
                        borderRadius: "var(--brand-radius-sm, 6px)",
                        textDecoration: "none", fontWeight: 500,
                      }}>{c.ctaLabel}</a>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <th scope="row" style={{ textAlign: "left", padding: 12, fontWeight: 500, color: "var(--brand-text, currentColor)", borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))" }}>{row.feature}</th>
                  {columns.map(c => {
                    const v = row.values?.[c.id];
                    const cellStyle: React.CSSProperties = {
                      padding: 12, textAlign: "center",
                      background: c.highlighted ? "var(--brand-bg-elevated, rgba(255,255,255,0.03))" : "transparent",
                      borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
                    };
                    if (v === true) return <td key={c.id} style={{ ...cellStyle, color: "var(--brand-primary, #34d399)" }}>✓</td>;
                    if (v === false || v == null) return <td key={c.id} style={{ ...cellStyle, color: "var(--brand-text-muted, rgba(255,255,255,0.35))" }}>—</td>;
                    return <td key={c.id} style={cellStyle}>{String(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
