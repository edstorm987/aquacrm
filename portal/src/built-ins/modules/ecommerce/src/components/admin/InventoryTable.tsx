"use client";

import { useMemo, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { InventoryItem } from "../../lib/admin/inventory";
import { filterInventory, inventoryStats } from "../../lib/admin/inventory";

export interface InventoryTableProps {
  items: InventoryItem[];
  apiBase: string;
}

export function InventoryTable({ items, apiBase }: InventoryTableProps) {
  const [query, setQuery] = useState("");
  const [showOnlyLow, setShowOnlyLow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => inventoryStats(items), [items]);
  const filtered = useMemo(
    () => filterInventory(items, { q: query || undefined, showOnlyLow }),
    [items, query, showOnlyLow],
  );

  async function setOnHand(sku: string, onHand: number, expectedVersion: number): Promise<void> {
    setBusy(sku);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/inventory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, onHand, expectedVersion }),
      }, {
        fallback: `Inventory for ${sku} could not be saved.`,
        validate: payload => payload.ok === true,
      });
      if (typeof window !== "undefined") window.location.reload();
    } catch (requestError) {
      setError(mutationErrorMessage(requestError, `Inventory for ${sku} could not be saved.`));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ecom-inventory">
      <header className="ecom-list-header">
        <div>
          <h1>Inventory</h1>
          <p>{stats.totalSkus} SKUs · {stats.outOfStock} out of stock · {stats.lowStock} low</p>
        </div>
        <div className="ecom-list-actions">
          <input
            type="search"
            placeholder="Search by SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search inventory"
          />
          <label><input type="checkbox" checked={showOnlyLow} onChange={(e) => setShowOnlyLow(e.target.checked)} /> Low stock only</label>
        </div>
      </header>
      {error && <p role="alert" className="ecom-error">{error}</p>}
      <table className="ecom-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>On hand</th>
            <th>Reserved</th>
            <th>Available</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map(it => {
            const available = it.unlimited ? "∞" : Math.max(0, it.onHand - it.reserved);
            return (
              <tr key={it.sku} data-low={typeof available === "number" && available <= it.lowAt}>
                <td>{it.sku}</td>
                <td>{it.name ?? "—"}</td>
                <td>
                  <input
                    type="number"
                    defaultValue={it.onHand}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (next !== it.onHand) setOnHand(it.sku, next, it.version ?? 1);
                    }}
                    disabled={busy === it.sku}
                  />
                </td>
                <td>{it.reserved}</td>
                <td>{available}</td>
                <td>{busy === it.sku ? "Saving…" : null}</td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={6} className="ecom-empty">No SKUs.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
