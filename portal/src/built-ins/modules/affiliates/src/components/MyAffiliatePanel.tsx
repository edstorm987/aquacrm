"use client";

import { useState } from "react";

import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

import type {
  Affiliate,
  Attribution,
  Payout,
  ReferralCode,
} from "../lib/domain";

export interface MyAffiliatePanelProps {
  affiliate: Affiliate | null;
  codes: ReferralCode[];
  attributions: Attribution[];
  payouts: Payout[];
  apiBase: string;
  /**
   * Whether this client's install actually has a Stripe Connect driver. False
   * for every install whose ecommerce plugin carries no Stripe secret key — in
   * which case the hosted-onboarding endpoints can only answer 422, so the
   * panel says what really happens instead of offering the button.
   */
  stripeConnectAvailable: boolean;
}

export function MyAffiliatePanel({
  affiliate, codes, attributions, payouts, apiBase, stripeConnectAvailable,
}: MyAffiliatePanelProps) {
  if (!affiliate) {
    return <EnrollForm apiBase={apiBase} />;
  }
  const earnedPaid = affiliate.lifetimeEarningsByCurrency ?? totalsByCurrency(
    attributions.filter(a => !!a.paidAt),
    a => Math.max(0, (a.paidCommissionCents ?? a.amountCents) - (a.offsetAppliedCents ?? 0)),
  );
  const earnedApproved = totalsByCurrency(
    attributions.filter(a => a.status === "approved" && !a.payoutId),
    a => Math.max(0, a.amountCents - (a.reversedAmountCents ?? 0)),
  );
  const earnedPending = totalsByCurrency(
    attributions.filter(a => a.status === "pending"),
    a => Math.max(0, a.amountCents - (a.reversedAmountCents ?? 0)),
  );
  const futureOffsets = totalsByCurrency(
    attributions.filter(a => (a.offsetAmountCents ?? 0) > (a.offsetAppliedCents ?? 0)),
    a => (a.offsetAmountCents ?? 0) - (a.offsetAppliedCents ?? 0),
  );

  return (
    <section className="affiliates-me">
      <header>
        <h1>{affiliate.displayName}'s referrals</h1>
        <span className={`affiliates-pill affiliates-pill-${affiliate.status}`}>{affiliate.status}</span>
      </header>
      <dl className="affiliates-stats">
        <div><dt>Total referred</dt><dd>{affiliate.totalReferred}</dd></div>
        <div><dt>Lifetime paid</dt><dd>{formatTotals(earnedPaid)}</dd></div>
        <div><dt>Approved (next payout)</dt><dd>{formatTotals(earnedApproved)}</dd></div>
        <div><dt>Pending</dt><dd>{formatTotals(earnedPending)}</dd></div>
        <div><dt>Refund offsets</dt><dd>{formatTotals(futureOffsets)}</dd></div>
      </dl>

      <h2>Your codes</h2>
      <ul className="affiliates-codes-grid">
        {codes.map(c => (
          <li key={c.id}>
            <article className="affiliates-code-card">
              <header>
                <code>{c.code}</code>
                <span className={`affiliates-pill affiliates-pill-${c.status}`}>{c.status}</span>
              </header>
              <p className="affiliates-meta">{c.redemptionCount} redemption{c.redemptionCount === 1 ? "" : "s"}</p>
            </article>
          </li>
        ))}
      </ul>
      {affiliate.status === "active" && <NewCodeForm apiBase={apiBase} />}

      <h2>Payouts setup</h2>
      {stripeConnectAvailable
        ? <StripeConnectPanel apiBase={apiBase} affiliate={affiliate} />
        : <StripeConnectUnavailableNotice affiliate={affiliate} />}


      <h2>Recent attributions</h2>
      <ul className="affiliates-attribution-grid">
        {attributions.slice(0, 10).map(a => (
          <li key={a.id}>
            <article className="affiliates-attribution-card">
              <p>Order {a.orderId} · {a.commissionPercentSnapshot}% · {formatMoney(a.amountCents, a.currency)}</p>
              {(a.reversedAmountCents ?? 0) > 0 && <p className="affiliates-meta">{formatMoney(a.reversedAmountCents ?? 0, a.currency)} reversed</p>}
              <span className={`affiliates-pill affiliates-pill-attr-${a.status}`}>{a.status}</span>
            </article>
          </li>
        ))}
      </ul>

      <h2>Payouts</h2>
      <ul className="affiliates-payout-grid">
        {payouts.map(p => (
          <li key={p.id}>
            <article className="affiliates-payout-card">
              <header>
                <span className={`affiliates-pill affiliates-pill-payout-${p.status}`}>{p.status}</span>
              </header>
              <p>{formatMoney(p.amountCents, p.currency)} via {p.method}</p>
              {(p.adjustmentAmountCents ?? 0) > 0 && <p className="affiliates-meta">Includes {formatMoney(p.adjustmentAmountCents, p.currency)} refund offset</p>}
              {p.externalRef && <p className="affiliates-meta">Ref: {p.externalRef}</p>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function totalsByCurrency(
  attributions: Attribution[],
  amountFor: (attribution: Attribution) => number,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const attribution of attributions) {
    const currency = attribution.currency?.toLowerCase() || "unknown";
    totals[currency] = (totals[currency] ?? 0) + amountFor(attribution);
  }
  return totals;
}

function formatTotals(totals: Record<string, number>): string {
  const entries = Object.entries(totals).filter(([, amount]) => amount !== 0);
  return entries.length === 0
    ? "—"
    : entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" · ");
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function EnrollForm({ apiBase }: { apiBase: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="affiliates-me-enroll">
      <h1>Become an affiliate</h1>
      <p>Earn a commission on every referred order. Paid manually until automated payouts ship.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          const body = {
            payoutEmail: String(fd.get("payoutEmail") ?? "").trim(),
            displayName: String(fd.get("displayName") ?? "").trim() || undefined,
          };
          if (!body.payoutEmail) {
            setError("payout email required");
            return;
          }
          setBusy(true);
          try {
            await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/me/enroll`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }, {
              fallback: "Affiliate enrolment could not be completed.",
              validate: payload => payload.ok === true,
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "Affiliate enrolment could not be completed."));
          } finally { setBusy(false); }
        }}
      >
        <label>Display name<input name="displayName" /></label>
        <label>Payout email<input name="payoutEmail" type="email" required /></label>
        {error && <p role="alert" className="affiliates-form-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Enrolling…" : "Enrol"}</button>
      </form>
    </section>
  );
}

/**
 * What the affiliate sees when this store has no Stripe Connect driver at all.
 *
 * The setup CTA used to render unconditionally, so an affiliate on an install
 * with no Stripe keys could click "Set up payouts via Stripe" and get a bare
 * 422 — the surface offered an action the system could not perform. This says
 * how the payout IS dealt with instead: off-system, by the store, against the
 * payout email on file, and recorded here with a reference once sent. It
 * promises no transfer that has not happened.
 */
function StripeConnectUnavailableNotice({ affiliate }: { affiliate: Affiliate }) {
  return (
    <section className="affiliates-stripe-unavailable">
      <p>
        This store does not have automated Stripe payouts switched on, so there is nothing for you to
        connect. Payouts are sent to you off-system against{" "}
        <strong>{affiliate.payoutEmail}</strong>, and each one appears below with its reference once
        it has been sent.
      </p>
      {affiliate.stripeAccountId && (
        <p className="affiliates-meta">
          You connected a Stripe account earlier. It is kept on file, but nothing can be transferred
          to it until the store switches Stripe payouts back on.
        </p>
      )}
    </section>
  );
}

function StripeConnectPanel({ apiBase, affiliate }: { apiBase: string; affiliate: Affiliate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onboardingStatus = affiliate.stripeOnboardingStatus;

  if (onboardingStatus === "complete") {
    return (
      <p className="affiliates-stripe-status">
        ✓ Stripe payouts are set up. Earnings transfer automatically to your connected account.
      </p>
    );
  }

  async function startOnboarding() {
    setBusy(true);
    setError(null);
    try {
      const returnUrl = typeof window !== "undefined" ? window.location.href : "/portal/customer/affiliates";
      const data = await checkedJsonMutation<{ ok: boolean; onboardingUrl?: string }>(`${apiBase}/me/stripe/onboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl, refreshUrl: returnUrl }),
      }, {
        fallback: "Stripe onboarding could not be opened.",
        validate: payload => payload.ok === true && Boolean(payload.onboardingUrl),
      });
      window.location.href = data.onboardingUrl!;
    } catch (requestError) {
      setError(mutationErrorMessage(requestError, "Stripe onboarding could not be opened."));
    } finally { setBusy(false); }
  }

  async function refreshStatus() {
    setBusy(true);
    setError(null);
    try {
      await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/me/stripe/refresh`, { method: "POST" }, {
        fallback: "Stripe payout status could not be refreshed.",
        validate: payload => payload.ok === true,
      });
      window.location.reload();
    } catch (requestError) {
      setError(mutationErrorMessage(requestError, "Stripe payout status could not be refreshed."));
    } finally { setBusy(false); }
  }

  if (onboardingStatus === "pending") {
    return (
      <section className="affiliates-stripe-pending">
        <p>Onboarding in progress — finish the Stripe-hosted flow to unlock automated payouts.</p>
        <button type="button" onClick={startOnboarding} disabled={busy}>
          {busy ? "…" : "Resume Stripe onboarding"}
        </button>{" "}
        <button type="button" onClick={refreshStatus} disabled={busy}>
          {busy ? "…" : "I'm done — refresh status"}
        </button>
        {error && <p role="alert" className="affiliates-form-error">{error}</p>}
      </section>
    );
  }

  if (onboardingStatus === "restricted") {
    return (
      <section className="affiliates-stripe-restricted">
        <p>
          Stripe needs more information before you can receive payouts (identity verification or additional
          business details). Reopen the hosted flow to add what's missing.
        </p>
        <button type="button" onClick={startOnboarding} disabled={busy}>
          {busy ? "…" : "Reopen Stripe onboarding"}
        </button>
        {error && <p role="alert" className="affiliates-form-error">{error}</p>}
      </section>
    );
  }

  // No accountId yet — first-time setup CTA.
  return (
    <section className="affiliates-stripe-setup">
      <p>Set up Stripe to receive payouts directly to your bank account when each payout is processed.</p>
      <button type="button" onClick={startOnboarding} disabled={busy}>
        {busy ? "…" : "Set up payouts via Stripe"}
      </button>
      {error && <p role="alert" className="affiliates-form-error">{error}</p>}
    </section>
  );
}

function NewCodeForm({ apiBase }: { apiBase: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await checkedJsonMutation<{ ok: boolean }>(`${apiBase}/me/codes`, { method: "POST" }, {
              fallback: "A new referral code could not be generated.",
              validate: payload => payload.ok === true,
            });
            window.location.reload();
          } catch (requestError) {
            setError(mutationErrorMessage(requestError, "A new referral code could not be generated."));
          } finally { setBusy(false); }
        }}
      >
        {busy ? "…" : "+ Generate new code"}
      </button>
      {error && <span role="alert" className="affiliates-form-error">{error}</span>}
    </span>
  );
}
