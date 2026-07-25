import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { _containerFromCtx } from "../server/foundationAdapter";

export default async function PulseDashboardPage(props: PluginPageProps) {
  const c = _containerFromCtx({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage });
  if (!c) return <section style={{ padding: 24 }}><p>Foundation not registered.</p></section>;
  const summary = await c.pulses.summary();
  const pulses = await c.pulses.list();

  return (
    <section style={{ padding: 24, display: "grid", gap: 16 }}>
      <header><h1>Pulse</h1></header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Sent" value={summary.totalSent} />
        <Stat label="Responded" value={`${summary.totalResponded} (${Math.round(summary.responseRate * 100)}%)`} />
        <Stat label="Average" value={summary.avgScore !== undefined ? summary.avgScore.toFixed(1) : "—"} />
        <Stat label="Detractors" value={summary.detractors} flag={summary.detractors > 0} />
      </div>

      <h2 style={{ fontSize: 14, textTransform: "uppercase", color: "#666", marginBottom: 0 }}>Recent</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {pulses.length === 0 && <li style={{ color: "#888" }}>No pulses sent yet.</li>}
        {pulses.map(p => {
          const isDetractor = p.score !== undefined && p.score < 6;
          return (
            <li key={p.id} data-pulse-id={p.id} data-score={p.score ?? ""}
                style={{ padding: 8, border: "1px solid #eee", borderRadius: 4, display: "flex", gap: 8 }}>
              <span style={{ width: 32, fontWeight: 600, color: isDetractor ? "#a33" : "#333" }}>
                {p.score ?? "—"}
              </span>
              <span style={{ flex: 1 }}>{p.respondent}</span>
              <small style={{ color: "#888" }}>
                {p.respondedAt ? `replied ${new Date(p.respondedAt).toISOString().slice(0,10)}` : `sent ${new Date(p.sentAt).toISOString().slice(0,10)}`}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat(props: { label: string; value: string | number; flag?: boolean }) {
  return (
    <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 4, background: props.flag ? "#fff3f3" : "#fff" }}>
      <small style={{ color: "#666", display: "block" }}>{props.label}</small>
      <strong style={{ fontSize: 24 }}>{props.value}</strong>
    </div>
  );
}
