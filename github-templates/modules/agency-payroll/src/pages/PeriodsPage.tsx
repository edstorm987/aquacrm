import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { periodKey } from "../lib/domain";

export default async function PeriodsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const periods = await c.periods.list();
  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <h1>Pay periods</h1>
          <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
            {periods.length} period{periods.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Period</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Started</th>
            <th style={{ padding: 6 }}>Closed</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {periods.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No pay periods yet — open one to start tracking payslips.</td></tr>
          )}
          {periods.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>{periodKey(p.year, p.month)}</td>
              <td style={{ padding: 6 }}>
                <span style={{ padding: "1px 6px", borderRadius: 4, background: p.status === "open" ? "rgba(40,160,80,0.15)" : "rgba(0,0,0,0.10)" }}>
                  {p.status}
                </span>
              </td>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(p.startedAt).toISOString().slice(0, 10)}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{p.closedAt ? new Date(p.closedAt).toISOString().slice(0, 10) : "—"}</td>
              <td style={{ padding: 6 }}>
                <a href={`../payslips?periodId=${p.id}`}>View payslips →</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
