import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { AquaResourcesContainer } from "./index";
import { buildAquaResourcesContainer } from "./index";

export interface AquaResourcesFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: AquaResourcesFoundation | null = null;
export function registerAquaResourcesFoundation(deps: AquaResourcesFoundation): void { registered = deps; }
export function clearAquaResourcesFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): AquaResourcesFoundation {
  if (!registered) throw new Error("@aqua/plugin-aqua-resources: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId?: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AquaResourcesContainer {
  const f = requireFoundation();
  return buildAquaResourcesContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): AquaResourcesContainer {
  return buildAquaResourcesContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): AquaResourcesContainer | null {
  if (!registered) return null;
  return buildAquaResourcesContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
