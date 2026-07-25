import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, VaultPort } from "./ports";
import type { StripeEventsContainer } from "./index";
import { buildStripeEventsContainer } from "./index";

export interface StripeEventsFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  vault?: VaultPort;
}

let registered: StripeEventsFoundation | null = null;
export function registerStripeEventsFoundation(deps: StripeEventsFoundation): void { registered = deps; }
export function clearStripeEventsFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): StripeEventsFoundation {
  if (!registered) throw new Error("@aqua/plugin-stripe-events: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): StripeEventsContainer {
  const f = requireFoundation();
  return buildStripeEventsContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: f.activity, events: f.events,
    ...(f.vault !== undefined ? { vault: f.vault } : {}),
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
  vault?: VaultPort;
}): StripeEventsContainer {
  return buildStripeEventsContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage }): StripeEventsContainer | null {
  if (!registered) return null;
  return buildStripeEventsContainer({
    agencyId: args.agencyId, storage: args.storage,
    activity: registered.activity, events: registered.events,
    ...(registered.vault !== undefined ? { vault: registered.vault } : {}),
  });
}
