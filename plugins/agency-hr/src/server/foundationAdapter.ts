// Foundation registration adapter — same pattern as ecommerce.
//
// The plugin's manifest can't reach into the foundation directly (it
// must tsc-clean standalone). The foundation imports this module
// at boot, calls `registerAgencyHrFoundation({...})` once with its
// real port adapters, and from then on every page + handler resolves
// its services via `containerFor(storage)`.
//
// Re-exports `EventBusPort`, `TenantPort`, etc. so the foundation can
// import the *types* alongside the registration helper without
// reaching deeper than the package's `./server` exports map.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, TenantPort } from "./ports";
import type { AgencyId, UserId } from "../lib/tenancy";
import type { AgencyHrContainer } from "./index";
import { buildAgencyHrContainer } from "./index";

export interface AgencyHrFoundation {
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
}

let registered: AgencyHrFoundation | null = null;

export function registerAgencyHrFoundation(deps: AgencyHrFoundation): void {
  registered = deps;
}

export function clearAgencyHrFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): AgencyHrFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-agency-hr: foundation not registered. Call registerAgencyHrFoundation({...}) at boot.",
    );
  }
  return registered;
}

// Build a per-request container scoped to the agency. The foundation's
// catch-all routes call this with the install's storage + ctx fields;
// pages do the same via `services.tenant`/etc. accessed off
// `PluginPageProps`.
export function containerFor(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): AgencyHrContainer {
  const f = requireFoundation();
  return buildAgencyHrContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    pluginInstalls: f.pluginInstalls,
  });
}

// Convenience helper for tests / programmatic invocation: build a
// container without going through the singleton.
export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  foundation: AgencyHrFoundation;
}): AgencyHrContainer {
  return buildAgencyHrContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: args.foundation.activity,
    events: args.foundation.events,
    tenant: args.foundation.tenant,
    pluginInstalls: args.foundation.pluginInstalls,
  });
}

// Helper used by `onInstall` in the manifest to bind a freshly
// installed agency's container without going through the singleton
// (the install ctx already carries everything we need).
export function _containerFromCtx(args: {
  agencyId: AgencyId;
  actor: UserId;
  storage: PluginStorage;
}): AgencyHrContainer | null {
  if (!registered) return null;
  return buildAgencyHrContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    pluginInstalls: registered.pluginInstalls,
  });
}
