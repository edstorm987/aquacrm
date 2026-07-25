"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface NavLink { label: string; href: string; }

export default function NavbarBlock({ block }: BlockRenderProps) {
  const brand = (block.props.brand as string | undefined) ?? "Brand";
  const links = (block.props.links as NavLink[] | undefined) ?? [];
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "";
  const ctaHref = (block.props.ctaHref as string | undefined) ?? "#";

  const id = `nav-${block.id}`;
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "16px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    ...blockStylesToCss(block.styles),
  };

  const responsiveCss = `
    [data-nav-id="${id}"] .nav-links { display: flex; gap: 24px; list-style: none; margin: 0; padding: 0; }
    @media (max-width: 768px) {
      [data-nav-id="${id}"] .nav-links { gap: 16px; flex-wrap: wrap; justify-content: center; }
      [data-nav-id="${id}"] .nav-links a { font-size: 13px; }
    }
    @media (max-width: 520px) {
      [data-nav-id="${id}"] { flex-wrap: wrap; gap: 12px; }
      [data-nav-id="${id}"] .nav-links { width: 100%; order: 3; }
    }
  `;

  return (
    <nav data-block-type="navbar" data-nav-id={id} style={style}>
      <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      <a href="/" style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 18, fontWeight: 700, textDecoration: "none", color: "inherit" }}>
        {brand}
      </a>
      <ul className="nav-links">
        {links.map((l, i) => (
          <li key={i}>
            <a href={l.href} style={{ fontSize: 14, opacity: 0.85, textDecoration: "none", color: "inherit" }}>{l.label}</a>
          </li>
        ))}
      </ul>
      {ctaLabel && (
        <a href={ctaHref} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
          {ctaLabel}
        </a>
      )}
    </nav>
  );
}
