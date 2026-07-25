"use client";

import { useState } from "react";

import type { Currency, Plan } from "../lib/domain";
import { NewPlanModal } from "./NewPlanModal";

export interface PlansListProps {
  plans: Plan[];
  apiBase: string;
  defaultCurrency: Currency;
  canMutate: boolean;
}

function fmt(cents: number, currency: string): string {
  const symbol = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function PlansList({ plans, apiBase, defaultCurrency, canMutate }: PlansListProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="memberships-plans">
      <header className="memberships-list-header">
        <div>
          <h1>Plans</h1>
          <p>{plans.length === 0 ? "No plans yet." : `${plans.length} plan${plans.length === 1 ? "" : "s"}.`}</p>
        </div>
        {canMutate && <button type="button" onClick={() => setOpen(true)}>+ New plan</button>}
      </header>

      <ul className="memberships-plan-grid">
        {plans.map(p => {
          const monthly = p.priceMonthly === 0 ? "Free" : `${fmt(p.priceMonthly, p.currency)}/mo`;
          const annual = p.priceAnnual === 0 ? null : `${fmt(p.priceAnnual, p.currency)}/yr`;
          return (
            <li key={p.id}>
              <article className={`memberships-plan-card memberships-plan-${p.status}`}>
                <header>
                  <h3>{p.name}</h3>
                  <span className={`memberships-pill memberships-pill-${p.status}`}>{p.status}</span>
                </header>
                <p className="memberships-plan-price">{monthly}{annual && <span className="memberships-plan-annual"> · {annual}</span>}</p>
                {p.description && <p className="memberships-plan-meta">{p.description}</p>}
                <ul className="memberships-plan-features">
                  {p.features.map((f, i) => (<li key={i}>{f}</li>))}
                </ul>
                {p.trialDays && <p className="memberships-plan-meta">{p.trialDays}-day trial</p>}
                {p.stripePriceIdMonthly && <p className="memberships-plan-stripe">Stripe price: {p.stripePriceIdMonthly}</p>}
              </article>
            </li>
          );
        })}
      </ul>

      {open && (
        <NewPlanModal
          apiBase={apiBase}
          defaultCurrency={defaultCurrency}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
