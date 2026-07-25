"use client";

import { useState } from "react";

import type { Benefit, BenefitCategory } from "../lib/domain";

export interface BenefitsListProps {
  benefits: Benefit[];
  apiBase: string;
  canMutate: boolean;
}

const CAT_LABEL: Record<BenefitCategory, string> = {
  discount: "Discount",
  content: "Content",
  perk: "Perk",
  other: "Other",
};

export function BenefitsList({ benefits, apiBase, canMutate }: BenefitsListProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="memberships-benefits">
      <header className="memberships-list-header">
        <div>
          <h1>Benefits</h1>
          <p>{benefits.length === 0 ? "No benefits yet." : `${benefits.length} benefit${benefits.length === 1 ? "" : "s"}`}</p>
        </div>
      </header>

      <ul className="memberships-benefit-grid">
        {benefits.map(b => (
          <li key={b.id}>
            <article className={`memberships-benefit-card memberships-benefit-${b.category}`}>
              <header>
                <h3>{b.label}</h3>
                <span className="memberships-pill">{CAT_LABEL[b.category]}</span>
              </header>
              {b.description && <p className="memberships-staff-meta">{b.description}</p>}
              {b.category === "discount" && b.percentOff && (
                <p className="memberships-staff-meta">{b.percentOff}% off ecommerce orders</p>
              )}
              {b.contentRef && <p className="memberships-staff-meta">Content: {b.contentRef}</p>}
            </article>
          </li>
        ))}
      </ul>

      {canMutate && (
        <form
          className="memberships-benefit-create"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const body = {
              label: String(fd.get("label") ?? "").trim(),
              description: String(fd.get("description") ?? "").trim() || undefined,
              category: String(fd.get("category") ?? "perk") as BenefitCategory,
              percentOff: Number(fd.get("percentOff") ?? 0) || undefined,
            };
            if (!body.label) {
              setError("label required");
              return;
            }
            setBusy(true);
            try {
              const r = await fetch(`${apiBase}/benefits`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
              });
              const data = await r.json();
              if (!r.ok || !data.ok) {
                setError(data?.error ?? `Failed (${r.status})`);
                return;
              }
              (e.currentTarget as HTMLFormElement).reset();
              window.location.reload();
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Add benefit</h3>
          <label>Label<input name="label" required /></label>
          <label>Description<input name="description" /></label>
          <label>Category
            <select name="category" defaultValue="perk">
              <option value="discount">Discount</option>
              <option value="content">Content</option>
              <option value="perk">Perk</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>% off (for discount only)<input name="percentOff" type="number" min="0" max="100" defaultValue={0} /></label>
          {error && <p className="memberships-form-error">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
        </form>
      )}
    </section>
  );
}
