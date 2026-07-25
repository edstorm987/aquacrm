import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { AgencyOpsContainer } from "./index";
import { buildAgencyOpsContainer } from "./index";

export interface AgencyOpsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: AgencyOpsFoundation | null = null;

export function registerAgencyOpsFoundation(deps: AgencyOpsFoundation): void { registered = deps; }
export function clearAgencyOpsFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): AgencyOpsFoundation {
  if (!registered) throw new Error("@aqua/plugin-agency-ops: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AgencyOpsContainer {
  const f = requireFoundation();
  return buildAgencyOpsContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
}): AgencyOpsContainer {
  return buildAgencyOpsContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): AgencyOpsContainer | null {
  if (!registered) return null;
  return buildAgencyOpsContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
