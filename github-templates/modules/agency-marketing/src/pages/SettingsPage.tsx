import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  const c = containerFor({ agencyId: props.agencyId, storage: props.storage, install: props.install });
  const [campaigns, leads, templates] = await Promise.all([
    c.campaigns.list(),
    c.leads.list(),
    c.templates.list(),
  ]);
  const running = campaigns.filter(c => c.status === "running").length;
  const newLeads = leads.filter(l => l.status === "new").length;
  const activeTpls = templates.filter(t => t.status === "active").length;
  return (
    <section className="marketing-settings">
      <header><h1>Settings</h1><p>Agency-marketing install state.</p></header>
      <dl className="marketing-stats">
        <div><dt>Running campaigns</dt><dd>{running}</dd></div>
        <div><dt>New leads</dt><dd>{newLeads}</dd></div>
        <div><dt>Active templates</dt><dd>{activeTpls}</dd></div>
      </dl>
      <h2>Install</h2>
      <dl className="marketing-stats">
        <div><dt>Default currency</dt><dd>{(props.install.config.defaultCurrency as string | undefined) ?? "usd"}</dd></div>
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
      </dl>
    </section>
  );
}
