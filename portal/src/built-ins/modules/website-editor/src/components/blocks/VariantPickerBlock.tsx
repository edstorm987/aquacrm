"use client";

// Variant picker block — embeds the storefront ProductVariantPicker
// inside the visual editor for a configured product handle. Reads live
// catalog data and displays a fully-functional swatch / size / colour
// wheel UI. Editor mode shows a placeholder when no handle is set.

import { useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";
import { useProductByHandle, formatPrice } from "../useProducts";
import ProductVariantPicker, { type Product, type ResolvedVariant } from "../ecommerceBridge";

export default function VariantPickerBlock({ block, editorMode }: BlockRenderProps) {
  const handle = (block.props.productHandle as string | undefined) ?? "";
  const showPrice = block.props.showPrice !== false;
  const showCta = block.props.showCta !== false;
  const ctaLabel = (block.props.ctaLabel as string | undefined) ?? "Add to cart";

  const { product, loading } = useProductByHandle(handle);
  const [resolved, setResolved] = useState<ResolvedVariant | null>(null);

  const style: React.CSSProperties = { width: "100%", ...blockStylesToCss(block.styles) };

  if (!handle) {
    return (
      <div data-block-type="variant-picker" style={{ ...style, padding: 24, border: "1px dashed rgba(255,107,53,0.3)", borderRadius: 12, color: "rgba(255,107,53,0.7)", fontSize: 12, textAlign: "center" }}>
        Variant picker — set a product handle in the right panel
      </div>
    );
  }

  if (loading) {
    return <div data-block-type="variant-picker" style={style}><p style={{ fontSize: 12, opacity: 0.5, padding: 16 }}>Loading product…</p></div>;
  }

  if (!product) {
    return (
      <div data-block-type="variant-picker" style={{ ...style, padding: 24, border: "1px dashed rgba(255,107,53,0.3)", borderRadius: 12, color: "rgba(255,107,53,0.7)", fontSize: 12, textAlign: "center" }}>
        No product matches handle &ldquo;{handle}&rdquo;
      </div>
    );
  }

  const fullProduct = product as unknown as Product;
  const price = resolved?.price ?? fullProduct.price;

  return (
    <div data-block-type="variant-picker" style={style}>
      <ProductVariantPicker
        product={fullProduct}
        onChange={(_state, r) => setResolved(r)}
      />
      {showPrice && (
        <p style={{ marginTop: 16, fontSize: 18, fontWeight: 700 }}>
          {formatPrice(price)}
          {resolved?.isCustom && resolved.customHex && (
            <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.6, fontWeight: 400 }}>
              · custom {resolved.customHex}
            </span>
          )}
        </p>
      )}
      {showCta && (
        <button
          type="button"
          disabled={editorMode}
          data-portal-add-to-cart={handle}
          data-variant-id={resolved?.variant?.id ?? ""}
          data-custom-hex={resolved?.customHex ?? ""}
          style={{ marginTop: 12, padding: "12px 20px", borderRadius: 12, border: "none", background: "var(--brand-accent, #ff6b35)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: editorMode ? "default" : "pointer", width: "100%" }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
