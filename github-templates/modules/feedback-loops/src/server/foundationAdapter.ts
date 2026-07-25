import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, TenantPort, UserPort } from "./ports";
import type { FeedbackContainer } from "./index";
import { buildFeedbackContainer } from "./index";

export interface FeedbackFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: FeedbackFoundation | null = null;
export function registerFeedbackFoundation(deps: FeedbackFoundation): void { registered = deps; }
export function clearFeedbackFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): FeedbackFoundation {
  if (!registered) throw new Error("@aqua/plugin-feedback-loops: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId; clientId: ClientId;
  storage: PluginStorage; install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): FeedbackContainer {
  const f = requireFoundation();
  return buildFeedbackContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: f.activity, events: f.events,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; clientId: ClientId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
}): FeedbackContainer {
  return buildFeedbackContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; clientId?: ClientId; storage: PluginStorage }): FeedbackContainer | null {
  if (!registered) return null;
  if (!args.clientId) return null;
  return buildFeedbackContainer({
    agencyId: args.agencyId, clientId: args.clientId, storage: args.storage,
    activity: registered.activity, events: registered.events,
  });
}
