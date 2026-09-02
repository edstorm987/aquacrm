"use client";

import { useId, useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Benefit, Billing, Plan, Subscription } from "../lib/domain";
import {
  isMembershipCancelMutationResult,
  isMembershipPortalMutationResult,
  isMembershipSubscribeMutationResult,
  type MembershipCancelMutationResult,
  type MembershipPortalMutationResult,
  type MembershipSubscribeMutationResult,
} from "../lib/mutationResponses";
import {
  clearMembershipOperationAfterDefinitiveFailure,
  clearPendingMembershipOperation,
  pendingMembershipOperationId,
} from "../lib/browserOperation";
import { planSupportsBilling } from "../lib/settings";

export interface MyMembershipPanelProps {
  subscription: Subscription | null;
  plan: Plan | null;
  benefits: Benefit[];
  availablePlans: Plan[];
  apiBase: string;
  memberPortalHeading: string;
  showAnnualCadence: boolean;
  annualBillingEnabled: boolean;
}

function fmt(cents: number, currency: string): string {
  const symbol = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function MyMembershipPanel(props: MyMembershipPanelProps) {
  const {
    subscription,
    plan,
    benefits,
    availablePlans,
    apiBase,
    memberPortalHeading,
    showAnnualCadence,
    annualBillingEnabled,
  } = props;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedBilling, setSelectedBilling] = useState<Billing>("monthly");
  const signupBilling: Billing = showAnnualCadence ? selectedBilling : "monthly";
  const activePlans = availablePlans.filter(candidate => candidate.status === "active");

  if (!subscription) {
    return (
      <section className="memberships-my">
        <header><h1>{memberPortalHeading}</h1><p>Pick a plan to get started.</p></header>
        {showAnnualCadence ? (
          <BillingCadence value={signupBilling} onChange={setSelectedBilling} />
        ) : null}
        <ul className="memberships-plan-grid">
          {activePlans.map(candidate => {
            const supportsCadence = planSupportsBilling(candidate, signupBilling);
            const disabledReason = supportsCadence
              ? undefined
              : `${candidate.name} is monthly-only. Choose monthly billing to subscribe.`;
            return (
              <li key={candidate.id}>
                <article className="memberships-plan-card">
                  <header><h3>{candidate.name}</h3></header>
                  <p className="memberships-plan-price">
                    {planPrice(candidate, signupBilling, supportsCadence)}
                  </p>
                  {candidate.description && <p className="memberships-plan-meta">{candidate.description}</p>}
                  <ul className="memberships-plan-features">
                    {candidate.features.map((feature, index) => <li key={index}>{feature}</li>)}
                  </ul>
                  <SubscribeButton
                    apiBase={apiBase}
                    planId={candidate.id}
                    billing={signupBilling}
                    disabledReason={disabledReason}
                  />
                </article>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="memberships-my">
      <header>
        <h1>{memberPortalHeading}</h1>
        {plan && (
          <p>
            {plan.name} ·{" "}
            {planPrice(
              plan,
              subscription.billing,
              subscription.billing === "monthly" || plan.priceAnnual > 0,
            )}
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
              const data = await checkedJsonMutation<MembershipPortalMutationResult>(
                `${apiBase}/me/portal`,
                { method: "POST" },
                {
                  fallback: "Billing management could not be opened.",
                  validate: isMembershipPortalMutationResult,
                },
              );
              window.location.href = data.url;
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
            const operationAction = providerBacked ? "cancel-period-end" : "cancel-immediate";
            const operationScope = `${apiBase}:subscription:${subscription.id}`;
            const requestOperationId = pendingMembershipOperationId(operationScope, operationAction);
            setBusy(true); setErr(null);
            try {
              await checkedJsonMutation<MembershipCancelMutationResult>(`${apiBase}/me/cancel`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ operationId: requestOperationId }),
              }, {
                fallback: "The membership could not be cancelled.",
                validate: payload => isMembershipCancelMutationResult(payload, {
                  ...subscription,
                  requestOperationId,
                }),
              });
              clearPendingMembershipOperation(operationScope, operationAction);
              window.location.reload();
            } catch (requestError) {
              clearMembershipOperationAfterDefinitiveFailure(
                requestError,
                operationScope,
                operationAction,
              );
              setErr(mutationErrorMessage(requestError, "The membership could not be cancelled."));
            } finally { setBusy(false); }
          }}>Cancel</button>
        )}
        {activePlans
          .filter(candidate => candidate.id !== subscription.planId)
          .map(candidate => {
            const annualFeatureBlocked = subscription.billing === "annual" && !annualBillingEnabled;
            const supportsCadence = !annualFeatureBlocked
              && planSupportsBilling(candidate, subscription.billing);
            return (
              <SubscribeButton
                key={candidate.id}
                apiBase={apiBase}
                planId={candidate.id}
                billing={subscription.billing}
                label={`Switch to ${candidate.name}`}
                disabledReason={supportsCadence
                  ? undefined
                  : annualFeatureBlocked
                    ? "Annual billing is disabled for this workspace, so this annual membership cannot change plans."
                    : `${candidate.name} does not offer annual billing, so this annual membership cannot switch to it.`}
              />
            );
          })}
        {err && <p role="alert" className="memberships-form-error">{err}</p>}
      </footer>
    </section>
  );
}

function BillingCadence({ value, onChange }: {
  value: Billing;
  onChange: (billing: Billing) => void;
}) {
  return (
    <fieldset className="memberships-cadence">
      <legend>Billing cadence</legend>
      <label data-selected={value === "monthly"}>
        <input
          type="radio"
          name="membership-billing-cadence"
          value="monthly"
          checked={value === "monthly"}
          onChange={() => onChange("monthly")}
        />
        Monthly
      </label>
      <label data-selected={value === "annual"}>
        <input
          type="radio"
          name="membership-billing-cadence"
          value="annual"
          checked={value === "annual"}
          onChange={() => onChange("annual")}
        />
        Annual
      </label>
    </fieldset>
  );
}

function planPrice(plan: Plan, billing: Billing, supported: boolean): string {
  if (billing === "annual") {
    return supported ? `${fmt(plan.priceAnnual, plan.currency)}/yr` : "Monthly only";
  }
  return plan.priceMonthly === 0 ? "Free" : `${fmt(plan.priceMonthly, plan.currency)}/mo`;
}

function SubscribeButton({ apiBase, planId, billing, label = "Subscribe", disabledReason }: {
  apiBase: string;
  planId: string;
  billing: Billing;
  label?: string;
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reasonId = useId();
  return (
    <>
      <button
        type="button"
        disabled={busy || Boolean(disabledReason)}
        aria-describedby={disabledReason ? reasonId : undefined}
        onClick={async () => {
          const operationAction = `subscribe-${planId}-${billing}`;
          const requestOperationId = pendingMembershipOperationId(apiBase, operationAction);
          setBusy(true); setErr(null);
          try {
            const data = await checkedJsonMutation<MembershipSubscribeMutationResult>(`${apiBase}/me/subscribe`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                planId,
                billing,
                operationId: requestOperationId,
              }),
            }, {
              fallback: "The membership could not be started.",
              validate: payload => isMembershipSubscribeMutationResult(payload, { requestOperationId, planId, billing }),
            });
            clearPendingMembershipOperation(apiBase, operationAction);
            if (data.mode === "checkout") {
              window.location.href = data.checkoutUrl;
            } else {
              window.location.reload();
            }
          } catch (requestError) {
            clearMembershipOperationAfterDefinitiveFailure(requestError, apiBase, operationAction);
            setErr(mutationErrorMessage(requestError, "The membership could not be started."));
          } finally { setBusy(false); }
        }}>
        {busy ? "…" : label}
      </button>
      {disabledReason ? <p id={reasonId} className="memberships-plan-meta">{disabledReason}</p> : null}
      {err && <p role="alert" className="memberships-form-error">{err}</p>}
    </>
  );
}
