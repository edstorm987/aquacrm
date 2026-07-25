import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { STATUS_LABELS } from "../lib/domain";

const COLOURS = {
  green: "rgba(0,180,0,0.15)",
  amber: "rgba(220,160,0,0.20)",
  red: "rgba(200,0,0,0.18)",
  unknown: "rgba(0,0,0,0.06)",
} as const;

export default async function StatusBoardPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const items = await c.status.list();
  const apiBase = "/api/portal/agency-ops";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Status board</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>{items.length} systems tracked</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        {items.length === 0 && (
          <div style={{ color: "rgba(0,0,0,0.5)" }}>No systems yet — add your first below.</div>
        )}
        {items.map(s => (
          <div key={s.id} style={{
            background: COLOURS[s.status], padding: 12, borderRadius: 6,
            border: "1px solid rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "rgba(0,0,0,0.55)" }}>{STATUS_LABELS[s.status]}</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{s.system}</div>
            {s.message && <div style={{ fontSize: 13, marginTop: 4 }}>{s.message}</div>}
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginTop: 8 }}>
              {s.lastChecked ? `Checked ${new Date(s.lastChecked).toISOString().slice(0, 16).replace("T", " ")}` : "Never checked"}
            </div>
            <form action={`${apiBase}/status/check?id=${s.id}`} method="post" style={{ marginTop: 8, display: "flex", gap: 4 }}>
              <select name="status" defaultValue="green">
                <option value="green">Green</option>
                <option value="amber">Amber</option>
                <option value="red">Red</option>
              </select>
              <button type="submit">Mark check done</button>
            </form>
          </div>
        ))}
      </div>

      <h2>Add system</h2>
      <form action={`${apiBase}/status/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>System name<input name="system" required /></label>
        <label>Initial status
          <select name="status" defaultValue="unknown">
            <option value="unknown">Unknown</option>
            <option value="green">Green</option>
            <option value="amber">Amber</option>
            <option value="red">Red</option>
          </select>
        </label>
        <button type="submit">Add</button>
      </form>
    </section>
  );
}
