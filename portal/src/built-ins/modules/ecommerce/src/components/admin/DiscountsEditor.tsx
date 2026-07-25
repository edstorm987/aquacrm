"use client";

import { useState } from "react";

import type { CustomDiscountCode } from "../../server/discounts";
import { describeDiscount } from "../../lib/admin/marketing";

export interface DiscountsEditorProps {
  codes: CustomDiscountCode[];
  apiBase: string;
}

export function DiscountsEditor({ codes: initial, apiBase }: DiscountsEditorProps) {
  const [codes, setCodes] = useState<CustomDiscountCode[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function blank(): CustomDiscountCode {
    return {
      code: "",
      type: "percent",
      value: 10,
      active: true,
      uses: 0,
      createdAt: Date.now(),
    };
  }

  async function save(c: CustomDiscountCode): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/discounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c),
      });
      const data = await res.json() as { ok: boolean; code?: CustomDiscountCode; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      if (data.code) {
        setCodes(cs => {
          const idx = cs.findIndex(x => x.code === data.code!.code);
          if (idx === -1) return [data.code!, ...cs];
          return cs.map((x, i) => i === idx ? data.code! : x);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(code: string): Promise<void> {
    if (!confirm(`Delete code ${code}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/discounts?code=${encodeURIComponent(code)}`, { method: "DELETE" });
      const data = await res.json() as { ok: boolean };
      if (data.ok) setCodes(cs => cs.filter(c => c.code !== code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ecom-discounts">
      <header className="ecom-list-header">
        <div><h1>Discount codes</h1><p>{codes.length} code{codes.length === 1 ? "" : "s"}</p></div>
        <button
          type="button"
          onClick={() => setCodes(cs => [blank(), ...cs])}
          disabled={busy}
        >
          + New code
        </button>
      </header>

      <ul className="ecom-discount-list">
        {codes.map((c, i) => (
          <li key={c.code || `new-${i}`} className="ecom-row">
            <input
              value={c.code}
              onChange={(e) => setCodes(cs => cs.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x))}
              placeholder="ODO10"
              disabled={busy}
            />
            <select
              value={c.type}
              onChange={(e) => setCodes(cs => cs.map((x, j) => j === i ? { ...x, type: e.target.value as CustomDiscountCode["type"] } : x))}
              disabled={busy}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed (pence)</option>
              <option value="freeship">Free shipping</option>
            </select>
            <input
              type="number"
              value={c.value}
              onChange={(e) => setCodes(cs => cs.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
              disabled={busy}
            />
            <label><input type="checkbox" checked={c.active} onChange={(e) => setCodes(cs => cs.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} disabled={busy} /> Active</label>
            <span>{describeDiscount(c)} · {c.uses} use{c.uses === 1 ? "" : "s"}</span>
            <button type="button" onClick={() => save(c)} disabled={busy}>Save</button>
            {c.code && <button type="button" onClick={() => remove(c.code)} disabled={busy}>Delete</button>}
          </li>
        ))}
      </ul>

      {error && <p className="ecom-error" role="alert">{error}</p>}
    </section>
  );
}
