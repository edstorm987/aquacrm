import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

export default async function ReportsListPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 24 }}><p>Foundation not registered or no client scope.</p></section>;
  const reports = await c.reports.list();
  const drafts = reports.filter(r => r.status === "draft");
  const published = reports.filter(r => r.status === "published" || r.status === "sent");

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header><h1>Reports</h1></header>

      <Group title="Drafts" reports={drafts} />
      <Group title="Published / sent" reports={published} />
    </section>
  );
}

function Group(props: { title: string; reports: { id: string; title: string; status: string; phaseId: string; createdAt: number; sharedWithCustomer: boolean }[] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "#666" }}>{props.title}</h2>
      {props.reports.length === 0 ? (
        <p style={{ color: "#888", fontSize: 14 }}>None.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
          {props.reports.map(r => (
            <li key={r.id} data-report-id={r.id} data-status={r.status}
                style={{ padding: 12, border: "1px solid #eee", borderRadius: 4, display: "grid", gap: 4 }}>
              <strong>{r.title}</strong>
              <small style={{ color: "#888" }}>
                {r.status} · phase {r.phaseId} · {new Date(r.createdAt).toISOString().slice(0, 10)}
                {r.sharedWithCustomer ? " · shared" : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
