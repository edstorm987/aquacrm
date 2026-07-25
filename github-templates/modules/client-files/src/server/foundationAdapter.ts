import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { ClientFilesContainer } from "./index";
import { buildClientFilesContainer } from "./index";

export interface ClientFilesFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: ClientFilesFoundation | null = null;

export function registerClientFilesFoundation(deps: ClientFilesFoundation): void { registered = deps; }
export function clearClientFilesFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): ClientFilesFoundation {
  if (!registered) throw new Error("@aqua/plugin-client-files: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): ClientFilesContainer {
  const f = requireFoundation();
  return buildClientFilesContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
}): ClientFilesContainer {
  return buildClientFilesContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage;
}): ClientFilesContainer | null {
  if (!registered || !args.clientId) return null;
  return buildClientFilesContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
