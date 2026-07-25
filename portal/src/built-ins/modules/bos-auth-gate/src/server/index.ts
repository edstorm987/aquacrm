export { GateService, evaluate } from "./services";
export {
  matchesBosPath,
  isBosAsset,
  buildLoginRedirect,
  BOS_PATH_PREFIXES,
  BOS_SOFT_ALLOW_SUFFIXES,
  DEFAULT_LOGIN_PATH,
  DEV_BYPASS_BANNER,
} from "../lib/domain";
export type {
  ActivityLogPort, EventBusPort, FunnelMePort, GateEventName,
  LogActivityInput, StoragePort, TenantPort, UserPort,
} from "./ports";
export {
  registerGateFoundation,
  clearGateFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { GateFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type {
  ActivityLogPort, EventBusPort, FunnelMePort, UserPort,
} from "./ports";
import { GateService } from "./services";

export interface GateDepsInput {
  agencyId: AgencyId;
  activity: ActivityLogPort;
  events: EventBusPort;
  user: UserPort;
  funnel?: FunnelMePort;
}

export interface GateContainer {
  gate: GateService;
}

export function buildGateContainer(deps: GateDepsInput): GateContainer {
  const gate = new GateService({
    agencyId: deps.agencyId,
    activity: deps.activity, events: deps.events,
    user: deps.user,
    ...(deps.funnel !== undefined ? { funnel: deps.funnel } : {}),
  });
  return { gate };
}
