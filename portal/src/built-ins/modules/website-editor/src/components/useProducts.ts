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
import { ecommerceApiUrl, ecommerceStorefrontScope } from "./storefrontCommerceScope";

export interface CatalogProduct {
  slug: string;
  id: string;
  range?: string;
  name: string;
  tagline?: string;
  price: number;
  salePrice?: number;
  onSale?: boolean;
  image?: string;
  rating?: number;
  reviewCount?: number;
  currency?: string;
  available?: number;
  digital?: boolean;
  options?: Array<{
    id: string;
    name: string;
    displayType: "swatch" | "color-wheel" | "size" | "text" | "image";
    values: Array<{ id: string; label: string; hexColor?: string; image?: string; available?: boolean }>;
  }>;
  variants?: Array<{
    id: string;
    optionValues: Record<string, string>;
    price: number;
    salePrice?: number;
    image?: string;
    sku?: string;
    available?: number;
  }>;
}

interface CatalogResponse {
  count?: number;
  items?: CatalogProduct[];
  products?: CatalogProduct[];
}

const cache = new Map<string, CatalogProduct[]>();
const inflight = new Map<string, Promise<CatalogProduct[]>>();

const CATALOG_URL = "/api/portal/ecommerce/products";

function browserStoreKey(): string {
  if (typeof window === "undefined") return "server:v1";
  const clientId = ecommerceStorefrontScope()?.clientId
    ?? window.location.pathname.match(/\/portal\/clients\/([^/]+)/)?.[1]
    ?? "published";
  return `${window.location.origin}:${clientId}:v1`;
}

export async function fetchCatalog(storeKey = browserStoreKey()): Promise<CatalogProduct[]> {
  const stored = cache.get(storeKey);
  if (stored) return stored;
  const pending = inflight.get(storeKey);
  if (pending) return pending;
  const request = fetch(ecommerceApiUrl(CATALOG_URL), { cache: "no-store", credentials: "include" })
    .then(r => r.json() as Promise<CatalogResponse>)
    .then(data => {
      const products = data.products ?? data.items ?? [];
      cache.set(storeKey, products);
      inflight.delete(storeKey);
      return products;
    })
    .catch(() => { inflight.delete(storeKey); return [] as CatalogProduct[]; });
  inflight.set(storeKey, request);
  return request;
}

export function useCatalog(): { products: CatalogProduct[]; loading: boolean } {
  const storeKey = browserStoreKey();
  const [products, setProducts] = useState<CatalogProduct[]>(cache.get(storeKey) ?? []);
  const [loading, setLoading] = useState(!cache.has(storeKey));
  useEffect(() => {
    let cancelled = false;
    const stored = cache.get(storeKey);
    if (stored) { setProducts(stored); setLoading(false); return; }
    void fetchCatalog(storeKey).then(items => {
      if (cancelled) return;
      setProducts(items);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [storeKey]);
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
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `£${(amount / 100).toFixed(2)}`;
  }
}

export function invalidateCatalogCache(storeKey?: string) {
  if (storeKey) cache.delete(storeKey);
  else cache.clear();
}

// Round-1 compatibility shim: the existing manifest re-exports a hook
// named `useProducts`. Map it to `useCatalog` so existing callers keep
// working until they're migrated to the per-block hooks above.
export const useProducts = useCatalog;
