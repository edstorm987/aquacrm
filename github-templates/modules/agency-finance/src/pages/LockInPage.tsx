import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function LockInPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const rows = await c.pnl.lockInRows();
  const totalDue = rows.reduce((s, r) => s + r.lockInFeeCents, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidCents, 0);

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Lock-in tracker</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {rows.length} clients on lock-in plans · {(totalPaid / 100).toFixed(2)} / {(totalDue / 100).toFixed(2)} collected
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Client</th>
            <th style={{ padding: 6 }}>Plan</th>
            <th style={{ padding: 6 }}>Lock-in</th>
            <th style={{ padding: 6 }}>Fee due</th>
            <th style={{ padding: 6 }}>Paid</th>
            <th style={{ padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No lock-in clients yet.</td></tr>
          )}
          {rows.map(r => (
            <tr key={`${r.clientId}-${r.planId}`} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{r.clientId}</td>
              <td style={{ padding: 6 }}>{r.planLabel}</td>
              <td style={{ padding: 6 }}>{r.lockInMonths}m</td>
              <td style={{ padding: 6 }}>{(r.lockInFeeCents / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>{(r.paidCents / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>
                <span style={{
                  padding: "1px 6px", borderRadius: 4, fontSize: 12,
                  background: r.paid ? "rgba(0,180,0,0.15)" : "rgba(200,0,0,0.12)",
                }}>
                  {r.paid ? "Paid" : "Outstanding"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: "rgba(0,0,0,0.5)", fontSize: 13, marginTop: 24 }}>
        Lock-in payments are detected by Payment.notes containing "lock-in" or
        externalRef starting "lockin_" — operator runbook documents the
        convention. T1 R002 R+1 will move this onto invoice
        <code>metadata.lockInPaid</code>.
      </p>
    </section>
  );
}
