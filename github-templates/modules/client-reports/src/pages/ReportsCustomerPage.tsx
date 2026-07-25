import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

// Customer-side block — published + shared reports only. Renders the
// `client-report-card` storefront block grammar.
export default async function ReportsCustomerPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 16 }}><p>No reports available.</p></section>;
  const reports = await c.reports.list({ sharedOnly: true });

  return (
    <section style={{ padding: 16, display: "grid", gap: 12 }} data-block="client-report-card">
      <header><h2 style={{ margin: 0 }}>Your reports</h2></header>
      {reports.length === 0 ? (
        <p style={{ color: "#888" }}>No reports have been shared yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {reports.map(r => (
            <li key={r.id} data-report-id={r.id}
                style={{ padding: 12, border: "1px solid #eee", borderRadius: 4 }}>
              <a href={`./reports/preview?id=${r.id}`} style={{ display: "grid", gap: 4, color: "inherit" }}>
                <strong>{r.title}</strong>
                <small style={{ color: "#666" }}>
                  Phase {r.phaseId} · published {r.publishedAt ? new Date(r.publishedAt).toISOString().slice(0, 10) : "—"}
                </small>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
