"use client";

// Storefront product detail. Stripped-down port of the 02 component —
// the full visual treatment lives in T3's editor blocks (rendered by
// type id from this plugin's `storefront.blocks` registration). This
// component is the headless presentation that storefronts use directly
// when they don't go through the editor.

import { useState } from "react";

import type { Product } from "../lib/products";
import { useCart } from "../context/CartContext";
import { ProductVariantPicker } from "./ProductVariantPicker";
import {
  defaultSelection,
  resolveVariant,
  type ResolvedVariant,
} from "../lib/variants";

export interface ProductDetailProps {
  product: Product;
}

export function ProductDetail({ product }: ProductDetailProps) {
  const cart = useCart();
  const [resolved, setResolved] = useState<ResolvedVariant>(() =>
    resolveVariant(product, { selection: defaultSelection(product.options ?? []) }),
  );

  function addToCart(): void {
    cart.addItem({
      id: resolved.variant?.id ?? product.slug,
      name: product.name,
      price: resolved.price,
      stockSku: resolved.variant?.sku ?? product.stockSku,
      variant: resolved.description || undefined,
      shopifyVariantId: undefined,
      variantId: resolved.variant?.id,
      image: resolved.image ?? product.image,
      customHex: resolved.customHex,
    });
  }

  return (
    <article className="ecom-product-detail">
      <header className="ecom-product-detail-header">
        {(resolved.image ?? product.image) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolved.image ?? product.image} alt={product.name} className="ecom-product-detail-image" />
        )}
        <div>
          <h1>{product.name}</h1>
          {product.tagline && <p className="ecom-product-tagline">{product.tagline}</p>}
          <p className="ecom-product-detail-price">£{(resolved.price / 100).toFixed(2)}</p>
        </div>
      </header>

      {product.description && product.description.length > 0 && (
        <section className="ecom-product-description">
          {product.description.map((line, i) => <p key={i}>{line}</p>)}
        </section>
      )}

      <ProductVariantPicker product={product} onChange={setResolved} />

      <div className="ecom-product-detail-actions">
        <button
          type="button"
          className="ecom-add-to-cart"
          onClick={addToCart}
          disabled={typeof resolved.available === "number" && resolved.available <= 0}
        >
          {typeof resolved.available === "number" && resolved.available <= 0
            ? "Sold out"
            : `Add to cart — £${(resolved.price / 100).toFixed(2)}`}
        </button>
      </div>

      {product.shortBullets && product.shortBullets.length > 0 && (
        <ul className="ecom-product-bullets">
          {product.shortBullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </article>
  );
}
