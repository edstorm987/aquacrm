"use client";

import { useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type { Affiliate, Payout, PayoutBalance, PayoutStatus } from "../lib/domain";

export interface PayoutsListProps {
  payouts: Payout[];
  affiliates: Affiliate[];
  balances: PayoutBalance[];
  apiBase: string;
  canMutate: boolean;
  /**
   * Whether this client's install actually has a Stripe Connect driver.
   * `canMutate` says the operator is allowed to act; this says the system can.
   * Both have to be true before "Process via Stripe" can do anything.
   */
  stripeConnectAvailable: boolean;
}

/**
 * Why "Process via Stripe" cannot run, or null when it can.
 *
 * The install-level capability is checked FIRST and separately from the
 * affiliate's onboarding state: an install with no Stripe keys has no Connect
 * driver at all, so the affiliate's own status is beside the point and saying
 * "Stripe onboarding is pending" would blame the wrong party. Manual mark-paid
 * stays available in every one of these cases — it is the honest route, not a
 * fallback.
 */
export function processViaStripeBlockReason(args: {
  stripeConnectAvailable: boolean;
  affiliate: Affiliate | undefined;
}): string | null {
  // This gate is TRANSFER readiness, not merely "a Stripe key exists".
  // `transfer.paid` is the only route a payout has to `completed`, and it
  // arrives by webhook — so without a verifiable webhook secret an automated
  // transfer really moves the affiliate's money and then strands the payout in
  // `in_progress`, where this list offers no further action. Refusing up front
  // is the honest answer; manual mark-paid still settles it.
  if (!args.stripeConnectAvailable) {
    return "Automated Stripe payouts are not ready for this client — mark this payout paid once you have sent it yourself.";
  }
  if (!args.affiliate) return "affiliate not found";
  if (!args.affiliate.stripeAccountId) return "affiliate hasn't started Stripe Connect onboarding";
  if (args.affiliate.stripeOnboardingStatus !== "complete") {
    return `Stripe onboarding is ${args.affiliate.stripeOnboardingStatus ?? "pending"}`;
  }
  return null;
}

export function PayoutsList({
  payouts, affiliates, balances, apiBase, canMutate, stripeConnectAvailable,
}: PayoutsListProps) {
  const [filter, setFilter] = useState<PayoutStatus | "all">("scheduled");
  const activeAffiliates = affiliates.filter(affiliate => affiliate.status === "active");
  const firstBalance = balances.find(balance => balance.grossApprovedCents > 0);
  const [affiliateId, setAffiliateId] = useState(firstBalance?.affiliateId ?? activeAffiliates[0]?.id ?? "");
  const [currency, setCurrency] = useState(firstBalance?.currency ?? "");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const affiliateById = new Map(affiliates.map(a => [a.id, a]));
  const filtered = filter === "all" ? payouts : payouts.filter(p => p.status === filter);
  const affiliateBalances = balances.filter(balance => balance.affiliateId === affiliateId);
  const selectedBalance = affiliateBalances.find(balance => balance.currency === currency);
  return (
    <section className="affiliates-payouts">
      <header className="affiliates-list-header">
        <div>
          <h1>Payouts</h1>
          <p>{payouts.length === 0 ? "No payouts yet." : `${filtered.length} of ${payouts.length}`}</p>
        </div>
        <div className="affiliates-list-actions">
          {canMutate && (
            <>
              <select
                aria-label="Affiliate to schedule"
                value={affiliateId}
                onChange={event => {
                  const nextAffiliateId = event.target.value;
                  setAffiliateId(nextAffiliateId);
                  setCurrency(balances.find(balance => balance.affiliateId === nextAffiliateId)?.currency ?? "");
                }}
              >
                {activeAffiliates.length === 0 && <option value="">No active affiliates</option>}
                {activeAffiliates.map(affiliate => (
                  <option key={affiliate.id} value={affiliate.id}>{affiliate.displayName}</option>
                ))}
              </select>
              <select
                aria-label="Payout currency"
                value={currency}
                onChange={event => setCurrency(event.target.value)}
              >
                {affiliateBalances.length === 0 && <option value="">No payable balance</option>}
                {affiliateBalances.map(balance => (
                  <option key={balance.currency} value={balance.currency}>
                    {balance.currency.toUpperCase()} · {formatMoney(balance.availableCents, balance.currency)} available
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!affiliateId || !currency || scheduling || !selectedBalance || selectedBalance.availableCents <= 0}
                onClick={async () => {
                  setScheduling(true); setScheduleError(null);
                  try {
                    await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/payouts`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        affiliateId,
                        currency,
                        operationId: `affiliate-payout-schedule-${crypto.randomUUID()}`,
                      }),
                    }, {
                      fallback: "The payout could not be scheduled.",
                      validate: payload => payload.ok === true,
                    });
                    window.location.reload();
                  } catch (requestError) {
                    setScheduleError(mutationErrorMessage(requestError, "The payout could not be scheduled."));
                  } finally {
                    setScheduling(false);
                  }
                }}
              >
                {scheduling ? "Scheduling…" : "Schedule approved"}
              </button>
            </>
          )}
          <select aria-label="Payout status" value={filter} onChange={e => setFilter(e.target.value as PayoutStatus | "all")}>
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </header>
      {scheduleError && <p role="alert" className="affiliates-form-error">{scheduleError}</p>}
      <ul className="affiliates-payout-grid">
        {filtered.map(p => {
          const aff = affiliateById.get(p.affiliateId);
          return (
            <li key={p.id}>
              <article className="affiliates-payout-card">
                <header>
                  <h3>{aff?.displayName ?? p.affiliateId}</h3>
                  <span className={`affiliates-pill affiliates-pill-payout-${p.status}`}>{p.status}</span>
                </header>
                <p className="affiliates-meta">{formatMoney(p.amountCents, p.currency)} · {p.method}</p>
                {(p.adjustmentAmountCents ?? 0) > 0 && (
                  <p className="affiliates-meta">
                    {formatMoney(p.grossAmountCents, p.currency)} gross − {formatMoney(p.adjustmentAmountCents, p.currency)} reversals
                  </p>
                )}
                <p className="affiliates-meta">{p.attributionIds.length} attributions</p>
                {p.externalRef && <p className="affiliates-meta">Ref: {p.externalRef}</p>}
                {canMutate && p.status === "scheduled" && (
                  <div className="affiliates-payout-actions">
                    <ProcessViaStripeButton
                      apiBase={apiBase}
                      payoutId={p.id}
                      affiliate={aff}
                      stripeConnectAvailable={stripeConnectAvailable}
                    />
                    <MarkPaidButton apiBase={apiBase} payoutId={p.id} />
                  </div>
                )}
                {p.status === "in_progress" && (
                  <p className="affiliates-meta">Stripe transfer pending — webhook flips to completed.</p>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function ProcessViaStripeButton({
  apiBase,
  payoutId,
  affiliate,
  stripeConnectAvailable,
}: {
  apiBase: string;
  payoutId: string;
  affiliate: Affiliate | undefined;
  stripeConnectAvailable: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = processViaStripeBlockReason({ stripeConnectAvailable, affiliate });
  const ready = reason === null;
  return (
    <span className="affiliates-stripe-button">
      <button
        type="button"
        disabled={busy || !ready}
        title={reason ?? "Submit Stripe transfer"}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/payouts/process`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: payoutId }),
            }, {
              fallback: "The Stripe payout could not be submitted.",
              validate: payload => payload.ok === true,
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "The Stripe payout could not be submitted."));
          } finally { setBusy(false); }
        }}
      >
        {busy ? "…" : "Process via Stripe"}
      </button>
      {!ready && <span className="affiliates-meta">{reason}</span>}
      {error && <span role="alert" className="affiliates-form-error">{error}</span>}
    </span>
  );
}

function MarkPaidButton({ apiBase, payoutId }: { apiBase: string; payoutId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const ref = window.prompt("External transaction reference (e.g. PayPal txn id):");
          if (!ref) return;
          setBusy(true);
          setError(null);
          try {
            await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/payouts/mark-paid`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: payoutId, externalRef: ref }),
            }, {
              fallback: "The payout could not be marked paid.",
              validate: payload => payload.ok === true,
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "The payout could not be marked paid."));
          } finally { setBusy(false); }
        }}
      >
        {busy ? "…" : "Mark paid"}
      </button>
      {error && <span role="alert" className="affiliates-form-error">{error}</span>}
    </span>
  );
}
