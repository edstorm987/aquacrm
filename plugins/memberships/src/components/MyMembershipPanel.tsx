"use client";

import { useState } from "react";

import type { Benefit, Plan, Subscription } from "../lib/domain";

export interface MyMembershipPanelProps {
  subscription: Subscription | null;
  plan: Plan | null;
  benefits: Benefit[];
  availablePlans: Plan[];
  apiBase: string;
}

function fmt(cents: number, currency: string): string {
  const symbol = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function MyMembershipPanel(props: MyMembershipPanelProps) {
  const { subscription, plan, benefits, availablePlans, apiBase } = props;
  const [busy, setBusy] = useState(false);

  if (!subscription) {
    return (
      <section className="memberships-my">
        <header><h1>Become a member</h1><p>Pick a plan to get started.</p></header>
        <ul className="memberships-plan-grid">
          {availablePlans.filter(p => p.status === "active").map(p => (
            <li key={p.id}>
              <article className="memberships-plan-card">
                <header><h3>{p.name}</h3></header>
                <p className="memberships-plan-price">
                  {p.priceMonthly === 0 ? "Free" : `${fmt(p.priceMonthly, p.currency)}/mo`}
                </p>
                {p.description && <p className="memberships-plan-meta">{p.description}</p>}
                <ul className="memberships-plan-features">
                  {p.features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                <SubscribeButton apiBase={apiBase} planId={p.id} />
              </article>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="memberships-my">
      <header>
        <h1>Your membership</h1>
        {plan && (
          <p>
            {plan.name} ·{" "}
            {plan.priceMonthly === 0 ? "Free" : `${fmt(plan.priceMonthly, plan.currency)}/mo`}
          </p>
        )}
        <span className={`memberships-pill memberships-pill-${subscription.status}`}>{subscription.status}</span>
      </header>
      {subscription.currentPeriodEnd && <p>Renews {subscription.currentPeriodEnd.slice(0, 10)}</p>}
      {subscription.cancelAtPeriodEnd && (
        <p className="memberships-cancel-warning">Your membership ends on {subscription.currentPeriodEnd?.slice(0, 10) ?? "the next billing cycle"}.</p>
      )}

      {benefits.length > 0 && (
        <>
          <h2>Your benefits</h2>
          <ul className="memberships-benefit-list">
            {benefits.map(b => (<li key={b.id}>{b.label}</li>))}
          </ul>
        </>
      )}

      <footer className="memberships-my-actions">
        {subscription.stripeCustomerId && (
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch(`${apiBase}/me/portal`, { method: "POST" });
              const data = await r.json();
              if (data.ok && data.url) window.location.href = data.url;
            } finally { setBusy(false); }
          }}>Manage billing</button>
        )}
        {!subscription.cancelAtPeriodEnd && subscription.status !== "canceled" && (
          <button type="button" disabled={busy} onClick={async () => {
            if (!confirm("Cancel your subscription at the end of the current period?")) return;
            setBusy(true);
            try {
              await fetch(`${apiBase}/me/cancel`, { method: "POST" });
              window.location.reload();
            } finally { setBusy(false); }
          }}>Cancel</button>
        )}
      </footer>
    </section>
  );
}

function SubscribeButton({ apiBase, planId }: { apiBase: string; planId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const r = await fetch(`${apiBase}/me/subscribe`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ planId, billing: "monthly" }),
          });
          const data = await r.json();
          if (!r.ok || !data.ok) { setErr(data?.error ?? `Failed (${r.status})`); return; }
          if (data.mode === "checkout" && data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
          } else {
            window.location.reload();
          }
        } finally { setBusy(false); }
      }}>{busy ? "…" : "Subscribe"}</button>
      {err && <p className="memberships-form-error">{err}</p>}
    </>
  );
}
