import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function TouchpointsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const sp = props.searchParams ?? {};
  const leadId = typeof sp.leadId === "string" ? sp.leadId : undefined;
  const items = await c.touchpoints.list(leadId ? { leadId } : {});

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Touchpoints</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {items.length} recorded{leadId ? ` for lead ${leadId}` : ""}
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>When</th>
            <th style={{ padding: 6 }}>Lead</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Channel</th>
            <th style={{ padding: 6 }}>Summary</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>
              No touchpoints recorded yet.
            </td></tr>
          )}
          {items.map(t => (
            <tr key={t.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(t.at).toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{t.leadId}</td>
              <td style={{ padding: 6 }}>{t.type}</td>
              <td style={{ padding: 6 }}>{t.channel}</td>
              <td style={{ padding: 6, color: "rgba(0,0,0,0.7)" }}>{t.summary ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
