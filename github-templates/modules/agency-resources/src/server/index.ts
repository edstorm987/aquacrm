export {
  AgencyResourcesService,
  ResourceNotFoundError,
  ResourceForbiddenError,
  canSee,
} from "./service";
export {
  ALL_VISIBLE_ROLES,
  KIND_LABELS,
  RESOURCE_KINDS,
  slugify,
  summarise,
} from "../lib/domain";
export type {
  ActivityLogPort,
  AgencyResourcesEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerAgencyResourcesFoundation,
  clearAgencyResourcesFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyResourcesFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { AgencyResourcesService } from "./service";

export interface AgencyResourcesDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface AgencyResourcesContainer {
  resources: AgencyResourcesService;
}

export function buildAgencyResourcesContainer(deps: AgencyResourcesDeps): AgencyResourcesContainer {
  const storage = deps.storage as StoragePort;
  const resources = new AgencyResourcesService(deps.agencyId, storage, deps.activity, deps.events);
  return { resources };
}
