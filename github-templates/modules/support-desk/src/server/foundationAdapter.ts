import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { SupportDeskContainer } from "./index";
import { buildSupportDeskContainer } from "./index";
import type { AutoAssignRule } from "../lib/domain";

export interface SupportDeskFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: SupportDeskFoundation | null = null;
export function registerSupportDeskFoundation(deps: SupportDeskFoundation): void { registered = deps; }
export function clearSupportDeskFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): SupportDeskFoundation {
  if (!registered) throw new Error("@aqua/plugin-support-desk: foundation not registered.");
  return registered;
}

function rulesFromInstall(install?: PluginInstall): AutoAssignRule[] {
  const raw = install?.config?.autoAssignRules;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r: unknown): r is AutoAssignRule =>
      !!r && typeof r === "object" && typeof (r as AutoAssignRule).tag === "string"
      && typeof (r as AutoAssignRule).userId === "string")
    .map(r => ({ tag: r.tag, userId: r.userId }));
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): SupportDeskContainer {
  const f = requireFoundation();
  return buildSupportDeskContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: f.activity, events: f.events,
    autoAssignRules: rulesFromInstall(args.install),
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; clientId: ClientId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
  autoAssignRules?: AutoAssignRule[];
}): SupportDeskContainer {
  return buildSupportDeskContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage }): SupportDeskContainer | null {
  if (!registered) return null;
  if (!args.clientId) return null;
  return buildSupportDeskContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
