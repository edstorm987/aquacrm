// `/portal/clients/[clientId]/ecommerce/settings`
//
// Ecommerce declares three Stripe credentials in `settings.groups.stripe` —
// vault-backed, per client — and until now had no page rendering them. The
// module also declares a `setup` block naming which of those it cannot work
// without, and nothing read that either.
//
// Both gaps were the same gap: `PluginSettingsPanel` is generic and already
// does the whole job, and only `agency-finance` had ever mounted it. This page
// mounts it for ecommerce, and the panel's Finish-setup banner reads the
// module's own `setup` requirements against what the vault actually holds.
//
// CLIENT-SCOPED, deliberately. Every ecommerce page lives under a client, and
// the Stripe keys belong to that client's own Stripe account — `describePluginSettings`
// is therefore given `clientId`, so one client's settings can never be read or
// written through another's page.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { canEditPluginSettings } from "@/lib/server/plugins/pluginSettingsAccess";
import { PluginSettingsPanel } from "@/components/workspaces/PluginSettingsPanel";

export default async function SettingsPage(props: PluginPageProps) {
  const canEdit = await canEditPluginSettings();
  const settings = describePluginSettings(props.install.pluginId, {
    agencyId: props.agencyId,
    ...(props.clientId ? { clientId: props.clientId } : {}),
  });

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 pb-12">
      <header>
        <h1 className="text-lg font-semibold text-black/85">Store settings</h1>
        <p className="mt-1 text-sm text-black/50">
          Stripe credentials and checkout defaults for this client&apos;s store.
        </p>
      </header>

      {settings ? (
        <PluginSettingsPanel initial={settings} clientId={props.clientId} canEdit={canEdit} />
      ) : (
        <p className="rounded-md border border-black/10 bg-black/[0.02] px-4 py-3 text-sm text-black/55">
          This store has no settings to show — the ecommerce module is not registered here.
        </p>
      )}
    </section>
  );
}
