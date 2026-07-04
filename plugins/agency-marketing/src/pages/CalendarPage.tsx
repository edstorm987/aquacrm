import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

const DAY_MS = 86_400_000;

export default async function CalendarPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const sp = props.searchParams ?? {};
  const fromRaw = typeof sp.from === "string" ? Number(sp.from) : Date.now();
  const startOfWeek = Math.floor(fromRaw / DAY_MS) * DAY_MS;
  const window = await c.content.window(startOfWeek, startOfWeek + 7 * DAY_MS);

  return (
    <section>
      <header style={{ marginBottom: 12 }}>
        <h1>Content calendar</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {window.buckets.reduce((s, b) => s + b.items.length, 0)} scheduled · {window.unscheduledCount} unscheduled drafts
        </p>
        <p style={{ marginTop: 4 }}>
          <a href={`?from=${startOfWeek - 7 * DAY_MS}`}>← Prev week</a>
          {"  "}<a href="?">Today</a>
          {"  "}<a href={`?from=${startOfWeek + 7 * DAY_MS}`}>Next week →</a>
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 8 }}>
        {window.buckets.map(bucket => (
          <div key={bucket.day} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 6, minHeight: 120 }}>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginBottom: 6 }}>{bucket.day}</div>
            {bucket.items.length === 0 && <div style={{ color: "rgba(0,0,0,0.3)", fontSize: 12 }}>—</div>}
            {bucket.items.map(c => (
              <div key={c.id} style={{
                fontSize: 12, padding: 4, marginBottom: 4, borderRadius: 4,
                background: c.status === "published" ? "rgba(0,180,0,0.08)" : "rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div style={{ color: "rgba(0,0,0,0.6)" }}>{c.channel} · {c.status}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
