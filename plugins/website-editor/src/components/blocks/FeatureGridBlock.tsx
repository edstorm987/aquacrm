"use client";

// Feature grid — 3 or 4 column grid of icon + title + body.
// Universal "what you get" / "how it works" / "why us" block.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Feature { icon?: string; title: string; body: string }

export default function FeatureGridBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "What's included";
  const subheading = (block.props.subheading as string | undefined);
  const columns = (block.props.columns as number | undefined) ?? 3;
  const features = (block.props.features as Feature[] | undefined) ?? [
    { icon: "✦", title: "Crafted by hand",   body: "Every batch made the slow way, in small numbers." },
    { icon: "✦", title: "Pure ingredients",  body: "Nothing synthetic. Nothing tested on animals. Ever." },
    { icon: "✦", title: "Hormone-safe",      body: "Designed for sensitive skin and hormone-aware living." },
  ];

  return (
    <section data-block-type="feature-grid" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>
          {subheading && <p style={{ opacity: 0.65, fontSize: 14 }}>{subheading}</p>}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${columns >= 4 ? 220 : 260}px, 1fr))`,
          gap: 24,
        }}>
          {features.map((f, i) => (
            <article key={i} style={{ textAlign: "center" }}>
              {f.icon && (
                <div style={{
                  fontSize: 28, marginBottom: 12,
                  color: "var(--brand-accent, #ff6b35)",
                }}>
                  {f.icon}
                </div>
              )}
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.6 }}>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
