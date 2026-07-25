export {
  FileService,
  FilePayloadTooLargeError,
  FileNotFoundError,
  canSee,
} from "./files";
export {
  FILE_CATEGORIES,
  CATEGORY_LABELS,
  INLINE_MAX_BYTES,
} from "../lib/domain";
export type {
  ActivityLogPort,
  ClientFilesEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerClientFilesFoundation,
  clearClientFilesFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { ClientFilesFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { FileService } from "./files";

export interface ClientFilesDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface ClientFilesContainer {
  files: FileService;
}

export function buildClientFilesContainer(deps: ClientFilesDeps): ClientFilesContainer {
  const storage = deps.storage as StoragePort;
  const files = new FileService(deps.agencyId, deps.clientId, storage, deps.activity, deps.events);
  return { files };
}
