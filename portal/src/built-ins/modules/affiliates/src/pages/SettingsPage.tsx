// `/portal/clients/[clientId]/affiliates/settings`
//
// This page listed the install's configured values in a read-only <dl> —
// "Default commission %: 10" — with no control anywhere in the product that
// could change any of them. Both `general` fields are genuinely consumed —
// `defaultCommissionPercent` (commission resolution) and `defaultPayoutMethod`
// (payout creation) — so those numbers were real and simply unreachable. The
// former `payoutCadence` (nothing scheduled payouts by it) and the "auto-approve
// after N days" declaration (never enforced) were removed on 2026-09-02 rather
// than kept as stored promises.
//
// The agency Settings hub deliberately refuses to edit them (see
// `lib/chrome/settingsModules.ts`): affiliates is `scopePolicy: "client"`, so
// an agency-scoped form would save values the client-scoped read never looks
// at. The editor therefore belongs HERE, where the client is unambiguous —
// the same shape ecommerce uses.
//
// `PluginSettingsPanel` is generic and already does the whole job; the install
// summary above it stays, because "what is configured" and "what is happening"
// are different questions.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { PluginSettingsPanel } from "@/components/workspaces/PluginSettingsPanel";
import { canEditPluginSettings } from "@/lib/server/plugins/pluginSettingsAccess";

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
  // This page is visible to client-owner/client-staff too, but the settings
  // endpoint accepts only agency admins. They get the values read-only rather
  // than a Save button that can only 403.
  const canEdit = await canEditPluginSettings();
  const settings = describePluginSettings(props.install.pluginId, {
    agencyId: props.agencyId,
    clientId: props.clientId,
  });
  return (
    <section className="affiliates-settings">
      <header><h1>Settings</h1><p>Affiliates install state.</p></header>
      <dl className="affiliates-settings-grid">
        <div><dt>Active affiliates</dt><dd>{active}</dd></div>
        <div><dt>Pending approvals</dt><dd>{pending}</dd></div>
        <div><dt>Approved attributions (next payout)</dt><dd>{approvedAttr}</dd></div>
        <div><dt>Completed payouts</dt><dd>{completedPayouts}</dd></div>
      </dl>
      {settings ? (
        <PluginSettingsPanel initial={settings} clientId={props.clientId} canEdit={canEdit} />
      ) : (
        <p className="affiliates-settings-empty">
          This client has no affiliates settings to show — the module is not registered here.
        </p>
      )}
    </section>
  );
}
