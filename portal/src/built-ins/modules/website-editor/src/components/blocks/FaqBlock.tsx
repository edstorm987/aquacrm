"use client";

// FAQ block — accordion-style Q&A. Native <details>/<summary> so it
// works without JS and remains accessible by default.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface FaqItem { question: string; answer: string }

export default function FaqBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Frequently asked";
  const items = (block.props.items as FaqItem[] | undefined) ?? [
    { question: "How long does shipping take?", answer: "Most orders ship within 1–2 business days. UK delivery is 2–3 days; international 5–10." },
    { question: "What's your return policy?", answer: "30 days on unused items in original packaging." },
    { question: "Do you offer wholesale?", answer: "Yes — get in touch and we'll set you up." },
  ];

  return (
    <section data-block-type="faq" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>{heading}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, i) => (
            <details
              key={i}
              style={{
                padding: "16px 20px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <summary style={{ fontSize: 15, fontWeight: 600, cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between" }}>
                {item.question}
                <span style={{ opacity: 0.5, fontSize: 18, transition: "transform 0.2s" }}>+</span>
              </summary>
              <p style={{ fontSize: 14, opacity: 0.75, marginTop: 12, lineHeight: 1.6 }}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
