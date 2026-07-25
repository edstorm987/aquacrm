export {
  IntegrationService,
  WebhookLogService,
  IntegrationNotFoundError,
} from "./service";
export {
  INTEGRATION_KINDS,
  INTEGRATION_STATUSES,
  KIND_CONFIG_SHAPES,
  KIND_LABELS,
  MAX_LOG_ENTRIES,
} from "../lib/domain";
export type {
  ActivityLogPort,
  IntegrationsEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerIntegrationsFoundation,
  clearIntegrationsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { IntegrationsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { IntegrationService, WebhookLogService } from "./service";

export interface IntegrationsDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface IntegrationsContainer {
  integrations: IntegrationService;
  webhooks: WebhookLogService;
}

export function buildIntegrationsContainer(deps: IntegrationsDeps): IntegrationsContainer {
  const storage = deps.storage as StoragePort;
  const shared = {
    agencyId: deps.agencyId, clientId: deps.clientId, storage,
    activity: deps.activity, events: deps.events,
  };
  return {
    integrations: new IntegrationService(shared),
    webhooks: new WebhookLogService(shared),
  };
}
