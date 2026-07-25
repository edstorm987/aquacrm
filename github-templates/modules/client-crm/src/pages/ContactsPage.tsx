import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ContactsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const [contacts, segments] = await Promise.all([c.contacts.list(), c.segments.list()]);
  return (
    <section className="crm-contacts">
      <header><h1>Contacts</h1><p>{contacts.length} total · {segments.length} segments.</p></header>
      <ul className="crm-list">
        {contacts.map(ct => (
          <li key={ct.id}>
            <article>
              <header>
                <h3>{ct.name ?? ct.email}</h3>
                <span className={`crm-pill crm-pill-${ct.status}`}>{ct.status}</span>
              </header>
              <p className="crm-meta">{ct.email}</p>
              {ct.phone && <p className="crm-meta">{ct.phone}</p>}
              <p className="crm-meta">Source: {ct.source}{ct.endCustomerUserId ? " · linked" : ""}</p>
              {ct.tags.length > 0 && <p className="crm-meta">Tags: {ct.tags.join(", ")}</p>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
