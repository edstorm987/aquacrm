"use client";

// R017 — Breadcrumb navigation. Items render as anchors except the
// last (current page). Optional `auto` mode reads `window.location
// .pathname` and segments by `/`.
//
// issues #143 — auto mode used to read `window.location.pathname` during
// render, so the server produced nothing and the very first client render
// produced a complete nav: a hydration divergence, not progressive
// enhancement. It now takes the path from `usePathname()`, which the router
// knows on BOTH sides — so the two renders agree, the nav is present in the
// server HTML for crawlers and no-JS visitors, and it follows soft
// navigations. Explicit `items` are unaffected and still server-render in full.

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { BlockRenderProps } from "../blockRegistry";

interface Item { label: string; href?: string }

/** Documented auto-mode derivation: segment the path, link all but the last. */
export function breadcrumbItemsFromPath(path: string, homeLabel: string): Item[] {
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
}

export default function BreadcrumbBlock({ block }: BlockRenderProps) {
  const explicit = block.props.items as Item[] | undefined;
  const separator = (block.props.separator as string | undefined) ?? "›";
  const homeLabel = (block.props.homeLabel as string | undefined) ?? "Home";
  const hasExplicit = !!(explicit && explicit.length > 0);

  // `usePathname()` rather than an effect over `window.location`. The effect
  // fixed the hydration divergence by rendering NOTHING on the server, which
  // cost more than it bought: a crawler or a no-JS visitor got no breadcrumb at
  // all, and the nav appeared only after first paint. It also listened for
  // `popstate` alone, so an app-router soft navigation — which uses
  // `pushState` and fires no `popstate` — left a block hoisted into a shared
  // layout showing the PREVIOUS page's trail.
  //
  // The router knows the path on both sides. Server and client agree (so
  // hydration matches), the nav is in the server HTML (so it is crawlable), and
  // the value is reactive across every navigation, soft ones included.
  const autoPath = usePathname();

  const items = useMemo<Item[]>(() => {
    if (explicit && explicit.length > 0) return explicit;
    if (!autoPath) return [];
    return breadcrumbItemsFromPath(autoPath, homeLabel);
  }, [explicit, homeLabel, autoPath]);

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
