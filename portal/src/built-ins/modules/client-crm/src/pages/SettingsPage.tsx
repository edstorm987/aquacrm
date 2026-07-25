import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const [contacts, segments] = await Promise.all([c.contacts.list(), c.segments.list()]);
  return (
    <section className="crm-settings">
      <header><h1>Settings</h1><p>Client-CRM install state.</p></header>
      <dl className="crm-meta-grid">
        <div><dt>Active contacts</dt><dd>{contacts.filter(c => c.status === "active").length}</dd></div>
        <div><dt>Total contacts</dt><dd>{contacts.length}</dd></div>
        <div><dt>Segments</dt><dd>{segments.length}</dd></div>
      </dl>
      <h2>Custom attribute schema</h2>
      <p className="crm-meta">
        Custom attributes are stored per-contact under `attributes`. Define
        a schema by setting `install.config.customAttributeSchema` to a
        JSON array of {`{ key, label, type }`}. v1 uses freeform string
        attributes only — UI is read-only here; structured editor is a
        future round.
      </p>
      <h2>Install</h2>
      <dl className="crm-meta-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
      </dl>
    </section>
  );
}
