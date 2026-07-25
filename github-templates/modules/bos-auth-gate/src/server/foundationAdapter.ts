import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, FunnelMePort, UserPort,
} from "./ports";
import type { GateContainer } from "./index";
import { buildGateContainer } from "./index";

export interface GateFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user: UserPort;
  funnel?: FunnelMePort;
}

let registered: GateFoundation | null = null;
export function registerGateFoundation(deps: GateFoundation): void { registered = deps; }
export function clearGateFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): GateFoundation {
  if (!registered) throw new Error("@aqua/plugin-bos-auth-gate: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): GateContainer {
  const f = requireFoundation();
  return buildGateContainer({
    agencyId: args.agencyId,
    activity: f.activity, events: f.events,
    user: f.user,
    ...(f.funnel !== undefined ? { funnel: f.funnel } : {}),
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  activity: ActivityLogPort; events: EventBusPort;
  user: UserPort; funnel?: FunnelMePort;
}): GateContainer {
  return buildGateContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId }): GateContainer | null {
  if (!registered) return null;
  return buildGateContainer({
    agencyId: args.agencyId,
    activity: registered.activity, events: registered.events,
    user: registered.user,
    ...(registered.funnel !== undefined ? { funnel: registered.funnel } : {}),
  });
}
