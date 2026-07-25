// Foundation registration adapter — same pattern as the other plugins.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { SopsContainer } from "./index";
import { buildSopsContainer } from "./index";

export interface SopsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}

let registered: SopsFoundation | null = null;

export function registerSopsFoundation(deps: SopsFoundation): void {
  registered = deps;
}

export function clearSopsFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): SopsFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-sops: foundation not registered. Call registerSopsFoundation({...}) at boot.",
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

export function containerFor(args: ContainerForArgs): SopsContainer {
  const f = requireFoundation();
  return buildSopsContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}): SopsContainer {
  return buildSopsContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): SopsContainer | null {
  if (!registered) return null;
  return buildSopsContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
  });
}
