"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface FooterLink { label: string; href: string; }
interface FooterColumn { title: string; links: FooterLink[]; }

export default function FooterBlock({ block }: BlockRenderProps) {
  const brand = (block.props.brand as string | undefined) ?? "Brand";
  const tagline = (block.props.tagline as string | undefined) ?? "";
  const columns = (block.props.columns as FooterColumn[] | undefined) ?? [];

  const style: React.CSSProperties = {
    width: "100%",
    padding: "48px 24px 24px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.4)",
    ...blockStylesToCss(block.styles),
  };

  // Responsive grid: auto-fit columns instead of a fixed `1fr repeat(N, 1fr)`
  // template so the footer collapses cleanly on narrow viewports without
  // an overflow scroll. Per-instance scoped CSS — keeps the inline style
  // story consistent with the rest of the block components.
  const id = `footer-${block.id}`;
  const responsiveCss = `
    [data-footer-id="${id}"] .footer-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 2fr repeat(${Math.max(1, columns.length)}, 1fr);
      gap: 32px;
    }
    @media (max-width: 768px) {
      [data-footer-id="${id}"] .footer-inner {
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
      }
    }
    @media (max-width: 480px) {
      [data-footer-id="${id}"] .footer-inner {
        grid-template-columns: 1fr;
        gap: 20px;
      }
      [data-footer-id="${id}"] .footer-brand {
        text-align: center;
      }
    }
  `;

  return (
    <footer data-block-type="footer" data-footer-id={id} style={style}>
      <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      <div className="footer-inner">
        <div className="footer-brand">
          <p style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>{brand}</p>
          {tagline && <p style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5, margin: 0 }}>{tagline}</p>}
        </div>
        {columns.map((col, i) => (
          <div key={i}>
            <p style={{ textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 10, opacity: 0.5, marginBottom: 12 }}>{col.title}</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {col.links.map((l, j) => (
                <li key={j}>
                  <a href={l.href} style={{ fontSize: 13, opacity: 0.75, textDecoration: "none", color: "inherit" }}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11, opacity: 0.4, textAlign: "center" }}>
        © {new Date().getFullYear()} {brand}
      </p>
    </footer>
  );
}
