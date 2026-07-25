export {
  AquaResourcesService,
  CollectionNotFoundError,
  ItemNotFoundError,
  BuiltInDeleteError,
} from "./service";
export {
  ALL_PHASES,
  PHASE_LABELS,
  RESOURCE_KINDS,
  DEFAULT_COLLECTIONS,
} from "../lib/domain";
export type {
  ActivityLogPort,
  AquaResourcesEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerAquaResourcesFoundation,
  clearAquaResourcesFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AquaResourcesFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { AquaResourcesService } from "./service";

export interface AquaResourcesDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface AquaResourcesContainer {
  resources: AquaResourcesService;
}

export function buildAquaResourcesContainer(deps: AquaResourcesDeps): AquaResourcesContainer {
  const storage = deps.storage as StoragePort;
  const resources = new AquaResourcesService(deps.agencyId, storage, deps.activity, deps.events);
  return { resources };
}
