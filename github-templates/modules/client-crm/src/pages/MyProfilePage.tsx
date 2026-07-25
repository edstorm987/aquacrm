// Customer-facing profile page. `panelId: "customer"` so it lands on
// the end-customer surface. Auto-bootstraps a Contact via mergeFromUser
// if one doesn't yet exist.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function MyProfilePage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  let contact = await c.contacts.getByUser(props.actor);
  if (!contact) {
    contact = await c.contacts.mergeFromUser(props.actor, props.actor);
  }
  if (!contact) {
    return <p>No profile yet. Sign up to create one.</p>;
  }
  return (
    <section className="crm-my-profile">
      <header><h1>Your profile</h1></header>
      <dl className="crm-meta-grid">
        <div><dt>Name</dt><dd>{contact.name ?? "—"}</dd></div>
        <div><dt>Email</dt><dd>{contact.email}</dd></div>
        {contact.phone && <div><dt>Phone</dt><dd>{contact.phone}</dd></div>}
        <div><dt>Status</dt><dd>{contact.status}</dd></div>
        <div><dt>Member since</dt><dd>{new Date(contact.firstSeenAt).toISOString().slice(0, 10)}</dd></div>
      </dl>
      <p className="crm-meta">Tags + segments are managed by the agency. Contact support to update preferences.</p>
    </section>
  );
}
