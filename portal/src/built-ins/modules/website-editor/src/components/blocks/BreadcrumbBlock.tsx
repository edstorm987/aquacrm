"use client";

// R017 — Breadcrumb navigation. Items render as anchors except the
// last (current page). Optional `auto` mode reads `window.location
// .pathname` and segments by `/`.

import { useMemo } from "react";
import type { BlockRenderProps } from "../blockRegistry";

interface Item { label: string; href?: string }

export default function BreadcrumbBlock({ block }: BlockRenderProps) {
  const explicit = block.props.items as Item[] | undefined;
  const separator = (block.props.separator as string | undefined) ?? "›";
  const homeLabel = (block.props.homeLabel as string | undefined) ?? "Home";

  const items = useMemo<Item[]>(() => {
    if (explicit && explicit.length > 0) return explicit;
    if (typeof window === "undefined") return [];
    const path = window.location.pathname;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return [{ label: homeLabel }];
    const out: Item[] = [{ label: homeLabel, href: "/" }];
    let cur = "";
    for (const s of segments.slice(0, -1)) {
      cur += `/${s}`;
      out.push({ label: s.replace(/-/g, " "), href: cur });
    }
    const last = segments[segments.length - 1]!;
    out.push({ label: last.replace(/-/g, " ") });
    return out;
  }, [explicit, homeLabel]);

  if (items.length === 0) return null;

  return (
    <nav data-block-type="breadcrumb" aria-label="Breadcrumb"
      style={{
        padding: "12px 24px", color: "var(--brand-text-muted, rgba(255,255,255,0.55))",
        fontSize: 12, fontFamily: "var(--brand-font-body, inherit)",
      }}>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", margin: 0, padding: 0, alignItems: "center" }}>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 6, textTransform: "capitalize" }}>
              {it.href && !last
                ? <a href={it.href} style={{ color: "inherit", textDecoration: "none" }}>{it.label}</a>
                : <span aria-current={last ? "page" : undefined} style={{ color: last ? "var(--brand-text, currentColor)" : "inherit", fontWeight: last ? 500 : 400 }}>{it.label}</span>}
              {!last && <span aria-hidden="true" style={{ color: "var(--brand-text-muted, rgba(255,255,255,0.35))" }}>{separator}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
