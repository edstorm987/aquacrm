import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { SEVERITY_LABELS, type IncidentSeverity } from "../lib/domain";

const SEVERITY_BG: Record<IncidentSeverity, string> = {
  minor: "rgba(220,160,0,0.10)",
  major: "rgba(200,80,0,0.15)",
  critical: "rgba(200,0,0,0.18)",
};

export default async function IncidentsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId, storage: props.storage, install: props.install,
  });
  const sp = props.searchParams ?? {};
  const showResolved = (typeof sp.resolved === "string" ? sp.resolved : "") === "1";
  const incidents = await c.incidents.list(showResolved ? { resolved: true } : { resolved: false });
  const apiBase = "/api/portal/agency-ops";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Incidents</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {incidents.length} {showResolved ? "resolved" : "open"} incidents
          {"  "}
          <a href={showResolved ? "?" : "?resolved=1"}>
            ({showResolved ? "show open" : "show resolved"})
          </a>
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Severity</th>
            <th style={{ padding: 6 }}>Title</th>
            <th style={{ padding: 6 }}>Started</th>
            <th style={{ padding: 6 }}>Resolved</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {incidents.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>None.</td></tr>
          )}
          {incidents.map(i => (
            <tr key={i.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", background: SEVERITY_BG[i.severity] }}>
              <td style={{ padding: 6, textTransform: "capitalize" }}>{SEVERITY_LABELS[i.severity]}</td>
              <td style={{ padding: 6 }}>
                <div style={{ fontWeight: 600 }}>{i.title}</div>
                {i.notes && <div style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}>{i.notes}</div>}
              </td>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(i.startedAt).toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={{ padding: 6, fontSize: 13 }}>
                {i.resolvedAt ? new Date(i.resolvedAt).toISOString().slice(0, 16).replace("T", " ") : "—"}
              </td>
              <td style={{ padding: 6 }}>
                {!i.resolvedAt && (
                  <form action={`${apiBase}/incidents/resolve?id=${i.id}`} method="post" style={{ display: "inline" }}>
                    <button type="submit">Resolve</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Open incident</h2>
      <form action={`${apiBase}/incidents/open`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Title<input name="title" required /></label>
        <label>Severity
          <select name="severity" defaultValue="minor">
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label>Notes<textarea name="notes" rows={3} /></label>
        <button type="submit">Open</button>
      </form>
    </section>
  );
}
