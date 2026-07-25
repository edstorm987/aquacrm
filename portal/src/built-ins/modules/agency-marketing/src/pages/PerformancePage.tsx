import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function PerformancePage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const summary = await c.performance.summary(Date.now());

  if (!summary.hasData) {
    return (
      <section>
        <header style={{ marginBottom: 16 }}>
          <h1>Performance</h1>
        </header>
        <div style={{
          padding: 24, border: "1px dashed rgba(0,0,0,0.2)", borderRadius: 8,
          background: "rgba(0,0,0,0.02)", textAlign: "center",
        }}>
          <h2 style={{ marginTop: 0 }}>No marketing activity yet</h2>
          <p style={{ color: "rgba(0,0,0,0.6)" }}>
            Real numbers will appear here once you create a campaign or log
            a touchpoint. We don't fabricate data.
          </p>
        </div>
      </section>
    );
  }

  const max = Math.max(1, ...summary.weeklyTouchpoints);

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Performance</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          12-week rolling marketing snapshot.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Tile label="Campaigns" value={`${summary.campaigns.active} / ${summary.campaigns.total}`} sub="active / total" />
        <Tile label="Content" value={`${summary.content.scheduled} / ${summary.content.published}`} sub="scheduled / published" />
        <Tile label="Touchpoints (12w)" value={String(summary.touchpoints.total)} />
        <Tile label="Lead replies" value={String(summary.touchpoints.byType.find(b => b.type === "reply")?.count ?? 0)} />
      </div>

      <h2>Weekly touchpoints (sparkline)</h2>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, marginBottom: 24 }}>
        {summary.weeklyTouchpoints.map((n, i) => (
          <div key={i} style={{
            width: 24, height: `${(n / max) * 100}%`,
            background: "var(--brand-primary, #4a6cf7)", opacity: n === 0 ? 0.15 : 1,
            borderRadius: 2,
          }} title={`Week ${i + 1}: ${n}`} />
        ))}
      </div>

      <h2>Touchpoints by type</h2>
      <ul>
        {summary.touchpoints.byType.map(b => (
          <li key={b.type}>{b.type} — {b.count}</li>
        ))}
      </ul>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 12,
      background: "rgba(255,255,255,0.5)",
    }}>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)" }}>{sub}</div>}
    </div>
  );
}
