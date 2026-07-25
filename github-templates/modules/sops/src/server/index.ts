// Server-side barrel — service + container + foundation adapter.

export { SopService } from "./sops";
export { renderMarkdown } from "./markdown";
export {
  TAG_FAMILIES,
  TAG_FAMILY_LABELS,
  slugify,
} from "../lib/domain";

export type {
  ActivityLogPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  SopEventName,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerSopsFoundation,
  clearSopsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { SopsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { SopService } from "./sops";

export interface SopsDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
}

export interface SopsContainer {
  sops: SopService;
}

export function buildSopsContainer(deps: SopsDeps): SopsContainer {
  const storage = deps.storage as StoragePort;
  const sops = new SopService(deps.agencyId, storage, deps.activity, deps.events);
  return { sops };
}
