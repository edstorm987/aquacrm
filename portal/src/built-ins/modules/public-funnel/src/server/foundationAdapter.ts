import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, LeadUserPort, PendingCapturePromotionAuthorityPort, PendingCapturePromotionPort,
  TenantPort, UserPort,
} from "./ports";
import type { FunnelContainer } from "./index";
import { buildFunnelContainer } from "./index";

export interface FunnelFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  leadUsers: LeadUserPort;
  promotionAuthority: PendingCapturePromotionAuthorityPort;
  promotions: PendingCapturePromotionPort;
  user?: UserPort;
  tenant?: TenantPort;
}

let registered: FunnelFoundation | null = null;
export function registerFunnelFoundation(deps: FunnelFoundation): void { registered = deps; }
export function clearFunnelFoundation(): void { registered = null; }
export function isFoundationRegistered(): boolean { return registered !== null; }
export function requireFoundation(): FunnelFoundation {
  if (!registered) throw new Error("@aqua/plugin-public-funnel: foundation not registered.");
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install: PluginInstall;
}

export function containerFor(args: ContainerForArgs): FunnelContainer {
  const f = requireFoundation();
  return buildFunnelContainer({
    agencyId: args.agencyId, installId: args.install.id, storage: args.storage,
    activity: f.activity, events: f.events,
    leadUsers: f.leadUsers,
    promotionAuthority: f.promotionAuthority,
    promotions: f.promotions,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId; installId: string; storage: PluginStorage;
  activity: ActivityLogPort; events: EventBusPort;
  leadUsers: LeadUserPort;
  promotionAuthority: PendingCapturePromotionAuthorityPort;
  promotions: PendingCapturePromotionPort;
}): FunnelContainer {
  return buildFunnelContainer(args);
}

export function _containerFromCtx(args: { agencyId: AgencyId; installId: string; storage: PluginStorage }): FunnelContainer | null {
  if (!registered) return null;
  return buildFunnelContainer({
    agencyId: args.agencyId, installId: args.installId, storage: args.storage,
    activity: registered.activity, events: registered.events,
    leadUsers: registered.leadUsers,
    promotionAuthority: registered.promotionAuthority,
    promotions: registered.promotions,
  });
}
