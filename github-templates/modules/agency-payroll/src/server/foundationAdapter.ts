import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { AgencyPayrollContainer } from "./index";
import { buildAgencyPayrollContainer } from "./index";

export interface AgencyPayrollFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: AgencyPayrollFoundation | null = null;
export function registerAgencyPayrollFoundation(deps: AgencyPayrollFoundation): void { registered = deps; }
export function clearAgencyPayrollFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): AgencyPayrollFoundation {
  if (!registered) throw new Error("@aqua/plugin-agency-payroll: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId?: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): AgencyPayrollContainer {
  const f = requireFoundation();
  return buildAgencyPayrollContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): AgencyPayrollContainer {
  return buildAgencyPayrollContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): AgencyPayrollContainer | null {
  if (!registered) return null;
  return buildAgencyPayrollContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
