// Foundation registration adapter — same pattern as the other plugins.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { InboxContainer } from "./index";
import { buildInboxContainer } from "./index";

export interface InboxFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}

let registered: InboxFoundation | null = null;

export function registerInboxFoundation(deps: InboxFoundation): void {
  registered = deps;
}

export function clearInboxFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): InboxFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-activity-inbox: foundation not registered. Call registerInboxFoundation({...}) at boot.",
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

export function containerFor(args: ContainerForArgs): InboxContainer {
  const f = requireFoundation();
  return buildInboxContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    tenant: f.tenant,
    user: f.user,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  tenant?: TenantPort;
  user?: UserPort;
}): InboxContainer {
  return buildInboxContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): InboxContainer | null {
  if (!registered) return null;
  return buildInboxContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    tenant: registered.tenant,
    user: registered.user,
  });
}
