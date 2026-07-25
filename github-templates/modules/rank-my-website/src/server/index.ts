export { RmwService, RmwInputError, isHandoff, TOOL_ID } from "./services";
export {
  BANDS, CHECK_IDS,
  bandToOrdinal, ordinalToBand,
  checkUrlSafety,
} from "../lib/domain";
export {
  runAllChecks, worstBand,
  checkTitle, checkMetaDescription, checkH1, checkImageAlts,
  checkOgTags, checkCanonical, checkHttps, checkHsts,
  checkRobotsTxt, checkSitemapXml,
} from "../lib/analyzer";
export type {
  ActivityLogPort, EventBusPort, FunnelCapturePort, HttpFetchPort,
  FetchPageResult, RmwEventName, LogActivityInput,
  StoragePort, TenantPort, UserPort,
} from "./ports";
export { HttpFetchError } from "./ports";
export {
  registerRmwFoundation,
  clearRmwFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { RmwFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type {
  ActivityLogPort, EventBusPort, FunnelCapturePort, HttpFetchPort,
} from "./ports";
import { RmwService } from "./services";

export interface RmwDepsInput {
  agencyId: AgencyId;
  activity: ActivityLogPort;
  events: EventBusPort;
  http: HttpFetchPort;
  funnel?: FunnelCapturePort;
}

export interface RmwContainer {
  rmw: RmwService;
}

export function buildRmwContainer(deps: RmwDepsInput): RmwContainer {
  const rmw = new RmwService({
    agencyId: deps.agencyId,
    activity: deps.activity, events: deps.events,
    http: deps.http,
    ...(deps.funnel !== undefined ? { funnel: deps.funnel } : {}),
  });
  return { rmw };
}
