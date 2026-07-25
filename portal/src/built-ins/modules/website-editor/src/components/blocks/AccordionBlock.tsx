"use client";

// Accordion — vertical stack of collapsible items. Like FAQ but
// designed for content panels, not just Q&A. Default-open prop.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface AccordionItem { title: string; content: string; defaultOpen?: boolean }

export default function AccordionBlock({ block }: BlockRenderProps) {
  const items = (block.props.items as AccordionItem[] | undefined) ?? [
    { title: "What is included?",    content: "All the things." },
    { title: "How does it work?",     content: "Like this." },
    { title: "Can I cancel?",        content: "Any time." },
  ];

  return (
    <section data-block-type="accordion" style={{ padding: "32px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          <details
            key={i}
            open={item.defaultOpen}
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <summary style={{
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>{item.title}</span>
              <span style={{ opacity: 0.5 }}>+</span>
            </summary>
            <div style={{ fontSize: 14, opacity: 0.75, marginTop: 12, lineHeight: 1.6 }}>
              {item.content}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
