// Setup surface for outbound email.
//
// This page used to be a read-only report: it printed the provider row and the
// identity table and offered no control at all, so a fresh install could be
// inspected but never configured. The routes it needed already existed and had
// no caller anywhere in `src/`. The server half stays here (it reads the
// authoritative ProviderService/IdentityService rows); the controls live in the
// client component beside it.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { redactProviderConfig } from "../server/provider";
import SettingsClient from "./SettingsClient";

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
      <header>
        <h1>Settings</h1>
        <p>Provider configuration, sender identities and a test send.</p>
      </header>

      {/* Redacted, not the raw row: a prop handed to a client component is
          serialised into the page and reaches the browser, so the webhook
          signing secret must not travel with it. */}
      <SettingsClient
        provider={redactProviderConfig(provider)}
        identities={identities}
        webhookUrl="/api/portal/email-sender/public/webhook/postmark?secret=…"
      />

      <p className="email-sender-meta">
        {verifiedCount}/{identities.length} confirmed by the provider · default:{" "}
        {defaultIdentity?.email ?? "—"}
      </p>

      <h2>Install</h2>
      <dl className="email-sender-meta-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Scope</dt><dd>agency {props.agencyId}</dd></div>
      </dl>
    </section>
  );
}
