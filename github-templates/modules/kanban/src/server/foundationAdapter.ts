// Foundation registration adapter — same pattern as the other plugins.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { KanbanContainer } from "./index";
import { buildKanbanContainer } from "./index";

export interface KanbanFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}

let registered: KanbanFoundation | null = null;

export function registerKanbanFoundation(deps: KanbanFoundation): void {
  registered = deps;
}

export function clearKanbanFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): KanbanFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-kanban: foundation not registered. Call registerKanbanFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): KanbanContainer {
  const f = requireFoundation();
  return buildKanbanContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}): KanbanContainer {
  return buildKanbanContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
}): KanbanContainer | null {
  if (!registered) return null;
  return buildKanbanContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
  });
}
