import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function PlansPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const plans = await c.plans.list(true);
  const apiBase = "/api/portal/agency-finance";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Plans</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {plans.length} plans · {plans.reduce((s, p) => s + p.clientIds.length, 0)} client assignments
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Tier</th>
            <th style={{ padding: 6 }}>Label</th>
            <th style={{ padding: 6 }}>Monthly</th>
            <th style={{ padding: 6 }}>Lock-in</th>
            <th style={{ padding: 6 }}>Clients</th>
            <th style={{ padding: 6 }}>Active</th>
          </tr>
        </thead>
        <tbody>
          {plans.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No plans yet.</td></tr>
          )}
          {plans.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", opacity: p.active ? 1 : 0.5 }}>
              <td style={{ padding: 6, textTransform: "capitalize" }}>{p.tier}</td>
              <td style={{ padding: 6 }}>{p.label}</td>
              <td style={{ padding: 6 }}>{(p.monthlyAmountCents / 100).toFixed(2)} {p.currency.toUpperCase()}</td>
              <td style={{ padding: 6, fontSize: 13 }}>
                {p.lockInMonths ? `${p.lockInMonths}m · ${(p.lockInFeeCents / 100).toFixed(2)} ${p.currency.toUpperCase()} fee` : "—"}
              </td>
              <td style={{ padding: 6 }}>{p.clientIds.length}</td>
              <td style={{ padding: 6 }}>{p.active ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>New plan</h2>
      <form action={`${apiBase}/plans/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Tier
          <select name="tier" defaultValue="growth">
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="scale">Scale</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>Label<input name="label" required /></label>
        <label>Monthly (cents)<input name="monthlyAmountCents" type="number" min={0} required /></label>
        <label>Lock-in months<input name="lockInMonths" type="number" min={0} defaultValue={0} /></label>
        <label>Lock-in fee (cents)<input name="lockInFeeCents" type="number" min={0} defaultValue={0} /></label>
        <button type="submit">Create plan</button>
      </form>
    </section>
  );
}
