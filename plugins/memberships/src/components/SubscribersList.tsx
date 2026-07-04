"use client";

import { useMemo, useState } from "react";

import type { Plan, Subscription, SubscriptionStatus } from "../lib/domain";

export interface SubscribersListProps {
  subscribers: Subscription[];
  plans: Plan[];
  apiBase: string;
  canMutate: boolean;
}

export function SubscribersList({ subscribers, plans, apiBase, canMutate }: SubscribersListProps) {
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);

  const filtered = subscribers.filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (planFilter !== "all" && s.planId !== planFilter) return false;
    return true;
  });

  return (
    <section className="memberships-subscribers">
      <header className="memberships-list-header">
        <div>
          <h1>Subscribers</h1>
          <p>{subscribers.length === 0 ? "No subscribers yet." : `${filtered.length} of ${subscribers.length}`}</p>
        </div>
        <div className="memberships-list-actions">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as SubscriptionStatus | "all")}>
            <option value="all">All statuses</option>
            <option value="trialing">Trialing</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="paused">Paused</option>
            <option value="canceled">Canceled</option>
            <option value="incomplete">Incomplete</option>
          </select>
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
            <option value="all">All plans</option>
            {plans.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>
      </header>

      <ul className="memberships-subscriber-grid">
        {filtered.map(s => {
          const plan = planById.get(s.planId);
          return (
            <li key={s.id}>
              <article className="memberships-subscriber-card">
                <header>
                  <h3>{s.endCustomerUserId}</h3>
                  <span className={`memberships-pill memberships-pill-${s.status}`}>{s.status}</span>
                </header>
                <p className="memberships-staff-meta">{plan?.name ?? "Unknown plan"} · {s.billing}</p>
                {s.currentPeriodEnd && <p className="memberships-staff-meta">Renews {s.currentPeriodEnd.slice(0, 10)}</p>}
                {s.cancelAtPeriodEnd && <p className="memberships-staff-meta">Cancels at period end</p>}
                {canMutate && s.status !== "canceled" && (
                  <CancelButton apiBase={apiBase} userId={s.endCustomerUserId} />
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CancelButton({ apiBase, userId }: { apiBase: string; userId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Cancel subscription for ${userId}?`)) return;
        setBusy(true);
        try {
          await fetch(`${apiBase}/subscribers/cancel`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId, atPeriodEnd: true }),
          });
          window.location.reload();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : "Cancel"}
    </button>
  );
}
