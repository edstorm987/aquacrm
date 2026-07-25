"use client";

// Storefront "featured products" rail. Used by editor blocks.

import type { Product } from "../lib/products";
import { useCart } from "../context/CartContext";

export interface FeaturedProductsProps {
  products: Product[];
  title?: string;
  productHrefBase?: string;
}

export function FeaturedProducts({ products, title = "Featured", productHrefBase = "" }: FeaturedProductsProps) {
  const cart = useCart();
  const visible = products.filter(p => !p.hidden && !p.archived).slice(0, 6);
  if (visible.length === 0) return null;
  return (
    <section className="ecom-featured">
      <h2>{title}</h2>
      <ul className="ecom-featured-grid">
        {visible.map(p => (
          <li key={p.slug}>
            <a href={`${productHrefBase}/${p.slug}`}>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt={p.name} />
              )}
              <span>{p.name}</span>
              <span>£{(p.price / 100).toFixed(2)}</span>
            </a>
            <button
              type="button"
              onClick={() => cart.addItem({
                id: p.slug,
                name: p.name,
                price: p.price,
                stockSku: p.stockSku,
                image: p.image,
              })}
            >
              + Cart
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
