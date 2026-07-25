// Foundation registration adapter — same pattern as agency-HR +
// memberships + affiliates.

import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "./ports";
import type { AgencyFinanceContainer } from "./index";
import { buildAgencyFinanceContainer } from "./index";

export interface AgencyFinanceFoundation {
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
}

let registered: AgencyFinanceFoundation | null = null;

export function registerAgencyFinanceFoundation(deps: AgencyFinanceFoundation): void {
  registered = deps;
}

export function clearAgencyFinanceFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): AgencyFinanceFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-agency-finance: foundation not registered. Call registerAgencyFinanceFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AgencyFinanceContainer {
  const f = requireFoundation();
  return buildAgencyFinanceContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
    pluginInstalls: f.pluginInstalls,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
}): AgencyFinanceContainer {
  return buildAgencyFinanceContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    user: args.user,
    pluginInstalls: args.pluginInstalls,
  });
}

// onInstall + healthcheck hook. Returns null if foundation isn't yet
// registered (manifest's onInstall is best-effort).
export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): AgencyFinanceContainer | null {
  if (!registered) return null;
  return buildAgencyFinanceContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
    pluginInstalls: registered.pluginInstalls,
  });
}
