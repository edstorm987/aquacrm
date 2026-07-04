"use client";

// Storefront product grid. Lightweight port of `02/.../components/Shop.tsx`.

import { useState } from "react";

import type { Product } from "../lib/products";
import { useCart } from "../context/CartContext";

export interface ShopProps {
  products: Product[];
  productHrefBase?: string;       // e.g. "/shop"
}

export function Shop({ products, productHrefBase = "" }: ShopProps) {
  const cart = useCart();
  const [query, setQuery] = useState("");
  const filtered = products.filter(p => {
    if (p.hidden || p.archived) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
  });

  return (
    <section className="ecom-shop">
      <header>
        <input
          type="search"
          placeholder="Search products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search products"
        />
      </header>
      <ul className="ecom-shop-grid">
        {filtered.map(p => (
          <li key={p.slug} className="ecom-shop-card">
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt={p.name} />
            )}
            <h3>{p.name}</h3>
            {p.tagline && <p>{p.tagline}</p>}
            <p className="ecom-shop-card-price">£{(p.price / 100).toFixed(2)}</p>
            <div className="ecom-shop-card-actions">
              <a href={`${productHrefBase}/${p.slug}`}>Details</a>
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
                Add to cart
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
