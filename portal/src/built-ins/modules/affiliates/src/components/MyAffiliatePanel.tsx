"use client";

import { useState } from "react";

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
}

export function MyAffiliatePanel({ affiliate, codes, attributions, payouts, apiBase }: MyAffiliatePanelProps) {
  if (!affiliate) {
    return <EnrollForm apiBase={apiBase} />;
  }
  const earnedPaid = attributions.filter(a => a.status === "paid").reduce((s, a) => s + a.amountCents, 0);
  const earnedApproved = attributions.filter(a => a.status === "approved").reduce((s, a) => s + a.amountCents, 0);
  const earnedPending = attributions.filter(a => a.status === "pending").reduce((s, a) => s + a.amountCents, 0);

  return (
    <section className="affiliates-me">
      <header>
        <h1>{affiliate.displayName}'s referrals</h1>
        <span className={`affiliates-pill affiliates-pill-${affiliate.status}`}>{affiliate.status}</span>
      </header>
      <dl className="affiliates-stats">
        <div><dt>Total referred</dt><dd>{affiliate.totalReferred}</dd></div>
        <div><dt>Lifetime paid</dt><dd>{(earnedPaid / 100).toFixed(2)}</dd></div>
        <div><dt>Approved (next payout)</dt><dd>{(earnedApproved / 100).toFixed(2)}</dd></div>
        <div><dt>Pending</dt><dd>{(earnedPending / 100).toFixed(2)}</dd></div>
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
      <StripeConnectPanel apiBase={apiBase} affiliate={affiliate} />


      <h2>Recent attributions</h2>
      <ul className="affiliates-attribution-grid">
        {attributions.slice(0, 10).map(a => (
          <li key={a.id}>
            <article className="affiliates-attribution-card">
              <p>Order {a.orderId} · {a.commissionPercentSnapshot}% · {(a.amountCents / 100).toFixed(2)}</p>
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
              <p>{(p.amountCents / 100).toFixed(2)} via {p.method}</p>
              {p.externalRef && <p className="affiliates-meta">Ref: {p.externalRef}</p>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
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
            const r = await fetch(`${apiBase}/me/enroll`, {
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
          } finally { setBusy(false); }
        }}
      >
        <label>Display name<input name="displayName" /></label>
        <label>Payout email<input name="payoutEmail" type="email" required /></label>
        {error && <p className="affiliates-form-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Enrolling…" : "Enrol"}</button>
      </form>
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
      const r = await fetch(`${apiBase}/me/stripe/onboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnUrl, refreshUrl: returnUrl }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok || !data.onboardingUrl) {
        setError(data?.error ?? `Failed (${r.status})`);
        return;
      }
      window.location.href = data.onboardingUrl;
    } finally { setBusy(false); }
  }

  async function refreshStatus() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/me/stripe/refresh`, { method: "POST" });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data?.error ?? `Failed (${r.status})`);
        return;
      }
      window.location.reload();
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
        {error && <p className="affiliates-form-error">{error}</p>}
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
        {error && <p className="affiliates-form-error">{error}</p>}
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
      {error && <p className="affiliates-form-error">{error}</p>}
    </section>
  );
}

function NewCodeForm({ apiBase }: { apiBase: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`${apiBase}/me/codes`, { method: "POST" });
          window.location.reload();
        } finally { setBusy(false); }
      }}
    >
      {busy ? "…" : "+ Generate new code"}
    </button>
  );
}
