import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { STATUS_LABELS, type TicketStatus } from "../lib/domain";

const STATUS_COLOUR: Record<TicketStatus, string> = {
  "new":              "rgba(60,120,200,0.15)",
  "in-progress":      "rgba(200,150,0,0.18)",
  "waiting-customer": "rgba(140,140,140,0.20)",
  "resolved":         "rgba(40,160,80,0.15)",
  "closed":           "rgba(0,0,0,0.10)",
};

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function InboxPage(props: PluginPageProps) {
  if (!props.clientId) return <section><h1>Inbox</h1><p>Open from a client portal.</p></section>;
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const sp = props.searchParams ?? {};
  const status = pickStr(sp.status) as TicketStatus | undefined;
  const items = await c.tickets.list({ status });

  return (
    <section>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <h1>Support inbox</h1>
          <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
            {items.length} ticket{items.length === 1 ? "" : "s"}{status ? ` · ${STATUS_LABELS[status]}` : ""}
          </p>
        </div>
        <div style={{ fontSize: 13 }}>
          <a href="filters">Filters</a> · <a href="settings">Settings</a>
        </div>
      </header>

      <nav aria-label="Status filter" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        <a href="?" aria-current={!status ? "true" : undefined}
           style={{ padding: "2px 8px", borderRadius: 999, background: !status ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.04)" }}>
          All
        </a>
        {(Object.keys(STATUS_LABELS) as TicketStatus[]).map(s => (
          <a key={s} href={`?status=${s}`} aria-current={status === s ? "true" : undefined}
             style={{ padding: "2px 8px", borderRadius: 999, background: status === s ? STATUS_COLOUR[s] : "rgba(0,0,0,0.04)" }}>
            {STATUS_LABELS[s]}
          </a>
        ))}
      </nav>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Ref</th>
            <th style={{ padding: 6 }}>Subject</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Priority</th>
            <th style={{ padding: 6 }}>Customer</th>
            <th style={{ padding: 6 }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No tickets yet.</td></tr>
          )}
          {items.map(t => (
            <tr key={t.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 13 }}>{t.ref}</td>
              <td style={{ padding: 6 }}><a href={`detail?id=${t.id}`}>{t.subject}</a></td>
              <td style={{ padding: 6 }}>
                <span style={{ padding: "1px 6px", borderRadius: 4, background: STATUS_COLOUR[t.status] }}>
                  {STATUS_LABELS[t.status]}
                </span>
              </td>
              <td style={{ padding: 6 }}>{t.priority}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{t.customerEmail}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(t.updatedAt).toISOString().slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
