export { ChecklistService, ChecklistNotFoundError } from "./services";
export {
  DEFAULT_SEED_ITEMS,
  OWNER_KINDS,
  CHECKLIST_STATUSES,
} from "../lib/domain";
export type {
  ActivityLogPort, EventBusPort, KanbanPort,
  LogActivityInput, OnboardingEventName, StoragePort, TenantPort, UserPort,
} from "./ports";
export {
  registerOnboardingFoundation,
  clearOnboardingFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { OnboardingFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, KanbanPort, StoragePort } from "./ports";
import { ChecklistService } from "./services";

export interface ChecklistDepsInput {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  kanban?: KanbanPort;
}

export interface ChecklistContainer {
  checklist: ChecklistService;
}

export function buildChecklistContainer(deps: ChecklistDepsInput): ChecklistContainer {
  const storage = deps.storage as StoragePort;
  const checklist = new ChecklistService({
    agencyId: deps.agencyId,
    clientId: deps.clientId,
    storage,
    activity: deps.activity,
    events: deps.events,
    ...(deps.kanban ? { kanban: deps.kanban } : {}),
  });
  return { checklist };
}
