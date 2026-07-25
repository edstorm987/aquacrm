import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function CallsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const calls = await c.calls.list();
  const upcoming = calls.filter(x => x.outcome === "scheduled" && x.scheduledAt > Date.now());
  const past = calls.filter(x => x.outcome !== "scheduled" || x.scheduledAt <= Date.now());
  const apiBase = "/api/portal/pre-sales-hq";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Discovery calls</h1>
      </header>

      <h2>Upcoming ({upcoming.length})</h2>
      <CallTable rows={upcoming} apiBase={apiBase} />

      <h2 style={{ marginTop: 24 }}>Past ({past.length})</h2>
      <CallTable rows={past} apiBase={apiBase} />

      <h2 style={{ marginTop: 24 }}>Schedule call</h2>
      <form action={`${apiBase}/calls/schedule`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Lead id<input name="leadId" required /></label>
        <label>Scheduled at (epoch ms)<input name="scheduledAt" type="number" required /></label>
        <label>Notes<textarea name="notes" rows={2} /></label>
        <button type="submit">Schedule</button>
      </form>
    </section>
  );
}

function CallTable({ rows, apiBase }: { rows: { id: string; leadId: string; scheduledAt: number; outcome: string; notes?: string }[]; apiBase: string }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
          <th style={{ padding: 6 }}>Lead</th>
          <th style={{ padding: 6 }}>Scheduled</th>
          <th style={{ padding: 6 }}>Outcome</th>
          <th style={{ padding: 6 }}>Notes</th>
          <th style={{ padding: 6 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>—</td></tr>}
        {rows.map(c => (
          <tr key={c.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
            <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{c.leadId}</td>
            <td style={{ padding: 6, fontSize: 13 }}>{new Date(c.scheduledAt).toISOString().slice(0, 16).replace("T", " ")}</td>
            <td style={{ padding: 6, textTransform: "capitalize" }}>{c.outcome}</td>
            <td style={{ padding: 6, fontSize: 12, color: "rgba(0,0,0,0.65)" }}>{c.notes ?? ""}</td>
            <td style={{ padding: 6 }}>
              {c.outcome === "scheduled" && (
                <form action={`${apiBase}/calls/update?id=${c.id}`} method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="outcome" value="completed" />
                  <input type="hidden" name="completedAt" value={String(Date.now())} />
                  <button type="submit">Mark done</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
