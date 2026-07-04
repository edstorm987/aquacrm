// Plugin registry — single source of truth for what plugins ship.
//
// Plugins are registered explicitly (not auto-discovered) so:
//   1. The bundler can tree-shake unused plugins out of production
//      builds for tenants that don't have them installed (each plugin's
//      heavy code lives behind dynamic imports inside its manifest).
//   2. There's a single file to grep when answering "what plugins do
//      we ship?".
//
// Adding a new plugin: import its manifest below and append to PLUGINS.
//
// Foundation lands with the registry empty. T2 will add the fulfillment
// plugin; T3 will add website-editor. Round 2 ports e-commerce.

import type { AquaPlugin } from "./_types";
import { validatePlugin, validateRegistry } from "./_validate";

import fulfillmentManifest from "@aqua/plugin-fulfillment";
import websiteEditorManifest from "@aqua/plugin-website-editor";
import ecommerceManifest from "@aqua/plugin-ecommerce";
import emailSenderManifest from "@aqua/plugin-email-sender";
import agencyHrManifest from "@aqua/plugin-agency-hr";
import membershipsManifest from "@aqua/plugin-memberships";
import affiliatesManifest from "@aqua/plugin-affiliates";
import agencyFinanceManifest from "@aqua/plugin-agency-finance";
import agencyMarketingManifest from "@aqua/plugin-agency-marketing";
import clientCrmManifest from "@aqua/plugin-client-crm";
import leadsPipelineManifest from "@aqua/plugin-leads-pipeline";
import publicFunnelManifest from "@aqua/plugin-public-funnel";

// Side-effect imports — each side-effect file binds the plugin's
// register-once foundation adapter to T1's modules at boot. Order is
// significant: `clientCrmFoundation` reads cross-plugin ports from
// memberships + ecommerce, so those two register first.
import "./foundation-adapters/ecommerceFoundation";
import "./foundation-adapters/membershipsFoundation";
import "./foundation-adapters/agencyHrFoundation";
import "./foundation-adapters/affiliatesFoundation";
import "./foundation-adapters/agencyFinanceFoundation";
import "./foundation-adapters/agencyMarketingFoundation";
import "./foundation-adapters/clientCrmFoundation";
import "./foundation-adapters/publicFunnelFoundation";
// email-sender registers BEFORE leads-pipeline so leads-pipeline's
// `emailEnqueuePort` lookup of `isFoundationRegistered()` returns true
// when its own adapter binds.
import "./foundation-adapters/emailSenderFoundation";
import "./foundation-adapters/leadsPipelineFoundation";

// R6 cross-plugin event-bus subscriber registrations. Each plugin's
// adapter file declared what it cares about; the side-effect import
// below binds concrete subscribers via `subscribeForPlugin`.
import "./foundation-adapters/_eventSubscribers";

export { validatePlugin, validateRegistry } from "./_validate";
export type { PluginValidationResult } from "./_validate";

// ─── First-party plugins ──────────────────────────────────────────────────
//
// Each entry is a manifest imported from its plugin folder under
// `04-the-final-portal/plugins/<id>/`. Each plugin types its manifest
// against its own vendored `aquaPluginTypes.ts` (kept tsc-clean
// standalone) — structurally aligned with foundation's `_types.ts` after
// the Round-2 alignment, but TypeScript sees them as nominally distinct
// because they live in different files. The `unknown` cast satisfies
// TypeScript; the validator runs the real shape check at module load.
const PLUGINS: AquaPlugin[] = [
  fulfillmentManifest as unknown as AquaPlugin,
  websiteEditorManifest as unknown as AquaPlugin,
  ecommerceManifest as unknown as AquaPlugin,
  emailSenderManifest as unknown as AquaPlugin,
  agencyHrManifest as unknown as AquaPlugin,
  membershipsManifest as unknown as AquaPlugin,
  affiliatesManifest as unknown as AquaPlugin,
  agencyFinanceManifest as unknown as AquaPlugin,
  agencyMarketingManifest as unknown as AquaPlugin,
  clientCrmManifest as unknown as AquaPlugin,
  leadsPipelineManifest as unknown as AquaPlugin,
  publicFunnelManifest as unknown as AquaPlugin,
];

// Validate every shipped plugin once on module load. Authoring mistakes
// (missing id, duplicate nav items, bad hrefs) surface as console
// errors at boot rather than obscure runtime crashes when the layout
// or marketplace tries to render. We don't throw — that would take the
// whole app down on a single malformed manifest. Instead, malformed
// plugins are filtered out so the rest of the app keeps running.
const PLUGIN_REGISTRY: AquaPlugin[] = (() => {
  const accepted: AquaPlugin[] = [];
  for (const p of PLUGINS) {
    const result = validatePlugin(p);
    if (result.warnings.length > 0) {
      console.warn(`[plugins] "${p?.id ?? "?"}" warnings:\n  - ${result.warnings.join("\n  - ")}`);
    }
    if (!result.ok) {
      console.error(`[plugins] "${p?.id ?? "?"}" REJECTED:\n  - ${result.errors.join("\n  - ")}`);
      continue;
    }
    accepted.push(p);
  }
  const cross = validateRegistry(accepted);
  if (cross.warnings.length > 0) {
    console.warn(`[plugins] registry warnings:\n  - ${cross.warnings.join("\n  - ")}`);
  }
  if (!cross.ok) {
    console.error(`[plugins] registry errors:\n  - ${cross.errors.join("\n  - ")}`);
  }
  return accepted;
})();

export function registerPlugin(plugin: AquaPlugin): void {
  const result = validatePlugin(plugin);
  if (!result.ok) {
    throw new Error(`Plugin "${plugin?.id ?? "?"}" is invalid:\n  - ${result.errors.join("\n  - ")}`);
  }
  if (PLUGIN_REGISTRY.some(p => p.id === plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered.`);
  }
  PLUGIN_REGISTRY.push(plugin);
}

export function listPlugins(): AquaPlugin[] {
  return [...PLUGIN_REGISTRY];
}

export function getPlugin(id: string): AquaPlugin | undefined {
  return PLUGIN_REGISTRY.find(p => p.id === id);
}

export function listCorePlugins(): AquaPlugin[] {
  return PLUGIN_REGISTRY.filter(p => p.core === true);
}

export function listInstallablePlugins(): AquaPlugin[] {
  return PLUGIN_REGISTRY.filter(p => p.core !== true);
}

export function requirePlugin(id: string): AquaPlugin {
  const plugin = getPlugin(id);
  if (!plugin) throw new Error(`Plugin "${id}" not found in registry.`);
  return plugin;
}
