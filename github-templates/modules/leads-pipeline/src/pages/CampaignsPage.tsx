// Server-rendered Campaigns page — list + new + send.
// Mounted at `/portal/agency/leads-pipeline/campaigns`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function CampaignsPage(props: PluginPageProps) {
  const { campaigns } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });
  const list = await campaigns.list();

  return (
    <main data-testid="leads-pipeline-campaigns" style={{ padding: 24 }}>
      <h1>Campaigns</h1>
      <p style={{ color: "#666" }}>
        Single-shot email blasts. Drafts are editable; once sent, the row
        becomes read-only. Drip sequences land in a future round.
      </p>

      <section data-testid="campaigns-list">
        <h2>All campaigns ({list.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Subject</th>
              <th>Recipients</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id} data-testid={`campaign-${c.id}`}>
                <td>{c.name}</td>
                <td>{c.status}</td>
                <td>{c.subject}</td>
                <td>{c.recipients}</td>
                <td>{c.sentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section data-testid="new-campaign">
        <h2>New campaign</h2>
        <p>API: <code>POST /api/portal/leads-pipeline/campaigns</code> →
          (draft) · then <code>POST /api/portal/leads-pipeline/campaigns/send</code>{" "}
          with the returned id.</p>
      </section>
    </main>
  );
}
