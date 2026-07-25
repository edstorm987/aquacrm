export {
  RecurringTaskService,
  StatusService,
  IncidentService,
  HealthService,
} from "./services";
export {
  CADENCE_LABELS,
  CADENCE_MS,
  STATUS_LABELS,
  SEVERITY_LABELS,
  DEFAULT_RECURRING_TASKS,
} from "../lib/domain";
export type {
  ActivityLogPort,
  AgencyOpsEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerAgencyOpsFoundation,
  clearAgencyOpsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyOpsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import {
  HealthService,
  IncidentService,
  RecurringTaskService,
  StatusService,
} from "./services";

export interface AgencyOpsDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface AgencyOpsContainer {
  tasks: RecurringTaskService;
  status: StatusService;
  incidents: IncidentService;
  health: HealthService;
}

export function buildAgencyOpsContainer(deps: AgencyOpsDeps): AgencyOpsContainer {
  const storage = deps.storage as StoragePort;
  const tasks = new RecurringTaskService(deps.agencyId, storage, deps.activity, deps.events);
  const status = new StatusService(deps.agencyId, storage, deps.activity, deps.events);
  const incidents = new IncidentService(deps.agencyId, storage, deps.activity, deps.events);
  const health = new HealthService(tasks, status, incidents);
  return { tasks, status, incidents, health };
}
