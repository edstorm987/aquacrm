"use client";

import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { useProductByHandle, formatPrice } from "../useProducts";

// Renders a single product as a card. When a `productHandle` is set, the
// host pulls live catalog data so the card mirrors the storefront. The
// `title`/`price`/`image` props are used as the editor preview AND as a
// fallback when no live product matches the handle (so screenshots never
// break and the canvas never shows placeholder text post-publish).

export default function ProductCardBlock({ block, editorMode }: BlockRenderProps) {
  const handle    = (block.props.productHandle as string | undefined) ?? "";
  const fbTitle   = (block.props.title as string | undefined) ?? "Product";
  const fbPrice   = (block.props.price as string | undefined) ?? "";
  const fbImage   = (block.props.image as string | undefined) ?? "";
  const ctaLabel  = (block.props.ctaLabel as string | undefined) ?? "Add to cart";

  // Hooks — always called. In editor mode we still fetch so the canvas
  // shows the live image as soon as a handle is set.
  const { product, loading } = useProductByHandle(handle);

  const title = product?.name ?? fbTitle;
  const price = product
    ? (product.onSale && product.salePrice ? formatPrice(product.salePrice) : formatPrice(product.price))
    : fbPrice;
  const image = product?.image || fbImage;
  const href = product ? `/products/${product.slug}` : undefined;

  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    ...blockStylesToCss(block.styles),
  };

  return (
    <article data-block-type="product-card" data-product-handle={handle} style={style}>
      <a href={href} style={{ display: "block", aspectRatio: "1/1", background: "rgba(255,255,255,0.04)", borderRadius: 8, overflow: "hidden", color: "inherit", textDecoration: "none" }}>
        {image
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={image} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, opacity: 0.4 }}>{loading && handle && !editorMode ? "Loading…" : "Product image"}</div>
        }
        {product?.onSale && (
          <span style={{ position: "absolute", top: 8, left: 8, background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>SALE</span>
        )}
      </a>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", lineHeight: 1.3 }}>
          {href ? <a href={href} style={{ color: "inherit", textDecoration: "none" }}>{title}</a> : title}
        </h3>
        {product?.tagline && <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 4px" }}>{product.tagline}</p>}
        <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
          {product?.onSale && product.salePrice
            ? <><span style={{ textDecoration: "line-through", opacity: 0.5, marginRight: 6 }}>{formatPrice(product.price)}</span><span style={{ color: "var(--brand-accent, #ff6b35)", fontWeight: 600 }}>{price}</span></>
            : price}
        </p>
      </div>
      <button
        type="button"
        data-portal-add-to-cart={handle}
        disabled={!handle}
        style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: handle ? "pointer" : "not-allowed", opacity: handle ? 1 : 0.5 }}
      >
        {ctaLabel}
      </button>
    </article>
  );
}
