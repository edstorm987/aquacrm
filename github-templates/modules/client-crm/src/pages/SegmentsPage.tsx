import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SegmentsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const segments = await c.segments.list();
  // Member-counts per segment.
  const counts = await Promise.all(segments.map(async s => ({
    id: s.id,
    count: (await c.segments.listMembers(s.id)).length,
  })));
  const countById = new Map(counts.map(c => [c.id, c.count]));
  return (
    <section className="crm-segments">
      <header><h1>Segments</h1><p>{segments.length} total ({segments.filter(s => s.isDefault).length} default).</p></header>
      <ul className="crm-list">
        {segments.map(s => (
          <li key={s.id}>
            <article>
              <header>
                <h3>{s.name}</h3>
                <span className={`crm-pill crm-pill-${s.status}`}>{s.status}</span>
              </header>
              {s.description && <p className="crm-meta">{s.description}</p>}
              <p className="crm-meta">{countById.get(s.id) ?? 0} members · {s.rules.length} rule{s.rules.length === 1 ? "" : "s"}</p>
              {s.isDefault && <p className="crm-meta">Default segment (non-deletable; archive to hide).</p>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
