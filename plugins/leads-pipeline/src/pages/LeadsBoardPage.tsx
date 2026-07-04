// Server-rendered Leads pipeline board view. Mounted at
// `/portal/agency/pipelines/leads` (per the manifest navItem). v1 ships
// a placeholder — the real kanban host (T2 R+1, kanban plugin) reads
// `Pipeline` + `PipelineCard` rows from the foundation. Until then this
// page surfaces a flat list of leads grouped by their tracked column
// (or `New` when no card exists yet).

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function LeadsBoardPage(props: PluginPageProps) {
  const { leads } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });
  const all = await leads.list();
  const newColumn = all.filter(l => !l.pipelineCardId);
  const tracked = all.filter(l => l.pipelineCardId);

  return (
    <main data-testid="leads-pipeline-board" style={{ padding: 24 }}>
      <h1>Leads pipeline</h1>
      <p style={{ color: "#666" }}>
        Placeholder board — the kanban host (T2 R+1) renders the real
        column layout. Listing {all.length} lead{all.length === 1 ? "" : "s"} below.
      </p>
      <section data-testid="column-new">
        <h2>New ({newColumn.length})</h2>
        <ul>
          {newColumn.map(l => (
            <li key={l.id}>
              {l.email}{l.name ? ` — ${l.name}` : ""}{l.company ? ` · ${l.company}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section data-testid="column-tracked">
        <h2>Tracked on pipeline ({tracked.length})</h2>
        <ul>
          {tracked.map(l => (
            <li key={l.id}>
              {l.email} (card {l.pipelineCardId})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
