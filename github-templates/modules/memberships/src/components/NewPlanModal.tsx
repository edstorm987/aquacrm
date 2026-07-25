"use client";

import { useState } from "react";

import type { Currency } from "../lib/domain";

export interface NewPlanModalProps {
  apiBase: string;
  defaultCurrency: Currency;
  onClose: () => void;
}

export function NewPlanModal({ apiBase, defaultCurrency, onClose }: NewPlanModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div role="dialog" aria-modal="true" className="memberships-modal">
      <div className="memberships-modal-backdrop" onClick={onClose} />
      <form
        className="memberships-modal-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          const fd = new FormData(e.currentTarget);
          const body = {
            name: String(fd.get("name") ?? "").trim(),
            description: String(fd.get("description") ?? "").trim() || undefined,
            priceMonthly: Math.round(Number(fd.get("priceMonthly") ?? 0) * 100),
            priceAnnual: Math.round(Number(fd.get("priceAnnual") ?? 0) * 100),
            currency: String(fd.get("currency") ?? defaultCurrency) as Currency,
            features: String(fd.get("features") ?? "")
              .split("\n")
              .map(s => s.trim())
              .filter(Boolean),
            trialDays: Number(fd.get("trialDays") ?? 0) || undefined,
          };
          if (!body.name) {
            setError("name required");
            setBusy(false);
            return;
          }
          try {
            const r = await fetch(`${apiBase}/plans`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!r.ok || !data.ok) {
              setError(data?.error ?? `Failed (${r.status})`);
              return;
            }
            window.location.reload();
          } finally {
            setBusy(false);
          }
        }}
      >
        <header><h2>New plan</h2></header>
        <label>Name<input name="name" required /></label>
        <label>Description<textarea name="description" rows={2} /></label>
        <label>Monthly price<input name="priceMonthly" type="number" step="0.01" min="0" required defaultValue={0} /></label>
        <label>Annual price (0 for monthly-only)<input name="priceAnnual" type="number" step="0.01" min="0" defaultValue={0} /></label>
        <label>Currency
          <select name="currency" defaultValue={defaultCurrency}>
            <option value="usd">USD</option>
            <option value="gbp">GBP</option>
            <option value="eur">EUR</option>
          </select>
        </label>
        <label>Features (one per line)<textarea name="features" rows={4} /></label>
        <label>Trial days (0 = no trial)<input name="trialDays" type="number" min="0" defaultValue={0} /></label>
        {error && <p className="memberships-form-error">{error}</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Create plan"}</button>
        </footer>
      </form>
    </div>
  );
}
