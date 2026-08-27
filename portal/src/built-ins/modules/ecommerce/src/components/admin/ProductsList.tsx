"use client";

import { useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Product } from "../../lib/products";

export interface ProductsListProps {
  products: Product[];
  apiBase: string;
}

export function ProductsList({ products, apiBase }: ProductsListProps) {
  const [query, setQuery] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filtered = products.filter(p => {
    if (!query) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
  });

  async function archiveProduct(slug: string): Promise<void> {
    if (!confirm(`Archive ${slug}? It will leave the storefront but its inventory, collections and order history remain intact.`)) return;
    setBusySlug(slug);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>(
        `${apiBase}/products?slug=${encodeURIComponent(slug)}`,
        { method: "DELETE" },
        {
          fallback: `${slug} could not be archived.`,
          validate: payload => payload.ok === true,
        },
      );
      if (typeof window !== "undefined") window.location.reload();
    } catch (requestError) {
      setError(mutationErrorMessage(requestError, `${slug} could not be archived.`));
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <section className="ecom-products-list">
      <header className="ecom-list-header">
        <div>
          <h1>Products</h1>
          <p>{products.length} product{products.length === 1 ? "" : "s"}</p>
        </div>
        <div className="ecom-list-actions">
          <input
            type="search"
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
          <a className="ecom-button" href="./products/new">+ New product</a>
        </div>
      </header>
      {error && <p role="alert" className="ecom-error">{error}</p>}
      {products.length === 0 ? (
        <div className="ecom-empty" role="status">
          <h3>No products yet</h3>
          <p>Add your first product to start selling. Products appear in the storefront, in collections, and in any product-grid blocks on your portal pages.</p>
          <a className="ecom-button ecom-button-primary" href="./products/new">+ Add a product</a>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ecom-empty" role="status">
          <h3>No matches</h3>
          <p>Nothing matches &ldquo;{query}&rdquo;. Try a different search term.</p>
        </div>
      ) : (
        <ul className="ecom-product-grid">
          {filtered.map(p => (
            <li key={p.slug} className="ecom-product-card" data-archived={p.archived ? "true" : "false"}>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="ecom-product-thumb" />
              )}
              <div className="ecom-product-meta">
                <h3>{p.name}</h3>
                <p className="ecom-product-tagline">{p.tagline}</p>
                <p className="ecom-product-price">£{(p.price / 100).toFixed(2)}</p>
                {p.archived && <span className="ecom-badge">Archived</span>}
                {p.hidden && <span className="ecom-badge">Hidden</span>}
              </div>
              <div className="ecom-product-actions">
                <a href={`./products/${p.slug}`}>Edit</a>
                <a href={`./products/${p.slug}/variants`}>Variants</a>
                {!p.archived && <button type="button" disabled={busySlug === p.slug} onClick={() => archiveProduct(p.slug)} aria-label={`Archive ${p.name}`}>{busySlug === p.slug ? "Archiving…" : "Archive"}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
