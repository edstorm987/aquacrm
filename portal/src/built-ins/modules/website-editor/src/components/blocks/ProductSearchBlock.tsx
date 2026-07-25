"use client";

import { useEffect, useRef, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { formatPrice, type CatalogProduct } from "../useProducts";

// Live storefront search. Calls /api/portal/products?q=… on each keystroke
// (debounced 200ms) and renders an autocomplete dropdown of matches.

export default function ProductSearchBlock({ block, editorMode }: BlockRenderProps) {
  const placeholder = (block.props.placeholder as string | undefined) ?? "Search products…";
  const showPlaceholder = block.props.showPlaceholder !== false;

  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portal/ecommerce/products?q=${encodeURIComponent(q)}&limit=12`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) { setResults([]); return; }
        const data = await res.json();
        setResults((data.items ?? data.products ?? []) as CatalogProduct[]);
      } catch { setResults([]); }
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const style: React.CSSProperties = { position: "relative", width: "100%", maxWidth: 480, ...blockStylesToCss(block.styles) };

  return (
    <div data-block-type="product-search" style={style}>
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={showPlaceholder ? placeholder : ""}
        disabled={editorMode}
        style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "inherit", fontSize: 14, fontFamily: "inherit" }}
      />
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: "rgba(15,15,15,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, zIndex: 50, maxHeight: 320, overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          {results.slice(0, 8).map(p => (
            <a key={p.id} href={`/products/${p.slug}`} style={{ display: "flex", gap: 12, padding: 10, alignItems: "center", color: "inherit", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", background: "rgba(255,255,255,0.04)" }}>
                {p.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", lineHeight: 1.2 }}>{p.name}</p>
                {p.tagline && <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>{p.tagline}</p>}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{formatPrice(p.price)}</p>
            </a>
          ))}
        </div>
      )}
      {open && q.trim() && results.length === 0 && (
        <p style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, padding: 12, fontSize: 12, opacity: 0.6, background: "rgba(15,15,15,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, zIndex: 50 }}>
          No products match &ldquo;{q}&rdquo;
        </p>
      )}
    </div>
  );
}
