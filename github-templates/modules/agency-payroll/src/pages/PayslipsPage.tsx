import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { PayeeKind } from "../lib/domain";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function PayslipsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const sp = props.searchParams ?? {};
  const periodId = pickStr(sp.periodId);
  const kindRaw = pickStr(sp.kind);
  const payeeKind: PayeeKind | undefined = (kindRaw === "employee" || kindRaw === "contractor")
    ? (kindRaw as PayeeKind) : undefined;

  const items = await c.payslips.list({ periodId, payeeKind });
  return (
    <section>
      <h1>Payslips</h1>
      <nav aria-label="Kind filter" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <a href={periodId ? `?periodId=${periodId}` : `?`}
           aria-current={!payeeKind ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: !payeeKind ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>All</a>
        <a href={`?kind=employee${periodId ? `&periodId=${periodId}` : ""}`}
           aria-current={payeeKind === "employee" ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: payeeKind === "employee" ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>Employees</a>
        <a href={`?kind=contractor${periodId ? `&periodId=${periodId}` : ""}`}
           aria-current={payeeKind === "contractor" ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: payeeKind === "contractor" ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>Contractors</a>
      </nav>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Payee</th>
            <th style={{ padding: 6 }}>Kind</th>
            <th style={{ padding: 6 }}>Gross</th>
            <th style={{ padding: 6 }}>Net</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No payslips for this filter.</td></tr>
          )}
          {items.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>{p.payeeName}</td>
              <td style={{ padding: 6 }}>{p.payeeKind}</td>
              <td style={{ padding: 6 }}>{p.currency} {(p.gross / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>{p.currency} {(p.net / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>
                {p.paidAt
                  ? <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(40,160,80,0.15)" }}>paid</span>
                  : <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(200,150,0,0.15)" }}>unpaid</span>}
              </td>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(p.createdAt).toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
