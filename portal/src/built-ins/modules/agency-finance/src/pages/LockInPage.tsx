import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FinanceNav } from "../components/FinanceNav";
import { formatMoney } from "../lib/currencies";

export default async function LockInPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [rows, clients] = await Promise.all([
    c.pnl.lockInRows(),
    Promise.resolve(c.tenant.listClients?.(props.agencyId) ?? []),
  ]);

  // Money on this page used to be `(cents / 100).toFixed(2)` — a bare number
  // with no currency at all, on a screen whose whole job is "how much is owed
  // and how much arrived". Every other finance surface formats through
  // `formatMoney`; so does this one now. The plan carries the currency it was
  // priced in; the agency default only fills a gap.
  // …and the client column used to print the raw `cli_…` id. Nobody who reads
  // this page knows those by sight.
  const clientName = new Map(clients.map(client => [client.id, client.name]));

  // The header totals span plans that may be priced differently, so they are
  // stated per currency rather than added into one meaningless number.
  const byCurrency = new Map<string, { due: number; paid: number }>();
  for (const row of rows) {
    const code = row.currency;
    const bucket = byCurrency.get(code) ?? { due: 0, paid: 0 };
    bucket.due += row.lockInFeeCents;
    bucket.paid += row.paidCents;
    byCurrency.set(code, bucket);
  }
  const collected = [...byCurrency.entries()]
    .map(([code, total]) => `${formatMoney(total.paid, code)} / ${formatMoney(total.due, code)}`)
    .join(" · ");

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      <FinanceNav active="deposits" />
      <div>
      <header style={{ marginBottom: 16 }}>
        <h1>Deposit tracker</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {rows.length} {rows.length === 1 ? "client" : "clients"} with deposits
          {collected ? ` · ${collected} collected` : ""}
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Client</th>
            <th style={{ padding: 6 }}>Plan</th>
            <th style={{ padding: 6 }}>Term</th>
            <th style={{ padding: 6 }}>Fee due</th>
            <th style={{ padding: 6 }}>Paid</th>
            <th style={{ padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No client deposits yet.</td></tr>
          )}
          {rows.map(r => {
            const code = r.currency;
            const name = clientName.get(r.clientId);
            return (
              <tr key={`${r.clientId}-${r.planId}`} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <td style={{ padding: 6 }}>
                  {/* A client we cannot name is said to be unnamed, not dressed
                      up as one — the id stays visible so it is still traceable. */}
                  {name ?? <span style={{ color: "rgba(0,0,0,0.55)" }}>Unnamed client</span>}
                  <span style={{ display: "block", fontFamily: "monospace", fontSize: 11, color: "rgba(0,0,0,0.35)" }}>{r.clientId}</span>
                </td>
                <td style={{ padding: 6 }}>{r.planLabel}</td>
                <td style={{ padding: 6 }}>{r.lockInMonths}m</td>
                <td style={{ padding: 6 }}>{formatMoney(r.lockInFeeCents, code)}</td>
                <td style={{ padding: 6 }}>{formatMoney(r.paidCents, code)}</td>
                <td style={{ padding: 6 }}>
                  <span style={{
                    padding: "1px 6px", borderRadius: 4, fontSize: 12,
                    background: r.paid ? "rgba(0,180,0,0.15)" : "rgba(200,0,0,0.12)",
                  }}>
                    {r.paid ? "Paid" : "Outstanding"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ color: "rgba(0,0,0,0.5)", fontSize: 13, marginTop: 24 }}>
        Deposits are matched to the related client invoice and payment record.
      </p>
      </div>
    </section>
  );
}
