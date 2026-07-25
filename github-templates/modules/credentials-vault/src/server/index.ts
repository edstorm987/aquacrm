// Server-side barrel — service + container + foundation adapter.

export {
  VaultService,
  VaultAccessError,
  VaultRateLimitError,
  RATE_LIMIT_REVEALS,
  RATE_WINDOW_MS,
} from "./vault";
export {
  encrypt,
  decrypt,
  generateKey,
  loadKeyFromEnv,
} from "./crypto";
export type { CryptoKey } from "./crypto";
export {
  CREDENTIAL_TYPES,
  CREDENTIAL_TYPE_LABELS,
  summarise,
} from "../lib/domain";

export type {
  ActivityLogPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
  VaultEventName,
} from "./ports";

export {
  registerVaultFoundation,
  clearVaultFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { VaultFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { CryptoKey } from "./crypto";
import { VaultService } from "./vault";

export interface VaultDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  crypto: CryptoKey;
  isAdmin?: (actor: UserId) => boolean;
}

export interface VaultContainer {
  vault: VaultService;
}

export function buildVaultContainer(deps: VaultDeps): VaultContainer {
  const storage = deps.storage as StoragePort;
  const vault = new VaultService({
    agencyId: deps.agencyId,
    clientId: deps.clientId,
    storage,
    activity: deps.activity,
    events: deps.events,
    crypto: deps.crypto,
    isAdmin: deps.isAdmin,
  });
  return { vault };
}
