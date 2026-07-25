import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function NurturePage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const sp = props.searchParams ?? {};
  const idsRaw = pickStr(sp.leadIds) ?? "";
  const leadIds = idsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const overdue = leadIds.length > 0 ? await c.nurture.overdue(leadIds) : [];
  const recent = await c.nurture.list();
  const apiBase = "/api/portal/pre-sales-hq";

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Nurture loop</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>
          Re-Nurturing cadence — leads whose last non-replied touch is older than the configured cadence.
        </p>
      </header>

      <h2>Overdue</h2>
      <form method="get" style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <input name="leadIds" defaultValue={idsRaw} placeholder="lead_a,lead_b,lead_c" style={{ flex: 1 }} />
        <button type="submit">Check overdue</button>
      </form>
      {leadIds.length === 0 ? (
        <p style={{ color: "rgba(0,0,0,0.5)" }}>Provide a comma-separated lead-id list (typically pulled from <code>client-crm</code>).</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>Lead</th>
              <th style={{ padding: 6 }}>Days since last touch</th>
              <th style={{ padding: 6 }}>Last type</th>
            </tr>
          </thead>
          <tbody>
            {overdue.length === 0 && <tr><td colSpan={3} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>No overdue leads.</td></tr>}
            {overdue.map(o => (
              <tr key={o.leadId} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{o.leadId}</td>
                <td style={{ padding: 6 }}>
                  {o.daysSinceLastTouch === Number.MAX_SAFE_INTEGER ? "never touched" : `${o.daysSinceLastTouch}d`}
                </td>
                <td style={{ padding: 6, fontSize: 13 }}>{o.lastTouchType ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Recent touches</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>When</th>
            <th style={{ padding: 6 }}>Lead</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Response</th>
            <th style={{ padding: 6 }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {recent.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>—</td></tr>}
          {recent.slice(0, 50).map(t => (
            <tr key={t.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <td style={{ padding: 6, fontSize: 13 }}>{new Date(t.sentAt).toISOString().slice(0, 10)}</td>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{t.leadId}</td>
              <td style={{ padding: 6 }}>{t.type}</td>
              <td style={{ padding: 6 }}>{t.response ?? "—"}</td>
              <td style={{ padding: 6, fontSize: 12, color: "rgba(0,0,0,0.65)" }}>{t.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Record touch</h2>
      <form action={`${apiBase}/nurture/record`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Lead id<input name="leadId" required /></label>
        <label>Type
          <select name="type" defaultValue="email">
            <option value="email">Email</option>
            <option value="call">Call</option>
            <option value="linkedin">LinkedIn</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Response
          <select name="response" defaultValue="">
            <option value="">(none)</option>
            <option value="replied">Replied</option>
            <option value="no-response">No response</option>
            <option value="bounced">Bounced</option>
          </select>
        </label>
        <label>Notes<textarea name="notes" rows={2} /></label>
        <button type="submit">Record</button>
      </form>
    </section>
  );
}
