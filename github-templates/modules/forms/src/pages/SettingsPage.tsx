import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const [forms, submissions, templates] = await Promise.all([
    c.forms.list(),
    c.submissions.list(),
    c.templates.list(),
  ]);
  return (
    <section className="forms-settings">
      <header><h1>Settings</h1><p>Forms install state.</p></header>
      <dl className="forms-meta-grid">
        <div><dt>Forms (published)</dt><dd>{forms.filter(f => f.status === "published").length} / {forms.length}</dd></div>
        <div><dt>Submissions</dt><dd>{submissions.length} total ({submissions.filter(s => s.status === "pending").length} pending)</dd></div>
        <div><dt>Templates</dt><dd>{templates.length}</dd></div>
      </dl>
      <h2>Spam protection</h2>
      <p className="forms-meta">
        Per-form spam protection lives on each FormDefinition's
        `spamProtection` field. Defaults: enabled, minSecondsBetweenSubmits=10.
        Public submit endpoint enforces both per-IP and per-form
        windows; bot submissions surface as `status: "spam"`.
      </p>
      <h2>Install</h2>
      <dl className="forms-meta-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Scope</dt><dd>{props.clientId ? `client ${props.clientId}` : `agency ${props.agencyId}`}</dd></div>
        <div><dt>Default notify emails</dt><dd>{(props.install.config.defaultNotifyEmails as string | undefined) ?? "—"}</dd></div>
      </dl>
    </section>
  );
}
