"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { clientWorkspaceHref } from "@/lib/clientWorkspace";

interface ServiceOption {
  id: string;
  name: string;
  accentColor?: string;
  stage: string;
  progress: number;
}

export function ClientServiceSwitcher({ clientId, products, selectedProductId, advanced = false }: {
  clientId: string;
  products: ServiceOption[];
  selectedProductId?: string;
  advanced?: boolean;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProducts = useMemo(() => {
    const filtered = normalizedQuery
      ? products.filter(product => `${product.name} ${product.stage}`.toLocaleLowerCase().includes(normalizedQuery))
      : products;
    return [...filtered].sort((left, right) => {
      if (left.id === selectedProductId) return -1;
      if (right.id === selectedProductId) return 1;
      return left.name.localeCompare(right.name);
    });
  }, [normalizedQuery, products, selectedProductId]);

  if (!products.length) {
    return <p className="py-6 text-sm text-black/45">No product is assigned yet. Assign one from the Fulfilment product editor.</p>;
  }

  return (
    <div className="mt-4 grid gap-3">
      {products.length > 4 ? (
        <label className="relative block">
          <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <span className="sr-only">Find an assigned service</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`Find one of ${products.length} services`}
            className="h-10 w-full border border-black/10 bg-white pl-9 pr-10 text-sm text-black/78 outline-none transition focus:border-brand/45 focus:ring-2 focus:ring-brand/10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear service search"
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-black/38 hover:text-black/70"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
      ) : null}

      <div className="grid max-h-[22rem] gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2" aria-label="Assigned product workspaces">
        {visibleProducts.map(product => {
          const active = product.id === selectedProductId || (!selectedProductId && product.id === products[0]?.id);
          return (
            <Link
              id={`product-${product.id}`}
              key={product.id}
              href={clientWorkspaceHref(clientId, "delivery", { product: product.id, mode: advanced ? "advanced" : undefined })}
              aria-current={active ? "true" : undefined}
              className={`min-h-24 border-l-2 px-3 py-3 transition ${active ? "bg-brand/[0.065] ring-1 ring-inset ring-brand/15" : "bg-black/[0.018] hover:bg-black/[0.035]"}`}
              style={{ borderColor: product.accentColor || "var(--brand-primary)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black/78">{product.name}</p>
                  <p className="mt-0.5 truncate text-xs capitalize text-black/42">{product.stage}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-black/65">{product.progress}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden bg-black/[0.07]">
                <div className="h-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, product.progress))}%` }} />
              </div>
            </Link>
          );
        })}
      </div>

      {!visibleProducts.length ? (
        <div className="border border-dashed border-black/12 px-4 py-7 text-center text-sm text-black/45">
          No assigned service matches “{query.trim()}”.
        </div>
      ) : null}
    </div>
  );
}
