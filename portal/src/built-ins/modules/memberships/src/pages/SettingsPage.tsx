// `/portal/clients/[clientId]/memberships/settings`
//
// The install block below used to be the whole page: currency and trial
// defaults printed as text, with no control anywhere that could change them.
// `defaultCurrency` is read for real — `PlansPage` seeds the new-plan modal
// from it — so that value was true and simply unreachable. `defaultTrialDays`
// is not: the modal defaults trial length to 0 and `seedDefaults` hardcodes
// 7/14, so printing it here was the only thing that made it look read. It is in
// `UNWIRED_SETTINGS`, so the panel labels it "Not connected".
//
// Memberships is `scopePolicy: "client"`, so the agency Settings hub
// deliberately does not edit it — a plan's currency belongs to a client, not to
// the agency (see `lib/chrome/settingsModules.ts`). The editor belongs here,
// mounted from the same generic `PluginSettingsPanel` every other module uses;
// the counts above it answer a different question and stay.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { PluginSettingsPanel } from "@/components/workspaces/PluginSettingsPanel";
import { canEditPluginSettings } from "@/lib/server/plugins/pluginSettingsAccess";

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
  // This page is visible to client-owner/client-staff too, but the settings
  // endpoint accepts only agency admins. They get the values read-only rather
  // than a Save button that can only 403.
  const canEdit = await canEditPluginSettings();
  const settings = describePluginSettings(props.install.pluginId, {
    agencyId: props.agencyId,
    clientId: props.clientId,
  });

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
      </dl>
      {settings ? (
        <PluginSettingsPanel initial={settings} clientId={props.clientId} canEdit={canEdit} />
      ) : (
        <p className="memberships-settings-empty">
          This client has no memberships settings to show — the module is not registered here.
        </p>
      )}
    </section>
  );
}
