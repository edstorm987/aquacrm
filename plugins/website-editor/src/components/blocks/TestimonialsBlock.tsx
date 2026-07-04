"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Testimonial { quote: string; author: string; role?: string; avatar?: string; }

export default function TestimonialsBlock({ block }: BlockRenderProps) {
  const title = (block.props.title as string | undefined) ?? "";
  const items = (block.props.items as Testimonial[] | undefined) ?? [];
  const style = { padding: "64px 24px", ...blockStylesToCss(block.styles) };
  return (
    <section data-block-type="testimonials" style={style}>
      {title && (
        <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", textAlign: "center", marginBottom: 32, fontWeight: 700, lineHeight: 1.15 }}>
          {title}
        </h2>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, maxWidth: 1200, margin: "0 auto" }}>
        {items.map((t, i) => (
          <figure key={i} style={{ margin: 0, padding: 24, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <blockquote style={{ margin: 0, fontStyle: "italic", lineHeight: 1.5, fontSize: 15 }}>
              “{t.quote}”
            </blockquote>
            <figcaption style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
              {t.avatar && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.avatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
              )}
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{t.author}</p>
                {t.role && <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>{t.role}</p>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
