"use client";

import { useMemo, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Plan, Subscription, SubscriptionStatus } from "../lib/domain";
import {
  isMembershipCancelMutationResult,
  type MembershipCancelMutationResult,
} from "../lib/mutationResponses";
import {
  clearMembershipOperationAfterDefinitiveFailure,
  clearPendingMembershipOperation,
  pendingMembershipOperationId,
} from "../lib/browserOperation";

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
                  <CancelButton apiBase={apiBase} subscription={s} />
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CancelButton({ apiBase, subscription }: { apiBase: string; subscription: Subscription }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = subscription.endCustomerUserId;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm(`Cancel subscription for ${userId}?`)) return;
          const operationAction = `admin-cancel-${subscription.id}-period-end`;
          const requestOperationId = pendingMembershipOperationId(apiBase, operationAction);
          setBusy(true); setError(null);
          try {
            await checkedJsonMutation<MembershipCancelMutationResult>(`${apiBase}/subscribers/cancel`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                userId,
                atPeriodEnd: true,
                operationId: requestOperationId,
              }),
            }, {
              fallback: "The subscription could not be cancelled.",
              validate: payload => isMembershipCancelMutationResult(payload, {
                ...subscription,
                requestOperationId,
              }),
            });
            clearPendingMembershipOperation(apiBase, operationAction);
            window.location.reload();
          } catch (requestError) {
            clearMembershipOperationAfterDefinitiveFailure(requestError, apiBase, operationAction);
            setError(mutationErrorMessage(requestError, "The subscription could not be cancelled."));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : "Cancel"}
      </button>
      {error && <p role="alert" className="memberships-form-error">{error}</p>}
    </>
  );
}
