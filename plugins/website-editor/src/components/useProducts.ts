"use client";

// Lightweight client cache + hook for fetching catalog products from
// the ecommerce plugin's API. The visual editor's commerce blocks call
// these to swap their placeholder thumbnails + prices for live data
// when rendered on the host. Cached per-process to avoid re-fetching
// across blocks on the same page.
//
// Faithful port of `02/src/components/editor/useProducts.ts`. The
// catalog endpoint resolves to `/api/portal/ecommerce/products` —
// served by the ecommerce plugin (T2). Round-2 commerce blocks read
// from this hook; the ecommerce plugin owns the data.

import { useEffect, useState } from "react";

export interface CatalogProduct {
  slug: string;
  id: string;
  range: string;
  name: string;
  tagline?: string;
  price: number;
  salePrice?: number;
  onSale?: boolean;
  image?: string;
  rating?: number;
  reviewCount?: number;
}

interface CatalogResponse {
  count: number;
  items: CatalogProduct[];
}

let cache: CatalogProduct[] | null = null;
let inflight: Promise<CatalogProduct[]> | null = null;

const CATALOG_URL = "/api/portal/ecommerce/products";

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(CATALOG_URL, { cache: "no-store" })
    .then(r => r.json() as Promise<CatalogResponse>)
    .then(data => { cache = data.items ?? []; inflight = null; return cache; })
    .catch(() => { inflight = null; return [] as CatalogProduct[]; });
  return inflight;
}

export function useCatalog(): { products: CatalogProduct[]; loading: boolean } {
  const [products, setProducts] = useState<CatalogProduct[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  useEffect(() => {
    let cancelled = false;
    if (cache) { setProducts(cache); setLoading(false); return; }
    void fetchCatalog().then(items => {
      if (cancelled) return;
      setProducts(items);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);
  return { products, loading };
}

export function useProductByHandle(handle: string): { product: CatalogProduct | null; loading: boolean } {
  const { products, loading } = useCatalog();
  if (!handle) return { product: null, loading };
  const product = products.find(p => p.slug === handle) ?? null;
  return { product, loading };
}

export function useProductsByRange(range: string, limit = 9): { products: CatalogProduct[]; loading: boolean } {
  const { products, loading } = useCatalog();
  if (range === "all" || !range) return { products: products.slice(0, limit), loading };
  return { products: products.filter(p => p.range === range).slice(0, limit), loading };
}

export function formatPrice(amount: number, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `£${amount.toFixed(2)}`;
  }
}

export function invalidateCatalogCache() {
  cache = null;
}

// Round-1 compatibility shim: the existing manifest re-exports a hook
// named `useProducts`. Map it to `useCatalog` so existing callers keep
// working until they're migrated to the per-block hooks above.
export const useProducts = useCatalog;
