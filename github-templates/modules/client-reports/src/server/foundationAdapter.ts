import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { ReportContainer } from "./index";
import { buildReportContainer } from "./index";

export interface ReportsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: ReportsFoundation | null = null;
export function registerReportsFoundation(deps: ReportsFoundation): void { registered = deps; }
export function clearReportsFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): ReportsFoundation {
  if (!registered) throw new Error("@aqua/plugin-client-reports: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): ReportContainer {
  const f = requireFoundation();
  return buildReportContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; clientId: ClientId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): ReportContainer {
  return buildReportContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage }): ReportContainer | null {
  if (!registered) return null;
  if (!args.clientId) return null;
  return buildReportContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
