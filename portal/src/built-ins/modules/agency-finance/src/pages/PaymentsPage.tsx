import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function PaymentsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const payments = await c.payments.list();
  const apiBase = "/api/portal/agency-finance";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Payments</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>{payments.length} recorded payments</p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Paid</th>
            <th style={{ padding: 6 }}>Invoice</th>
            <th style={{ padding: 6 }}>Client</th>
            <th style={{ padding: 6 }}>Method</th>
            <th style={{ padding: 6 }}>Amount</th>
            <th style={{ padding: 6 }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No payments recorded yet.</td></tr>
          )}
          {payments.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(p.paidAt).toISOString().slice(0, 10)}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{p.invoiceId}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{p.clientId}</td>
              <td style={{ padding: 6 }}>{p.method}</td>
              <td style={{ padding: 6 }}>{(p.amountCents / 100).toFixed(2)} {p.currency.toUpperCase()}</td>
              <td style={{ padding: 6, color: "rgba(0,0,0,0.6)" }}>{p.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Record payment</h2>
      <form action={`${apiBase}/payments/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Invoice id<input name="invoiceId" required style={{ width: "100%" }} /></label>
        <label>Amount (cents)<input name="amountCents" type="number" min={1} required /></label>
        <label>Currency<input name="currency" defaultValue="gbp" required /></label>
        <label>Method
          <select name="method" defaultValue="bank-transfer">
            <option value="stripe">Stripe</option>
            <option value="bank-transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="manual">Manual</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Notes<input name="notes" /></label>
        <button type="submit">Record</button>
      </form>
    </section>
  );
}
