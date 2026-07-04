// Foundation registration adapter — same pattern as agency-finance.

import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "./ports";
import type { AgencyMarketingContainer } from "./index";
import { buildAgencyMarketingContainer } from "./index";

export interface AgencyMarketingFoundation {
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
}

let registered: AgencyMarketingFoundation | null = null;

export function registerAgencyMarketingFoundation(deps: AgencyMarketingFoundation): void {
  registered = deps;
}

export function clearAgencyMarketingFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): AgencyMarketingFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-agency-marketing: foundation not registered. Call registerAgencyMarketingFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AgencyMarketingContainer {
  const f = requireFoundation();
  return buildAgencyMarketingContainer({
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
}): AgencyMarketingContainer {
  return buildAgencyMarketingContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    user: args.user,
    pluginInstalls: args.pluginInstalls,
  });
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): AgencyMarketingContainer | null {
  if (!registered) return null;
  return buildAgencyMarketingContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
    pluginInstalls: registered.pluginInstalls,
  });
}
