// MRR report — sum of active monthly + (annual / 12). Same simple
// definition the prompt called for; doesn't account for proration,
// trials, refunds, or upgrades-mid-cycle. v1.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

function fmt(cents: number, currency: string): string {
  const symbol = currency === "usd" ? "$" : currency === "gbp" ? "£" : currency === "eur" ? "€" : "";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export default async function ReportsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>memberships requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [plans, subscribers] = await Promise.all([
    c.plans.list(),
    c.subscriptions.list(),
  ]);
  const planById = new Map(plans.map(p => [p.id, p]));
  const active = subscribers.filter(s => s.status === "active" || s.status === "trialing");

  // Compute MRR per currency. If multiple currencies are in play we
  // surface a per-currency breakdown — converting between them isn't
  // in scope for v1.
  const mrrByCurrency = new Map<string, number>();
  for (const sub of active) {
    const plan = planById.get(sub.planId);
    if (!plan) continue;
    const monthlyCents = sub.billing === "annual"
      ? Math.round(plan.priceAnnual / 12)
      : plan.priceMonthly;
    mrrByCurrency.set(plan.currency, (mrrByCurrency.get(plan.currency) ?? 0) + monthlyCents);
  }

  // Per-plan headcount for the breakdown table.
  const headcountByPlan = new Map<string, number>();
  for (const sub of active) {
    headcountByPlan.set(sub.planId, (headcountByPlan.get(sub.planId) ?? 0) + 1);
  }

  return (
    <section className="memberships-reports">
      <header><h1>Reports</h1><p>Snapshot of active subscriptions.</p></header>
      <dl className="memberships-settings-grid">
        <div><dt>Active subscribers</dt><dd>{active.length}</dd></div>
        {[...mrrByCurrency.entries()].map(([currency, cents]) => (
          <div key={currency}><dt>MRR ({currency.toUpperCase()})</dt><dd>{fmt(cents, currency)}</dd></div>
        ))}
      </dl>
      <h2>Plan breakdown</h2>
      <table className="memberships-reports-table">
        <thead>
          <tr><th>Plan</th><th>Active</th><th>Monthly equiv per seat</th></tr>
        </thead>
        <tbody>
          {plans.map(p => {
            const seats = headcountByPlan.get(p.id) ?? 0;
            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{seats}</td>
                <td>{fmt(p.priceMonthly, p.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
