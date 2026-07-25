// Server-rendered Contacts page — CSV import + contact list.
// Mounted at `/portal/agency/leads-pipeline/contacts`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function ContactsPage(props: PluginPageProps) {
  const { contacts, leads } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });
  const [contactList, leadList] = await Promise.all([
    contacts.list(),
    leads.list(),
  ]);

  return (
    <main data-testid="leads-pipeline-contacts" style={{ padding: 24 }}>
      <h1>Contacts &amp; leads</h1>

      <section data-testid="csv-import">
        <h2>Import CSV</h2>
        <p>Upload a CSV with at least an <code>email</code> column. Other
          columns recognised: <code>name</code>, <code>phone</code> /{" "}
          <code>mobile</code>, <code>company</code>, <code>tags</code>,{" "}
          <code>source</code>, <code>notes</code>.</p>
        <form
          action="/api/portal/leads-pipeline/import-csv"
          method="POST"
          encType="multipart/form-data"
        >
          <input type="file" name="file" accept=".csv,text/csv" required />
          <input type="text" name="defaultSource" placeholder="default source (optional)" />
          <input type="text" name="defaultTags" placeholder="default tags (comma-separated, optional)" />
          <button type="submit">Import</button>
        </form>
      </section>

      <section data-testid="leads-list">
        <h2>Leads ({leadList.length})</h2>
        <ul>
          {leadList.map(l => (
            <li key={l.id}>
              {l.email} · {l.source}{l.tags.length ? ` · [${l.tags.join(", ")}]` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="contacts-list">
        <h2>Contacts ({contactList.length})</h2>
        <ul>
          {contactList.map(c => (
            <li key={c.id}>
              [{c.type}] {c.email}{c.name ? ` — ${c.name}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
