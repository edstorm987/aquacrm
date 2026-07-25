import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ActivityPage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const [activity, contacts] = await Promise.all([
    c.activity.list({ limit: 200 }),
    c.contacts.list(),
  ]);
  const contactById = new Map(contacts.map(c => [c.id, c]));
  return (
    <section className="crm-activity-page">
      <header><h1>Activity</h1><p>{activity.length} recent events.</p></header>
      <ol className="crm-activity">
        {activity.map(a => {
          const contact = contactById.get(a.contactId);
          return (
            <li key={a.id}>
              <article>
                <header>
                  <span className={`crm-pill crm-pill-${a.kind}`}>{a.kind}</span>
                  <strong>{contact?.name ?? contact?.email ?? a.contactId}</strong>
                  <time>{new Date(a.occurredAt).toISOString().slice(0, 10)}</time>
                </header>
                <p>{a.summary}</p>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
