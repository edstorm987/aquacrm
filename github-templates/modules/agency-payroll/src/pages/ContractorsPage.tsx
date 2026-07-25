import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ContractorsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const items = await c.contractors.list({ includeArchived: true });
  return (
    <section>
      <h1>Contractors</h1>
      <p style={{ color: "rgba(0,0,0,0.6)" }}>{items.length} contractor{items.length === 1 ? "" : "s"}.</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Name</th>
            <th style={{ padding: 6 }}>Email</th>
            <th style={{ padding: 6 }}>Hourly rate</th>
            <th style={{ padding: 6 }}>Linked staff</th>
            <th style={{ padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No contractors yet.</td></tr>
          )}
          {items.map(ct => (
            <tr key={ct.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", opacity: ct.archived ? 0.5 : 1 }}>
              <td style={{ padding: 6 }}>{ct.name}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{ct.email ?? "—"}</td>
              <td style={{ padding: 6 }}>{ct.hourlyRate !== undefined ? `${ct.currency ?? ""} ${(ct.hourlyRate / 100).toFixed(2)}` : "—"}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{ct.staffId ?? "—"}</td>
              <td style={{ padding: 6 }}>{ct.archived ? "archived" : "active"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
