import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { PROPOSAL_STATUSES } from "../lib/domain";

const STATUS_BG: Record<string, string> = {
  draft: "rgba(0,0,0,0.04)",
  sent: "rgba(0,80,200,0.10)",
  accepted: "rgba(0,180,0,0.12)",
  rejected: "rgba(200,0,0,0.12)",
  withdrawn: "rgba(0,0,0,0.06)",
};

export default async function ProposalsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const proposals = await c.proposals.list();
  const apiBase = "/api/portal/pre-sales-hq";

  const buckets = Object.fromEntries(PROPOSAL_STATUSES.map(s => [s, [] as typeof proposals])) as Record<string, typeof proposals>;
  for (const p of proposals) buckets[p.status]!.push(p);

  return (
    <section>
      <header style={{ marginBottom: 16 }}>
        <h1>Proposals</h1>
        <p style={{ color: "rgba(0,0,0,0.6)", margin: 0 }}>{proposals.length} on file</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        {PROPOSAL_STATUSES.map(s => (
          <div key={s} style={{ padding: 12, background: STATUS_BG[s], borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: "rgba(0,0,0,0.55)" }}>{s}</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{buckets[s]!.length}</div>
          </div>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
            <th style={{ padding: 6 }}>Lead</th>
            <th style={{ padding: 6 }}>Amount</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Sent</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {proposals.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: "rgba(0,0,0,0.5)" }}>—</td></tr>}
          {proposals.map(p => (
            <tr key={p.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", background: STATUS_BG[p.status] }}>
              <td style={{ padding: 6, fontFamily: "monospace", fontSize: 12 }}>{p.leadId}</td>
              <td style={{ padding: 6 }}>{(p.amountCents / 100).toFixed(2)} {p.currency.toUpperCase()}</td>
              <td style={{ padding: 6, textTransform: "capitalize" }}>{p.status}</td>
              <td style={{ padding: 6, fontSize: 13 }}>{p.sentAt ? new Date(p.sentAt).toISOString().slice(0, 10) : "—"}</td>
              <td style={{ padding: 6 }}>
                {p.status === "draft" && (
                  <form action={`${apiBase}/proposals/transition?id=${p.id}&status=sent`} method="post" style={{ display: "inline" }}>
                    <button type="submit">Mark sent</button>
                  </form>
                )}
                {p.status === "sent" && (
                  <>
                    <form action={`${apiBase}/proposals/transition?id=${p.id}&status=accepted`} method="post" style={{ display: "inline" }}>
                      <button type="submit">Accept</button>
                    </form>
                    <form action={`${apiBase}/proposals/transition?id=${p.id}&status=rejected`} method="post" style={{ display: "inline", marginLeft: 4 }}>
                      <button type="submit">Reject</button>
                    </form>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>New proposal</h2>
      <form action={`${apiBase}/proposals/create`} method="post" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <label>Lead id<input name="leadId" required /></label>
        <label>Amount (cents)<input name="amountCents" type="number" min={0} required /></label>
        <label>Currency<input name="currency" defaultValue="gbp" /></label>
        <button type="submit">Create draft</button>
      </form>
    </section>
  );
}
