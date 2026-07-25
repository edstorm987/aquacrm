import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { AgencyDomainsContainer } from "./index";
import { buildAgencyDomainsContainer } from "./index";

export interface AgencyDomainsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: AgencyDomainsFoundation | null = null;
export function registerAgencyDomainsFoundation(deps: AgencyDomainsFoundation): void { registered = deps; }
export function clearAgencyDomainsFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): AgencyDomainsFoundation {
  if (!registered) throw new Error("@aqua/plugin-agency-domains: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AgencyDomainsContainer {
  const f = requireFoundation();
  return buildAgencyDomainsContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; clientId: ClientId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): AgencyDomainsContainer {
  return buildAgencyDomainsContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage }): AgencyDomainsContainer | null {
  if (!registered || !args.clientId) return null;
  return buildAgencyDomainsContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
