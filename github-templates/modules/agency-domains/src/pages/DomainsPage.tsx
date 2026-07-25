import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { STATUS_LABELS, type DomainStatus } from "../lib/domain";

const STATUS_BG: Record<DomainStatus, string> = {
  pending: "rgba(0,0,0,0.04)",
  verifying: "rgba(220,160,0,0.12)",
  active: "rgba(0,180,0,0.12)",
  failed: "rgba(200,0,0,0.14)",
};

export default async function DomainsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>agency-domains is client-scoped.</p>;
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const attaches = await c.domains.list();
  const apiBase = "/api/portal/agency-domains";
  const sp = props.searchParams ?? {};
  const expanded = typeof sp.expand === "string" ? sp.expand : null;

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Custom domains</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          {attaches.length} attach{attaches.length === 1 ? "" : "es"} on file. Real DNS verification ships with T6 — for now operators flip status manually after confirming the records resolve.
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Hostname</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Verified at</th>
            <th style={{ padding: 6 }}>Last error</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {attaches.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>
              No domains yet. Add one below.
            </td></tr>
          )}
          {attaches.map(a => {
            const isExpanded = expanded === a.id;
            return (
              <>
                <tr key={a.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", background: STATUS_BG[a.status] }}>
                  <td style={{ padding: 6, fontFamily: "monospace" }}>{a.hostname}</td>
                  <td style={{ padding: 6 }}>{STATUS_LABELS[a.status]}</td>
                  <td style={{ padding: 6, fontSize: 13 }}>
                    {a.verifiedAt ? new Date(a.verifiedAt).toISOString().slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: 6, fontSize: 13, color: "rgba(0,0,0,0.7)" }}>{a.lastError ?? "—"}</td>
                  <td style={{ padding: 6 }}>
                    <a href={isExpanded ? "?" : `?expand=${a.id}`}>{isExpanded ? "Hide records" : "Show records"}</a>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, background: "rgba(0,0,0,0.02)" }}>
                      <strong>NS records to set on the registrar:</strong>
                      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
                            <th style={{ padding: 4 }}>Name</th>
                            <th style={{ padding: 4 }}>Type</th>
                            <th style={{ padding: 4 }}>Value</th>
                            <th style={{ padding: 4 }}>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.nsRecords.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                              <td style={{ padding: 4, fontFamily: "monospace" }}>{r.name}</td>
                              <td style={{ padding: 4 }}>{r.type}</td>
                              <td style={{ padding: 4, fontFamily: "monospace" }}>{r.value}</td>
                              <td style={{ padding: 4, color: "rgba(0,0,0,0.6)" }}>{r.notes ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                        {a.status === "pending" && (
                          <form action={`${apiBase}/transition?id=${a.id}&status=verifying`} method="post" style={{ display: "inline" }}>
                            <button type="submit">Mark verifying</button>
                          </form>
                        )}
                        {a.status === "verifying" && (
                          <>
                            <form action={`${apiBase}/transition?id=${a.id}&status=active`} method="post" style={{ display: "inline" }}>
                              <button type="submit">Mark active</button>
                            </form>
                            <form action={`${apiBase}/transition?id=${a.id}&status=failed`} method="post" style={{ display: "inline" }}>
                              <button type="submit">Mark failed</button>
                            </form>
                          </>
                        )}
                        {a.status === "failed" && (
                          <form action={`${apiBase}/transition?id=${a.id}&status=verifying`} method="post" style={{ display: "inline" }}>
                            <button type="submit">Retry</button>
                          </form>
                        )}
                        <form action={`${apiBase}/delete?id=${a.id}`} method="delete" style={{ display: "inline" }}>
                          <button type="submit" style={{ color: "#a00" }}>Delete</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      <h2>New attach</h2>
      <form action={`${apiBase}/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Hostname<input name="hostname" placeholder="felicia.example.com" required /></label>
        <button type="submit">Record attach intent</button>
      </form>

      <p style={{ color: "rgba(0,0,0,0.5)", fontSize: 13, marginTop: 24 }}>
        For production-wired DNS + TLS, switch to <code>@aqua/plugin-domains</code> (chapter #50) — runs Vercel attach,
        DNS polling, and verification round-trips.
      </p>
    </section>
  );
}
