import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { PreSalesContainer } from "./index";
import { buildPreSalesContainer } from "./index";

export interface PreSalesFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
  cadenceDays?: number;
}

let registered: PreSalesFoundation | null = null;
export function registerPreSalesFoundation(deps: PreSalesFoundation): void { registered = deps; }
export function clearPreSalesFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): PreSalesFoundation {
  if (!registered) throw new Error("@aqua/plugin-pre-sales-hq: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId?: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): PreSalesContainer {
  const f = requireFoundation();
  return buildPreSalesContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: f.activity, events: f.events, cadenceDays: f.cadenceDays,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
  cadenceDays?: number;
}): PreSalesContainer {
  return buildPreSalesContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): PreSalesContainer | null {
  if (!registered) return null;
  return buildPreSalesContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
    cadenceDays: registered.cadenceDays,
  });
}
