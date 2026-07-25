export {
  DiscoveryCallService,
  ProposalService,
  NurtureService,
  PreSalesNotFoundError,
  InvalidProposalTransitionError,
} from "./services";
export {
  DEFAULT_NURTURE_CADENCE_DAYS,
  DISCOVERY_OUTCOMES,
  PROPOSAL_STATUSES,
  PROPOSAL_TRANSITIONS,
} from "../lib/domain";
export type {
  ActivityLogPort,
  EventBusPort,
  LogActivityInput,
  PreSalesEventName,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerPreSalesFoundation,
  clearPreSalesFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { PreSalesFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import {
  DiscoveryCallService,
  NurtureService,
  ProposalService,
} from "./services";

export interface PreSalesDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  cadenceDays?: number;
}

export interface PreSalesContainer {
  calls: DiscoveryCallService;
  proposals: ProposalService;
  nurture: NurtureService;
}

export function buildPreSalesContainer(deps: PreSalesDeps): PreSalesContainer {
  const storage = deps.storage as StoragePort;
  const calls = new DiscoveryCallService(deps.agencyId, storage, deps.activity, deps.events);
  const proposals = new ProposalService(deps.agencyId, storage, deps.activity, deps.events);
  const nurture = new NurtureService(deps.agencyId, storage, deps.activity, deps.events,
    deps.cadenceDays !== undefined ? { cadenceDays: deps.cadenceDays } : {});
  return { calls, proposals, nurture };
}
