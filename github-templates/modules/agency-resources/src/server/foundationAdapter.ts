import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { AgencyResourcesContainer } from "./index";
import { buildAgencyResourcesContainer } from "./index";

export interface AgencyResourcesFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: AgencyResourcesFoundation | null = null;
export function registerAgencyResourcesFoundation(deps: AgencyResourcesFoundation): void { registered = deps; }
export function clearAgencyResourcesFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): AgencyResourcesFoundation {
  if (!registered) throw new Error("@aqua/plugin-agency-resources: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId?: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AgencyResourcesContainer {
  const f = requireFoundation();
  return buildAgencyResourcesContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): AgencyResourcesContainer {
  return buildAgencyResourcesContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): AgencyResourcesContainer | null {
  if (!registered) return null;
  return buildAgencyResourcesContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
