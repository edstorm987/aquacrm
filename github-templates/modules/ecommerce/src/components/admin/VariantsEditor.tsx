"use client";

import { useState } from "react";

import type { Product, ProductOption, ProductVariant } from "../../lib/products";
import { makeId } from "../../lib/ids";

export interface VariantsEditorProps {
  product: Product;
  apiBase: string;
}

export function VariantsEditor({ product: initial, apiBase }: VariantsEditorProps) {
  const [product, setProduct] = useState<Product>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = product.options ?? [];
  const variants = product.variants ?? [];

  function setOptions(next: ProductOption[]): void {
    setProduct(p => ({ ...p, options: next }));
  }

  function setVariants(next: ProductVariant[]): void {
    setProduct(p => ({ ...p, variants: next }));
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/products`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(product),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ecom-variants-editor">
      <header><h1>{product.name} — variants</h1></header>

      <h2>Options ({options.length})</h2>
      <ul>
        {options.map((opt, i) => (
          <li key={opt.id} className="ecom-row">
            <input
              value={opt.name}
              onChange={(e) => setOptions(options.map((o, j) => j === i ? { ...o, name: e.target.value } : o))}
              disabled={busy}
            />
            <select
              value={opt.displayType}
              onChange={(e) => setOptions(options.map((o, j) => j === i ? { ...o, displayType: e.target.value as ProductOption["displayType"] } : o))}
              disabled={busy}
            >
              <option value="size">Size</option>
              <option value="swatch">Swatch</option>
              <option value="color-wheel">Colour wheel</option>
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
            <input
              value={opt.values.map(v => v.label).join(",")}
              onChange={(e) => setOptions(options.map((o, j) => j === i ? {
                ...o,
                values: e.target.value.split(",").map(s => s.trim()).filter(Boolean).map(label => ({ id: label.toLowerCase().replace(/\s+/g, "-"), label })),
              } : o))}
              placeholder="value labels (comma)"
              disabled={busy}
            />
            <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={busy}>×</button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOptions([
          ...options,
          { id: makeId("opt"), name: "New option", displayType: "size", values: [] },
        ])}
        disabled={busy}
      >
        + Add option
      </button>

      <h2>Variants ({variants.length})</h2>
      <p className="ecom-help">Variants are concrete combinations of option values with their own price + SKU.</p>
      <ul>
        {variants.map((v, i) => (
          <li key={v.id} className="ecom-row">
            <input
              value={v.sku ?? ""}
              onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))}
              placeholder="SKU"
              disabled={busy}
            />
            <input
              type="number"
              value={v.price}
              onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))}
              placeholder="price (pence)"
              disabled={busy}
            />
            <input
              value={Object.entries(v.optionValues).map(([k, val]) => `${k}=${val}`).join(",")}
              onChange={(e) => {
                const map: Record<string, string> = {};
                for (const pair of e.target.value.split(",").map(s => s.trim()).filter(Boolean)) {
                  const [k, val] = pair.split("=");
                  if (k && val) map[k] = val;
                }
                setVariants(variants.map((x, j) => j === i ? { ...x, optionValues: map } : x));
              }}
              placeholder="optionId=valueId,…"
              disabled={busy}
            />
            <button type="button" onClick={() => setVariants(variants.filter((_, j) => j !== i))} disabled={busy}>×</button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setVariants([
          ...variants,
          { id: makeId("var"), optionValues: {}, price: product.price },
        ])}
        disabled={busy}
      >
        + Add variant
      </button>

      {error && <p className="ecom-error" role="alert">{error}</p>}
      <div className="ecom-actions-row">
        <button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save variants"}</button>
      </div>
    </section>
  );
}
