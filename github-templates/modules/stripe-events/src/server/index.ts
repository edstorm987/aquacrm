export { StripeEventsService } from "./services";
export {
  parseStripeSignature, summarise, isSubscriptionEvent,
  SUBSCRIPTION_EVENT_TYPES,
  DEFAULT_TIMESTAMP_TOLERANCE_S, DEFAULT_MAX_BODY_BYTES,
} from "../lib/domain";
export { verifyStripeSignature, computeStripeHmacHex } from "../lib/signature";
export type {
  ActivityLogPort, EventBusPort, StripeEventName, VaultPort,
  LogActivityInput, StoragePort, TenantPort, UserPort,
} from "./ports";
export {
  registerStripeEventsFoundation,
  clearStripeEventsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { StripeEventsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort, VaultPort } from "./ports";
import { StripeEventsService } from "./services";

export interface StripeEventsDepsInput {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  vault?: VaultPort;
}

export interface StripeEventsContainer {
  stripe: StripeEventsService;
}

export function buildStripeEventsContainer(deps: StripeEventsDepsInput): StripeEventsContainer {
  const storage = deps.storage as StoragePort;
  const stripe = new StripeEventsService({
    agencyId: deps.agencyId, storage,
    activity: deps.activity, events: deps.events,
    ...(deps.vault !== undefined ? { vault: deps.vault } : {}),
  });
  return { stripe };
}
