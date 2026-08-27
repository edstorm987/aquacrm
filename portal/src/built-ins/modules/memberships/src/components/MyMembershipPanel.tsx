"use client";

import { useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

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
  const [err, setErr] = useState<string | null>(null);

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
            setBusy(true); setErr(null);
            try {
              const data = await checkedJsonMutation<{ ok: boolean; url?: string }>(
                `${apiBase}/me/portal`,
                { method: "POST" },
                {
                  fallback: "Billing management could not be opened.",
                  validate: payload => payload.ok === true && Boolean(payload.url),
                },
              );
              window.location.href = data.url!;
            } catch (requestError) {
              setErr(mutationErrorMessage(requestError, "Billing management could not be opened."));
            } finally { setBusy(false); }
          }}>Manage billing</button>
        )}
        {!subscription.cancelAtPeriodEnd && subscription.status !== "canceled" && (
          <button type="button" disabled={busy} onClick={async () => {
            const providerBacked = Boolean(subscription.stripeSubscriptionId);
            if (!confirm(providerBacked
              ? "Cancel your subscription at the end of the current period?"
              : "Cancel this free membership immediately?")) return;
            setBusy(true); setErr(null);
            try {
              await checkedJsonMutation(`${apiBase}/me/cancel`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ operationId: browserOperationId("cancel") }),
              }, {
                fallback: "The membership could not be cancelled.",
              });
              window.location.reload();
            } catch (requestError) {
              setErr(mutationErrorMessage(requestError, "The membership could not be cancelled."));
            } finally { setBusy(false); }
          }}>Cancel</button>
        )}
        {availablePlans
          .filter(candidate => candidate.status === "active" && candidate.id !== subscription.planId)
          .map(candidate => (
            <SubscribeButton
              key={candidate.id}
              apiBase={apiBase}
              planId={candidate.id}
              label={`Switch to ${candidate.name}`}
            />
          ))}
        {err && <p role="alert" className="memberships-form-error">{err}</p>}
      </footer>
    </section>
  );
}

function browserOperationId(action: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `membership-${action}-${random}`;
}

function SubscribeButton({ apiBase, planId, label = "Subscribe" }: {
  apiBase: string;
  planId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const data = await checkedJsonMutation<{
            ok: boolean;
            mode?: string;
            checkoutUrl?: string;
          }>(`${apiBase}/me/subscribe`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              planId,
              billing: "monthly",
              operationId: browserOperationId(`subscribe-${planId}`),
            }),
          }, {
            fallback: "The membership could not be started.",
            validate: payload => payload.ok === true,
          });
          if (data.mode === "checkout" && data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
          } else {
            window.location.reload();
          }
        } catch (requestError) {
          setErr(mutationErrorMessage(requestError, "The membership could not be started."));
        } finally { setBusy(false); }
      }}>{busy ? "…" : label}</button>
      {err && <p role="alert" className="memberships-form-error">{err}</p>}
    </>
  );
}
