export {
  ReportService,
  ReportNotFoundError,
  InvalidReportTransitionError,
} from "./services";
export {
  REPORT_STATUSES,
  REPORT_TRANSITIONS,
  SECTION_KINDS,
  METRICS_PLACEHOLDER_BODY,
} from "../lib/domain";
export type {
  ActivityLogPort, EventBusPort,
  LogActivityInput, ReportEventName, StoragePort, TenantPort, UserPort,
} from "./ports";
export {
  registerReportsFoundation,
  clearReportsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { ReportsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { ReportService } from "./services";

export interface ReportDepsInput {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface ReportContainer {
  reports: ReportService;
}

export function buildReportContainer(deps: ReportDepsInput): ReportContainer {
  const storage = deps.storage as StoragePort;
  const reports = new ReportService({
    agencyId: deps.agencyId,
    clientId: deps.clientId,
    storage,
    activity: deps.activity,
    events: deps.events,
  });
  return { reports };
}
