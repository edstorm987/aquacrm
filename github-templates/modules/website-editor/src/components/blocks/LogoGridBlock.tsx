"use client";

// Logo grid — "as seen in" / "trusted by" row of brand logos.
// Greyscale by default, full colour on hover.

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface LogoItem { src: string; alt: string; href?: string }

export default function LogoGridBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "As featured in";
  const logos = (block.props.logos as LogoItem[] | undefined) ?? [];

  return (
    <section data-block-type="logo-grid" style={{ padding: "48px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        {heading && <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, opacity: 0.55, marginBottom: 24 }}>{heading}</p>}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "32px 48px",
        }}>
          {logos.length === 0 ? (
            <p style={{ opacity: 0.4, fontSize: 13 }}>Add logos in the block&apos;s properties.</p>
          ) : (
            logos.map((logo, i) => {
              const img = (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logo.src}
                  alt={logo.alt}
                  style={{
                    height: 36,
                    width: "auto",
                    filter: "grayscale(100%) brightness(0.9)",
                    opacity: 0.65,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.filter = "none"; e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = "grayscale(100%) brightness(0.9)"; e.currentTarget.style.opacity = "0.65"; }}
                />
              );
              return logo.href
                ? <a key={i} href={logo.href} target="_blank" rel="noopener noreferrer">{img}</a>
                : <span key={i}>{img}</span>;
            })
          )}
        </div>
      </div>
    </section>
  );
}
