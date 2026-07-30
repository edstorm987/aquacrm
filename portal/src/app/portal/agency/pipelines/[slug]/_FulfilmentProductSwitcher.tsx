"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function FulfilmentProductSwitcher({
  activeProduct,
  products,
}: {
  activeProduct?: string;
  products: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();

  return (
    <nav aria-label="Fulfilment view" className="inline-flex min-h-11 items-center rounded-md border border-black/10 bg-white p-1">
      <Link
        href="/portal/agency/pipelines/fulfilment"
        aria-current={!activeProduct ? "page" : undefined}
        className={`inline-flex min-h-9 items-center rounded px-3 text-xs font-semibold ${!activeProduct ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04]"}`}
      >
        Overview
      </Link>
      <select
        aria-label="Product pipeline"
        value={activeProduct ?? ""}
        onChange={event => {
          if (event.target.value) router.push(`/portal/agency/pipelines/fulfilment?product=${encodeURIComponent(event.target.value)}`);
        }}
        className={`min-h-9 max-w-48 rounded border-0 bg-transparent px-2 text-xs font-semibold outline-none ${activeProduct ? "text-black" : "text-black/55"}`}
      >
        <option value="" disabled>Product pipeline</option>
        {products.map(product => <option key={product.key} value={product.key}>{product.label}</option>)}
      </select>
    </nav>
  );
}
