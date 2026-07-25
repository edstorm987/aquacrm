"use client";

// Tabs block — horizontal tab strip with content panels. Common for
// product specs, FAQs in compact mode, comparison tables.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Tab { label: string; content: string }

export default function TabsBlock({ block }: BlockRenderProps) {
  const tabs = (block.props.tabs as Tab[] | undefined) ?? [
    { label: "Description", content: "Describe the product here." },
    { label: "Ingredients", content: "Shea butter, cocoa butter, palm oil…" },
    { label: "Shipping",    content: "Most orders ship within 1–2 business days." },
  ];
  const [active, setActive] = useState(0);
  const tab = tabs[active];

  return (
    <section data-block-type="tabs" style={{ padding: "32px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 16 }}>
          {tabs.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: i === active ? "2px solid var(--brand-accent, #ff6b35)" : "2px solid transparent",
                color: i === active ? "inherit" : "rgba(255,255,255,0.55)",
                fontSize: 13,
                fontWeight: i === active ? 600 : 400,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab && (
          <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6, padding: "8px 4px" }}>
            {tab.content}
          </div>
        )}
      </div>
    </section>
  );
}
