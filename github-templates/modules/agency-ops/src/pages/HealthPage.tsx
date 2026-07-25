import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function HealthPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const overview = await c.health.overview();

  if (!overview.hasData) {
    return (
      <section>
        <header style={{ marginBottom: 16 }}><h1>Health overview</h1></header>
        <div style={{
          padding: 24, border: "1px dashed rgba(0,0,0,0.2)", borderRadius: 8,
          background: "rgba(0,0,0,0.02)", textAlign: "center",
        }}>
          <h2 style={{ marginTop: 0 }}>No ops data yet</h2>
          <p style={{ color: "rgba(0,0,0,0.6)" }}>
            Add a system on the Status board, seed default recurring tasks,
            or open an incident to populate this view. We don't fabricate data.
          </p>
          <p style={{ marginTop: 16 }}>
            <a href="status">Status board →</a>{"   "}
            <a href="tasks">Recurring tasks →</a>{"   "}
            <a href="incidents">Incidents →</a>
          </p>
        </div>
      </section>
    );
  }

  const sysOk = overview.systems.red === 0 && overview.incidents.criticalOpen === 0;

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Health overview</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {sysOk ? "✅ All systems within tolerance" : "⚠️ Investigate the red items below."}
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Tile label="Systems green" value={`${overview.systems.green} / ${overview.systems.total}`} />
        <Tile label="Systems red" value={String(overview.systems.red)} accent={overview.systems.red > 0} />
        <Tile label="Tasks overdue" value={String(overview.recurringTasks.overdueCount)} accent={overview.recurringTasks.overdueCount > 0} />
        <Tile label="Open incidents" value={`${overview.incidents.open}${overview.incidents.criticalOpen ? ` (${overview.incidents.criticalOpen} critical)` : ""}`} accent={overview.incidents.criticalOpen > 0} />
      </div>

      <h2>Quick links</h2>
      <ul>
        <li><a href="status">Status board</a> — {overview.systems.amber + overview.systems.unknown} non-green systems</li>
        <li><a href="tasks">Recurring tasks</a> — {overview.recurringTasks.active} active, {overview.recurringTasks.overdueCount} overdue</li>
        <li><a href="incidents">Incidents</a> — {overview.incidents.open} open, {overview.incidents.resolved} resolved historically</li>
      </ul>
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 12,
      background: accent ? "rgba(200,0,0,0.10)" : "rgba(255,255,255,0.5)",
    }}>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
