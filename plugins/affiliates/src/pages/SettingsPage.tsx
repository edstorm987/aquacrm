import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

export default async function SettingsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>affiliates requires a client scope.</p>;
  const c = containerFor({
    agencyId: props.agencyId,
    clientId: props.clientId,
    storage: props.storage,
    install: props.install,
  });
  const [affiliates, attributions, payouts] = await Promise.all([
    c.affiliates.list(),
    c.attributions.list(),
    c.payouts.list(),
  ]);
  const active = affiliates.filter(a => a.status === "active").length;
  const pending = affiliates.filter(a => a.status === "pending").length;
  const approvedAttr = attributions.filter(a => a.status === "approved").length;
  const completedPayouts = payouts.filter(p => p.status === "completed").length;
  return (
    <section className="affiliates-settings">
      <header><h1>Settings</h1><p>Affiliates install state.</p></header>
      <dl className="affiliates-settings-grid">
        <div><dt>Active affiliates</dt><dd>{active}</dd></div>
        <div><dt>Pending approvals</dt><dd>{pending}</dd></div>
        <div><dt>Approved attributions (next payout)</dt><dd>{approvedAttr}</dd></div>
        <div><dt>Completed payouts</dt><dd>{completedPayouts}</dd></div>
      </dl>
      <h2>Install</h2>
      <dl className="affiliates-settings-grid">
        <div><dt>Default commission %</dt><dd>{(props.install.config.defaultCommissionPercent as number | undefined) ?? 10}</dd></div>
        <div><dt>Default payout method</dt><dd>{(props.install.config.defaultPayoutMethod as string | undefined) ?? "manual"}</dd></div>
        <div><dt>Payout cadence</dt><dd>{(props.install.config.payoutCadence as string | undefined) ?? "monthly"}</dd></div>
      </dl>
    </section>
  );
}
