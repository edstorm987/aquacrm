import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ContactDetailPage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const id = props.segments[0];
  if (!id) return <p>contact id required.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const contact = await c.contacts.get(id);
  if (!contact) return <p>Contact not found.</p>;
  const activity = await c.activity.listForContact(id, 100);
  return (
    <section className="crm-contact-detail">
      <header>
        <h1>{contact.name ?? contact.email}</h1>
        <span className={`crm-pill crm-pill-${contact.status}`}>{contact.status}</span>
      </header>
      <dl className="crm-meta-grid">
        <div><dt>Email</dt><dd>{contact.email}</dd></div>
        {contact.phone && <div><dt>Phone</dt><dd>{contact.phone}</dd></div>}
        <div><dt>Source</dt><dd>{contact.source}</dd></div>
        <div><dt>First seen</dt><dd>{new Date(contact.firstSeenAt).toISOString().slice(0, 10)}</dd></div>
        {contact.lastSeenAt && (
          <div><dt>Last seen</dt><dd>{new Date(contact.lastSeenAt).toISOString().slice(0, 10)}</dd></div>
        )}
      </dl>
      {contact.tags.length > 0 && (
        <p className="crm-tags">Tags: {contact.tags.join(", ")}</p>
      )}
      <h2>Activity timeline</h2>
      <ol className="crm-activity">
        {activity.map(a => (
          <li key={a.id}>
            <article>
              <header>
                <span className={`crm-pill crm-pill-${a.kind}`}>{a.kind}</span>
                <time>{new Date(a.occurredAt).toISOString().slice(0, 10)}</time>
              </header>
              <p>{a.summary}</p>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
