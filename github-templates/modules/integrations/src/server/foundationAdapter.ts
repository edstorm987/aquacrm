import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { IntegrationsContainer } from "./index";
import { buildIntegrationsContainer } from "./index";

export interface IntegrationsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: IntegrationsFoundation | null = null;
export function registerIntegrationsFoundation(deps: IntegrationsFoundation): void { registered = deps; }
export function clearIntegrationsFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): IntegrationsFoundation {
  if (!registered) throw new Error("@aqua/plugin-integrations: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId?: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): IntegrationsContainer {
  const f = requireFoundation();
  return buildIntegrationsContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): IntegrationsContainer {
  return buildIntegrationsContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage }): IntegrationsContainer | null {
  if (!registered) return null;
  return buildIntegrationsContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
