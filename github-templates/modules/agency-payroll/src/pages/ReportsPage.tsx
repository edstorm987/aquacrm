import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { periodKey } from "../lib/domain";

export default async function ReportsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const periods = await c.periods.list();

  // Honesty contract — render empty-state when no periods or no paid
  // payslips across all periods. Don't fabricate zero totals.
  const rows = await Promise.all(periods.map(async p => ({
    period: p,
    totals: await c.reports.totalsForPeriod(p.id),
  })));
  const anyData = rows.some(r => r.totals.hasData);

  return (
    <section>
      <h1>Payroll reports</h1>

      {!anyData && (
        <div style={{ padding: 16, background: "rgba(0,0,0,0.04)", borderRadius: 8, marginBottom: 16 }}>
          <strong>No paid payslips yet.</strong>
          <p style={{ margin: "4px 0 0", color: "rgba(0,0,0,0.6)" }}>
            Open a pay period, add payslips, and mark them paid — totals will appear here.
            <br />
            <a href=".">Open a period →</a>
          </p>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Period</th>
            <th style={{ padding: 6 }}>Paid count</th>
            <th style={{ padding: 6 }}>Paid gross</th>
            <th style={{ padding: 6 }}>Paid net</th>
            <th style={{ padding: 6 }}>By kind</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ period, totals }) => (
            <tr key={period.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>{periodKey(period.year, period.month)}</td>
              <td style={{ padding: 6 }}>{totals.paidCount} / {totals.totalCount}</td>
              <td style={{ padding: 6 }}>{(totals.paidGross / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>{(totals.paidNet / 100).toFixed(2)}</td>
              <td style={{ padding: 6, fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
                emp {totals.byKind.employee.paidCount} · ctr {totals.byKind.contractor.paidCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
