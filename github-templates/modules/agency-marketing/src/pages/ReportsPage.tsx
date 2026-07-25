import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ReportsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const to = Date.now();
  const from = to - 365 * 24 * 60 * 60 * 1000;
  const [campaigns, funnel] = await Promise.all([
    c.reports.campaignSnapshot({ from, to }),
    c.reports.leadFunnel({ from, to }),
  ]);
  return (
    <section className="marketing-reports">
      <header><h1>Reports</h1><p>Trailing 12 months.</p></header>

      <h2>Campaigns by channel</h2>
      <table className="marketing-table">
        <thead><tr><th>Channel</th><th>Count</th><th>Budget (cents)</th><th>Result</th></tr></thead>
        <tbody>
          {campaigns.byChannel.map(r => (
            <tr key={r.channel}>
              <td>{r.channel}</td>
              <td>{r.count}</td>
              <td>{r.budgetCents}</td>
              <td>{r.resultTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Lead funnel</h2>
      <dl className="marketing-stats">
        <div><dt>Total</dt><dd>{funnel.total}</dd></div>
        <div><dt>New</dt><dd>{funnel.newCount}</dd></div>
        <div><dt>Contacted</dt><dd>{funnel.contactedCount}</dd></div>
        <div><dt>Qualified</dt><dd>{funnel.qualifiedCount}</dd></div>
        <div><dt>Converted</dt><dd>{funnel.convertedCount}</dd></div>
        <div><dt>Conversion rate</dt><dd>{(funnel.conversionRate * 100).toFixed(1)}%</dd></div>
      </dl>
    </section>
  );
}
