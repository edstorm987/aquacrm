import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function LeadsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const leads = await c.leads.list();
  return (
    <section className="marketing-leads">
      <header><h1>Leads</h1><p>{leads.length} total.</p></header>
      <ul className="marketing-list">
        {leads.map(l => (
          <li key={l.id}>
            <article>
              <header>
                <h3>{l.name ?? l.email}</h3>
                <span className={`marketing-pill marketing-pill-lead-${l.status}`}>{l.status}</span>
              </header>
              <p className="marketing-meta">{l.email}</p>
              {l.phone && <p className="marketing-meta">{l.phone}</p>}
              <p className="marketing-meta">Source: {l.source}</p>
              {l.lastContactedAt && (
                <p className="marketing-meta">Last contacted {new Date(l.lastContactedAt).toISOString().slice(0, 10)}</p>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
