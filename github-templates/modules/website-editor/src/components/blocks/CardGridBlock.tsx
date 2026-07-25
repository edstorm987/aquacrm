"use client";

// Card grid — generic 2/3/4-column card layout. Each card has
// image + title + body + optional link. More flexible than
// FeatureGrid (allows imagery) and less commerce-specific than
// ProductGrid.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Card {
  imageUrl?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

// Notion-style card item used by the Aqua Incubator template (chapter
// §15a). When `items` is set, the block renders in Notion mode (cover
// image + emoji icon + label + full-card link).
interface NotionItem {
  coverImg?: string;
  icon?: string;
  label: string;
  href: string;
}

export default function CardGridBlock({ block }: BlockRenderProps) {
  const heading = block.props.heading as string | undefined;
  const subheading = block.props.subheading as string | undefined;
  const columns = (block.props.columns as number | undefined) ?? 3;
  const cards = (block.props.cards as Card[] | undefined) ?? [];
  const items = block.props.items as NotionItem[] | undefined;

  if (items && Array.isArray(items)) {
    const minCol = columns === 2 ? 320 : 240;
    return (
      <section data-block-type="card-grid" data-mode="notion" style={{ padding: "32px 24px", color: "var(--inc-text, currentColor)", ...blockStylesToCss(block.styles) }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {heading && (
            <h2 style={{
              fontFamily: "var(--font-playfair, Georgia, serif)",
              color: "var(--inc-heading, currentColor)",
              fontSize: 22, fontWeight: 600, marginBottom: 18, opacity: 0.8,
            }}>
              {heading}
            </h2>
          )}
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(${minCol}px, 1fr))`,
            gap: 16,
          }}>
            {items.map((it, i) => (
              <a
                key={i}
                href={it.href}
                style={{
                  borderRadius: 12,
                  background: "var(--inc-card-bg, rgba(255,255,255,0.03))",
                  border: "1px solid var(--inc-card-border, rgba(255,255,255,0.08))",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {it.coverImg && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={it.coverImg} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }} />
                )}
                <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  {it.icon && <span aria-hidden="true" style={{ fontSize: 20 }}>{it.icon}</span>}
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--inc-heading, currentColor)" }}>{it.label}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-block-type="card-grid" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {(heading || subheading) && (
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            {heading && <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{heading}</h2>}
            {subheading && <p style={{ opacity: 0.65, fontSize: 14 }}>{subheading}</p>}
          </div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${columns >= 4 ? 220 : 280}px, 1fr))`,
          gap: 16,
        }}>
          {cards.length === 0 ? (
            <p style={{ opacity: 0.4, fontSize: 13, gridColumn: "1 / -1", textAlign: "center" }}>
              Add cards in the block&apos;s properties.
            </p>
          ) : cards.map((card, i) => (
            <article
              key={i}
              style={{
                borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {card.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={card.imageUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }} />
              )}
              <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{card.title}</h3>
                {card.body && <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5, flex: 1 }}>{card.body}</p>}
                {card.ctaLabel && card.ctaHref && (
                  <a
                    href={card.ctaHref}
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      color: "var(--brand-accent, #ff6b35)",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    {card.ctaLabel} →
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
