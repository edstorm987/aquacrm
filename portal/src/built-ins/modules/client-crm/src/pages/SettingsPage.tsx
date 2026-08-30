// `/portal/clients/[clientId]/client-crm/settings`
//
// This page used to instruct the operator, in prose, to define the custom
// attribute schema by hand-editing the install config — something no control in
// the product could do. All three declared fields were reachable only by
// editing storage directly.
//
// client-CRM is `scopePolicy: "client"`, so the agency Settings hub
// deliberately does not edit it (see `lib/chrome/settingsModules.ts`): contacts
// and their attribute schema belong to one client. The editor belongs here,
// mounted from the generic `PluginSettingsPanel` — the same component
// ecommerce, affiliates and memberships use.
//
// 2026-08-30 (review): giving the schema field a control does not make anything
// read it, and nothing does — the module's manifest says so itself ("v1
// freeform; structured editor is future"). Until that prose was removed from
// this header, the id appearing in a COMMENT was the only reason the unwired
// sweep counted the field as consulted. It is now in `UNWIRED_SETTINGS`, so the
// operator gets the control AND the "Not connected" label, rather than a
// textarea that quietly swallows JSON.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { PluginSettingsPanel } from "@/components/workspaces/PluginSettingsPanel";
import { canEditPluginSettings } from "@/lib/server/plugins/pluginSettingsAccess";

export default async function SettingsPage(props: PluginPageProps) {
  if (!props.clientId) return <p>client-CRM requires a client scope.</p>;
  const c = containerFor({ agencyId: props.agencyId, clientId: props.clientId, storage: props.storage, install: props.install });
  const [contacts, segments] = await Promise.all([c.contacts.list(), c.segments.list()]);
  // This page is visible to client-owner/client-staff too, but the settings
  // endpoint accepts only agency admins. They get the values read-only rather
  // than a Save button that can only 403.
  const canEdit = await canEditPluginSettings();
  const settings = describePluginSettings(props.install.pluginId, {
    agencyId: props.agencyId,
    clientId: props.clientId,
  });
  return (
    <section className="crm-settings">
      <header><h1>Settings</h1><p>Client-CRM install state.</p></header>
      <dl className="crm-meta-grid">
        <div><dt>Active contacts</dt><dd>{contacts.filter(c => c.status === "active").length}</dd></div>
        <div><dt>Total contacts</dt><dd>{contacts.length}</dd></div>
        <div><dt>Segments</dt><dd>{segments.length}</dd></div>
      </dl>
      <h2>Install</h2>
      <dl className="crm-meta-grid">
        <div><dt>Plugin id</dt><dd>{props.install.pluginId}</dd></div>
        <div><dt>Enabled</dt><dd>{props.install.enabled ? "Yes" : "No"}</dd></div>
      </dl>
      {settings ? (
        <>
          <PluginSettingsPanel initial={settings} clientId={props.clientId} canEdit={canEdit} />
          <p className="crm-meta">
            Custom attributes are stored per-contact under `attributes`, as
            freeform strings. The schema field above accepts a JSON array of{" "}
            {`{ key, label, type }`} and saves it, but nothing validates contacts
            against it yet — which is why it is marked Not connected. A
            structured, per-attribute editor is a future round.
          </p>
        </>
      ) : (
        <p className="crm-meta">
          This client has no client-CRM settings to show — the module is not registered here.
        </p>
      )}
    </section>
  );
}
