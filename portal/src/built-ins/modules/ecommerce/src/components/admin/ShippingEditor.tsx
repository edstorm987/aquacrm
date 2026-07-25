"use client";

import { useState } from "react";

import type { ShippingRate, ShippingZone } from "../../lib/admin/shipping";

export interface ShippingEditorProps {
  zones: ShippingZone[];
  rates: ShippingRate[];
  apiBase: string;
}

export function ShippingEditor({ zones: initialZones, rates: initialRates, apiBase }: ShippingEditorProps) {
  const [zones, setZones] = useState<ShippingZone[]>(initialZones);
  const [rates, setRates] = useState<ShippingRate[]>(initialRates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/shipping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zones, rates }),
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
    <section className="ecom-shipping">
      <header><h1>Shipping</h1></header>

      <h2>Zones ({zones.length})</h2>
      <ul>
        {zones.map((z, i) => (
          <li key={z.id} className="ecom-row">
            <input
              value={z.name}
              onChange={(e) => setZones(zs => zs.map((zz, j) => j === i ? { ...zz, name: e.target.value } : zz))}
              disabled={busy}
            />
            <input
              value={z.countries.join(",")}
              onChange={(e) => setZones(zs => zs.map((zz, j) => j === i ? { ...zz, countries: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : zz))}
              placeholder="GB, IE, FR…"
              disabled={busy}
            />
            <button type="button" onClick={() => setZones(zs => zs.filter((_, j) => j !== i))} disabled={busy}>×</button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setZones(zs => [...zs, { id: `z_${Date.now()}`, name: "New zone", countries: [] }])}
        disabled={busy}
      >
        + Add zone
      </button>

      <h2>Rates ({rates.length})</h2>
      <ul>
        {rates.map((r, i) => (
          <li key={r.id} className="ecom-row">
            <select
              value={r.zoneId}
              onChange={(e) => setRates(rs => rs.map((rr, j) => j === i ? { ...rr, zoneId: e.target.value } : rr))}
              disabled={busy}
            >
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
            <input
              value={r.name}
              onChange={(e) => setRates(rs => rs.map((rr, j) => j === i ? { ...rr, name: e.target.value } : rr))}
              disabled={busy}
            />
            <select
              value={r.type}
              onChange={(e) => setRates(rs => rs.map((rr, j) => j === i ? { ...rr, type: e.target.value as ShippingRate["type"] } : rr))}
              disabled={busy}
            >
              <option value="fixed">Fixed</option>
              <option value="weight">Weight bands</option>
              <option value="free">Free</option>
            </select>
            <input
              type="number"
              value={r.amount ?? 0}
              onChange={(e) => setRates(rs => rs.map((rr, j) => j === i ? { ...rr, amount: Number(e.target.value) } : rr))}
              placeholder="amount (pence)"
              disabled={busy || r.type !== "fixed"}
            />
            <button type="button" onClick={() => setRates(rs => rs.filter((_, j) => j !== i))} disabled={busy}>×</button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setRates(rs => [
          ...rs,
          {
            id: `r_${Date.now()}`,
            zoneId: zones[0]?.id ?? "",
            name: "Standard",
            type: "fixed",
            amount: 0,
            active: true,
            createdAt: Date.now(),
          },
        ])}
        disabled={busy || zones.length === 0}
      >
        + Add rate
      </button>

      {error && <p className="ecom-error" role="alert">{error}</p>}
      <div className="ecom-actions-row">
        <button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save shipping"}</button>
      </div>
    </section>
  );
}
