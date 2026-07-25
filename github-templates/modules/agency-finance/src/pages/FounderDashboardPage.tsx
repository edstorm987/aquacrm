import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function FounderDashboardPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const snapshot = await c.pnl.founderSnapshot(Date.now());

  if (!snapshot.hasData) {
    return (
      <section>
        <header style={{ marginBottom: 16 }}>
          <h1>Founder dashboard</h1>
        </header>
        <div style={{
          padding: 24, border: "1px dashed rgba(0,0,0,0.2)", borderRadius: 8,
          background: "rgba(0,0,0,0.02)", textAlign: "center",
        }}>
          <h2 style={{ marginTop: 0 }}>Connect billing to see live numbers</h2>
          <p style={{ color: "rgba(0,0,0,0.6)" }}>
            We're not showing fabricated numbers. Once you've created a plan or
            issued an invoice, MRR / ARR / churn / trailing P&amp;L will fill in
            from your real data.
          </p>
          <p style={{ marginTop: 16 }}>
            <a href="plans">Create your first plan →</a>{"  "}<a href="invoices">Issue an invoice →</a>
          </p>
        </div>
      </section>
    );
  }

  const cur = snapshot.currency.toUpperCase();
  const fmt = (cents: number): string => `${(cents / 100).toFixed(2)} ${cur}`;

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Founder dashboard</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>Live agency-wide health snapshot.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Tile label="MRR" value={fmt(snapshot.mrrCents)} />
        <Tile label="ARR" value={fmt(snapshot.arrCents)} />
        <Tile label="Active clients" value={String(snapshot.activeClients)} />
        <Tile label="Churn (30d)" value={`${(snapshot.churnRate * 100).toFixed(1)}%`} />
      </div>

      <h2>Trailing 12 months</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Month</th>
            <th style={{ padding: 6 }}>Revenue</th>
            <th style={{ padding: 6 }}>Expenses</th>
            <th style={{ padding: 6 }}>Net</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.trailingMonths.map(m => (
            <tr key={`${m.year}-${m.month}`} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>{m.year}-{String(m.month).padStart(2, "0")}</td>
              <td style={{ padding: 6 }}>{fmt(m.revenueCents)}</td>
              <td style={{ padding: 6 }}>{fmt(m.expensesCents)}</td>
              <td style={{ padding: 6, color: m.netCents < 0 ? "#a00" : "inherit" }}>{fmt(m.netCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Top clients (lifetime)</h2>
      {snapshot.topClients.length === 0 && <p style={{ color: "rgba(0,0,0,0.5)" }}>No payments recorded yet.</p>}
      <ol>
        {snapshot.topClients.map(t => (
          <li key={t.clientId}><code>{t.clientId}</code> — {fmt(t.lifetimeCents)}</li>
        ))}
      </ol>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 12,
      background: "rgba(255,255,255,0.5)",
    }}>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
