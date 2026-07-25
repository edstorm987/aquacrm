import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>memberships requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [plans, benefits, subscribers] = await Promise.all([
    c.plans.list(),
    c.benefits.list(),
    c.subscriptions.list(),
  ]);
  const active = subscribers.filter(s => s.status === "active" || s.status === "trialing");

  return (
    <section className="memberships-settings">
      <header><h1>Settings</h1><p>Memberships install state.</p></header>
      <dl className="memberships-settings-grid">
        <div><dt>Plans</dt><dd>{plans.length} ({plans.filter(p => p.status === "active").length} active)</dd></div>
        <div><dt>Benefits</dt><dd>{benefits.length}</dd></div>
        <div><dt>Subscribers</dt><dd>{subscribers.length} ({active.length} active/trialing)</dd></div>
      </dl>
      <h2>Install</h2>
      <dl className="memberships-settings-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
        <div><dt>Currency default</dt><dd>{(props.install.config.defaultCurrency as string) ?? "usd"}</dd></div>
        <div><dt>Trial default</dt><dd>{(props.install.config.defaultTrialDays as number) ?? 0} days</dd></div>
      </dl>
    </section>
  );
}
