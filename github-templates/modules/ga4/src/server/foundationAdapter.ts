import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, Ga4Port, VaultPort,
} from "./ports";
import type { Ga4Container } from "./index";
import { buildGa4Container } from "./index";

export interface Ga4Foundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  ga4: Ga4Port;
  vault?: VaultPort;
}

let registered: Ga4Foundation | null = null;
export function registerGa4Foundation(deps: Ga4Foundation): void { registered = deps; }
export function clearGa4Foundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): Ga4Foundation {
  if (!registered) throw new Error("@aqua/plugin-ga4: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): Ga4Container {
  const f = requireFoundation();
  return buildGa4Container({
    agencyId: args.agencyId, storage: args.storage,
    activity: f.activity, events: f.events,
    ga4: f.ga4,
    ...(f.vault !== undefined ? { vault: f.vault } : {}),
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
  ga4: Ga4Port; vault?: VaultPort;
}): Ga4Container {
  return buildGa4Container(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): Ga4Container | null {
  if (!registered) return null;
  return buildGa4Container({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
    ga4: registered.ga4,
    ...(registered.vault !== undefined ? { vault: registered.vault } : {}),
  });
}
