import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function WebhooksPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const items = await c.webhooks.list({ direction: "incoming" });
  return (
    <section>
      <h1>Incoming webhooks</h1>
      <p style={{ color: "rgba(0,0,0,0.6)" }}>
        Placeholder log — receivers wire in T6. {items.length} entr{items.length === 1 ? "y" : "ies"}.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>When</th>
            <th style={{ padding: 6 }}>Integration</th>
            <th style={{ padding: 6 }}>OK</th>
            <th style={{ padding: 6 }}>Body preview</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>
              No incoming webhooks yet.
            </td></tr>
          )}
          {items.map(e => (
            <tr key={e.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(e.ts).toISOString().slice(0, 19).replace("T", " ")}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{e.integrationId ?? "—"}</td>
              <td style={{ padding: 6 }}>{e.ok ? "✓" : "✗"}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12, color: "rgba(0,0,0,0.65)" }}>{e.bodyPreview ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
