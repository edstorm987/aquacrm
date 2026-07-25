import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, FunnelCapturePort, HttpFetchPort,
} from "./ports";
import type { RmwContainer } from "./index";
import { buildRmwContainer } from "./index";

export interface RmwFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  http: HttpFetchPort;
  funnel?: FunnelCapturePort;
}

let registered: RmwFoundation | null = null;
export function registerRmwFoundation(deps: RmwFoundation): void { registered = deps; }
export function clearRmwFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): RmwFoundation {
  if (!registered) throw new Error("@aqua/plugin-rank-my-website: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): RmwContainer {
  const f = requireFoundation();
  return buildRmwContainer({
    agencyId: args.agencyId,
    activity: f.activity, events: f.events,
    http: f.http,
    ...(f.funnel !== undefined ? { funnel: f.funnel } : {}),
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  activity: ActivityLogPort; events: EventBusPort;
  http: HttpFetchPort; funnel?: FunnelCapturePort;
}): RmwContainer {
  return buildRmwContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId }): RmwContainer | null {
  if (!registered) return null;
  return buildRmwContainer({
    agencyId: args.agencyId,
    activity: registered.activity, events: registered.events,
    http: registered.http,
    ...(registered.funnel !== undefined ? { funnel: registered.funnel } : {}),
  });
}
