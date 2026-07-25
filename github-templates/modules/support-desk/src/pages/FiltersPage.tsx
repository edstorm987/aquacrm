import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { STATUS_LABELS, TICKET_PRIORITIES } from "../lib/domain";

export default async function FiltersPage(props: PluginPageProps) {
  if (!props.clientId) return <section><h1>Filters</h1><p>Open from a client portal.</p></section>;
  const c = containerFor({
    agencyId: props.agencyId, clientId: props.clientId,
    storage: props.storage, install: props.install,
  });
  const all = await c.tickets.list();
  const byStatus = (Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[])
    .map(s => ({ status: s, count: all.filter(t => t.status === s).length }));
  const byPriority = TICKET_PRIORITIES
    .map(p => ({ priority: p, count: all.filter(t => t.priority === p).length }));
  const tagCounts = new Map<string, number>();
  for (const t of all) for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  return (
    <section>
      <h1>Filters</h1>
      <h2>By status</h2>
      <ul>
        {byStatus.map(({ status, count }) => (
          <li key={status}><a href={`./?status=${status}`}>{STATUS_LABELS[status]}</a> · {count}</li>
        ))}
      </ul>
      <h2>By priority</h2>
      <ul>
        {byPriority.map(({ priority, count }) => (
          <li key={priority}>{priority} · {count}</li>
        ))}
      </ul>
      <h2>Tags</h2>
      {tagCounts.size === 0 ? <p style={{ color: "rgba(0,0,0,0.5)" }}>No tags yet.</p> : (
        <ul>{[...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <li key={t}>{t} · {n}</li>
        ))}</ul>
      )}
    </section>
  );
}
