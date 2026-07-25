export {
  FunnelService,
  FunnelInputError,
} from "./services";
export {
  LEAD_SOURCES,
  bucketHcSlot,
  canonEmail,
  isPlausibleEmail,
} from "../lib/domain";
export type {
  ActivityLogPort, EventBusPort, FunnelEventName,
  LeadUserPort, SessionPort, LogActivityInput,
  StoragePort, TenantPort, UserPort,
} from "./ports";
export {
  registerFunnelFoundation,
  clearFunnelFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { FunnelFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, LeadUserPort, SessionPort, StoragePort,
} from "./ports";
import { FunnelService } from "./services";

export interface FunnelDepsInput {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  leadUsers: LeadUserPort;
  sessions?: SessionPort;
}

export interface FunnelContainer {
  funnel: FunnelService;
}

export function buildFunnelContainer(deps: FunnelDepsInput): FunnelContainer {
  const storage = deps.storage as StoragePort;
  const funnel = new FunnelService({
    agencyId: deps.agencyId, storage,
    activity: deps.activity, events: deps.events,
    leadUsers: deps.leadUsers,
    ...(deps.sessions !== undefined ? { sessions: deps.sessions } : {}),
  });
  return { funnel };
}
