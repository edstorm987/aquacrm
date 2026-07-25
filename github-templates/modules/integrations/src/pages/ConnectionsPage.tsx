import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { KIND_LABELS } from "../lib/domain";

const STATUS_COLOUR: Record<string, string> = {
  intended:   "rgba(0,0,0,0.10)",
  configured: "rgba(60,120,200,0.15)",
  verified:   "rgba(40,160,80,0.15)",
  failed:     "rgba(200,60,60,0.15)",
};

export default async function ConnectionsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const items = await c.integrations.list();
  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <h1>Connections</h1>
          <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
            {items.length} integration{items.length === 1 ? "" : "s"} configured.
            {props.clientId ? " (per-client scope)" : " (agency scope)"}
          </p>
        </div>
        <a href="browse">Browse catalog →</a>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Label</th>
            <th style={{ padding: 6 }}>Kind</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Last verified</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>
              No connections yet — pick a kind from the catalog to start.
            </td></tr>
          )}
          {items.map(i => (
            <tr key={i.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6 }}>{i.label}</td>
              <td style={{ padding: 6 }}>{KIND_LABELS[i.kind]}</td>
              <td style={{ padding: 6 }}>
                <span style={{ padding: "1px 6px", borderRadius: 4, background: STATUS_COLOUR[i.status] ?? "rgba(0,0,0,0.05)" }}>
                  {i.status}
                </span>
              </td>
              <td style={{ padding: 6, fontSize: 13 }}>{i.lastVerifiedAt ? new Date(i.lastVerifiedAt).toISOString().slice(0, 16).replace("T", " ") : "—"}</td>
              <td style={{ padding: 6, fontSize: 13 }}>
                <a href={`configure?id=${i.id}`}>Configure</a>{" · "}<a href={`verify?id=${i.id}`}>Verify</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
