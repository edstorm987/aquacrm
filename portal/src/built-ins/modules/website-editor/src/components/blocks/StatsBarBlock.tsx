"use client";

// Stats bar — 3-4 big-number callouts with labels. Common above-fold
// "social proof" block ("500k+ customers", "4.9 stars", "12 years").

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Stat { number: string; label: string }

export default function StatsBarBlock({ block }: BlockRenderProps) {
  const stats = (block.props.stats as Stat[] | undefined) ?? [
    { number: "500k+", label: "Customers" },
    { number: "4.9★",  label: "Average rating" },
    { number: "12yrs", label: "In business" },
    { number: "100%",  label: "Natural" },
  ];
  return (
    <section data-block-type="stats-bar" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{
        maxWidth: 1100,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
        gap: 16,
        textAlign: "center",
      }}>
        {stats.map((s, i) => (
          <div key={i}>
            <p style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 40, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>{s.number}</p>
            <p style={{ fontSize: 12, opacity: 0.65, textTransform: "uppercase", letterSpacing: 1.5 }}>{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
