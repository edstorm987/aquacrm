import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  const c = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
    install: props.install,
  });
  const [provider, identities] = await Promise.all([
    c.provider.get(),
    c.identities.list(),
  ]);
  const verifiedCount = identities.filter(i => i.status === "active").length;
  const defaultIdentity = identities.find(i => i.isDefault);
  return (
    <section className="email-sender-settings">
      <header><h1>Settings</h1><p>Provider configuration + sender identities.</p></header>

      <h2>Provider</h2>
      <dl className="email-sender-meta-grid">
        <div><dt>Provider</dt><dd>{provider.provider}</dd></div>
        <div><dt>Status</dt><dd>{provider.status}</dd></div>
        <div><dt>API key</dt><dd>{provider.apiKeyMasked || "(none — set to enable real send)"}</dd></div>
        <div><dt>Webhook secret</dt><dd>{provider.webhookSecret ? "configured" : "(none — provider events will be rejected)"}</dd></div>
        <div><dt>Last tested</dt><dd>{provider.testedAt ? new Date(provider.testedAt).toISOString() : "—"}</dd></div>
      </dl>

      <h2>Sender identities</h2>
      {identities.length === 0 ? (
        <p className="email-sender-empty">No sender identities yet. Create one to start sending.</p>
      ) : (
        <table className="email-sender-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Default</th><th>Verified</th></tr>
          </thead>
          <tbody>
            {identities.map(i => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.email}</td>
                <td>{i.status}</td>
                <td>{i.isDefault ? "yes" : "—"}</td>
                <td>{i.verifiedAt ? new Date(i.verifiedAt).toISOString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="email-sender-meta">
        {verifiedCount}/{identities.length} verified · default: {defaultIdentity?.email ?? "—"}
      </p>

      <h2>Install</h2>
      <dl className="email-sender-meta-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Scope</dt><dd>agency {props.agencyId}</dd></div>
      </dl>
    </section>
  );
}
