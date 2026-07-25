// Server-side barrel — service + container + foundation adapter.

export { InboxService } from "./inbox";
export {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  dayKey,
  resolveRange,
} from "../lib/domain";

export type {
  ActivityLogPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerInboxFoundation,
  clearInboxFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { InboxFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { InboxService } from "./inbox";

export interface InboxDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  tenant?: TenantPort;
  user?: UserPort;
}

export interface InboxContainer {
  inbox: InboxService;
}

export function buildInboxContainer(deps: InboxDeps): InboxContainer {
  const storage = deps.storage as StoragePort;
  const inbox = new InboxService(deps.agencyId, storage, deps.activity);
  return { inbox };
}
