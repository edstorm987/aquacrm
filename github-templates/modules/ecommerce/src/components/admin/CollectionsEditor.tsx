"use client";

import { useState } from "react";

import type { ProductCollection } from "../../lib/admin/collections";

export interface CollectionsEditorProps {
  collections: ProductCollection[];
  apiBase: string;
}

export function CollectionsEditor({ collections: initial, apiBase }: CollectionsEditorProps) {
  const [collections, setCollections] = useState<ProductCollection[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/collections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collections }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) setError(data.error ?? "Could not save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function add(): void {
    setCollections(cs => [
      ...cs,
      {
        id: `c_${Date.now()}`,
        slug: `collection-${cs.length + 1}`,
        name: "New collection",
        productSlugs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
  }

  return (
    <section className="ecom-collections">
      <header className="ecom-list-header">
        <div><h1>Collections</h1><p>{collections.length} collection{collections.length === 1 ? "" : "s"}</p></div>
        <button type="button" onClick={add} disabled={busy}>+ New collection</button>
      </header>
      <ul>
        {collections.map((c, i) => (
          <li key={c.id} className="ecom-row">
            <input
              value={c.name}
              onChange={(e) => setCollections(cs => cs.map((x, j) => j === i ? { ...x, name: e.target.value, updatedAt: Date.now() } : x))}
              disabled={busy}
            />
            <input
              value={c.slug}
              onChange={(e) => setCollections(cs => cs.map((x, j) => j === i ? { ...x, slug: e.target.value, updatedAt: Date.now() } : x))}
              placeholder="slug"
              disabled={busy}
            />
            <input
              value={c.productSlugs.join(",")}
              onChange={(e) => setCollections(cs => cs.map((x, j) => j === i ? { ...x, productSlugs: e.target.value.split(",").map(s => s.trim()).filter(Boolean), updatedAt: Date.now() } : x))}
              placeholder="product slugs (comma)"
              disabled={busy}
            />
            <label><input type="checkbox" checked={!!c.hidden} onChange={(e) => setCollections(cs => cs.map((x, j) => j === i ? { ...x, hidden: e.target.checked, updatedAt: Date.now() } : x))} disabled={busy} /> Hidden</label>
            <button type="button" onClick={() => setCollections(cs => cs.filter((_, j) => j !== i))} disabled={busy}>×</button>
          </li>
        ))}
      </ul>
      {error && <p className="ecom-error" role="alert">{error}</p>}
      <div className="ecom-actions-row">
        <button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save collections"}</button>
      </div>
    </section>
  );
}
