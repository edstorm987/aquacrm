"use client";

import { useState } from "react";

import type { Product } from "../../lib/products";
import { slugify } from "../../lib/ids";

export interface ProductEditorProps {
  initial: Partial<Product>;
  apiBase: string;
  isNew?: boolean;
}

export function ProductEditor({ initial, apiBase, isNew = false }: ProductEditorProps) {
  const [draft, setDraft] = useState<Partial<Product>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof Product>(key: K, value: Product[K]): void {
    setDraft(d => ({ ...d, [key]: value }));
  }

  async function save(): Promise<void> {
    if (!draft.name?.trim()) {
      setError("Name is required.");
      return;
    }
    const slug = draft.slug?.trim() || slugify(draft.name);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/products`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          id: draft.id || slug,
          slug,
          price: Number(draft.price ?? 0),
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      if (typeof window !== "undefined") {
        if (isNew) window.location.href = `../products/${slug}`;
        else window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ecom-product-editor">
      <header>
        <h1>{isNew ? "New product" : `Edit ${draft.name ?? draft.slug ?? "product"}`}</h1>
      </header>

      <label className="ecom-field">
        <span>Name</span>
        <input value={draft.name ?? ""} onChange={(e) => update("name", e.target.value)} disabled={busy} required />
      </label>

      <label className="ecom-field">
        <span>Slug</span>
        <input
          value={draft.slug ?? ""}
          onChange={(e) => update("slug", e.target.value)}
          placeholder="auto-generated from name"
          disabled={busy}
        />
      </label>

      <label className="ecom-field">
        <span>Tagline</span>
        <input value={draft.tagline ?? ""} onChange={(e) => update("tagline", e.target.value)} disabled={busy} />
      </label>

      <div className="ecom-field-row">
        <label className="ecom-field">
          <span>Price (pence)</span>
          <input
            type="number"
            value={draft.price ?? 0}
            onChange={(e) => update("price", Number(e.target.value))}
            disabled={busy}
          />
        </label>
        <label className="ecom-field">
          <span>Sale price</span>
          <input
            type="number"
            value={draft.salePrice ?? ""}
            onChange={(e) => update("salePrice", e.target.value ? Number(e.target.value) : undefined)}
            disabled={busy}
          />
        </label>
        <label className="ecom-field">
          <span>Currency</span>
          <select
            value={draft.currency ?? "gbp"}
            onChange={(e) => update("currency", e.target.value)}
            disabled={busy}
          >
            <option value="gbp">GBP</option>
            <option value="usd">USD</option>
            <option value="eur">EUR</option>
          </select>
        </label>
      </div>

      <label className="ecom-field">
        <span>Image URL</span>
        <input value={draft.image ?? ""} onChange={(e) => update("image", e.target.value)} disabled={busy} />
      </label>

      <label className="ecom-field">
        <span>Stock SKU (links to inventory)</span>
        <input
          value={draft.stockSku ?? ""}
          onChange={(e) => update("stockSku", e.target.value)}
          disabled={busy}
        />
      </label>

      <fieldset className="ecom-field">
        <legend>Flags</legend>
        <label><input type="checkbox" checked={!!draft.archived} onChange={(e) => update("archived", e.target.checked)} disabled={busy} /> Archived</label>
        <label><input type="checkbox" checked={!!draft.hidden} onChange={(e) => update("hidden", e.target.checked)} disabled={busy} /> Hidden from storefront</label>
        <label><input type="checkbox" checked={!!draft.digital} onChange={(e) => update("digital", e.target.checked)} disabled={busy} /> Digital product</label>
      </fieldset>

      {error && <p className="ecom-error" role="alert">{error}</p>}

      <div className="ecom-actions-row">
        <button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save product"}
        </button>
      </div>
    </section>
  );
}
