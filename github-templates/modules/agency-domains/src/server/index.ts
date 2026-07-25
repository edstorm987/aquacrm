export {
  DomainAttachService,
  DomainAttachConflictError,
  DomainAttachNotFoundError,
  InvalidStatusTransitionError,
} from "./service";
export {
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  defaultNsRecords,
  isValidHostname,
  normaliseHostname,
} from "../lib/domain";
export type {
  ActivityLogPort,
  AgencyDomainsEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerAgencyDomainsFoundation,
  clearAgencyDomainsFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyDomainsFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { DomainAttachService } from "./service";

export interface AgencyDomainsDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface AgencyDomainsContainer {
  domains: DomainAttachService;
}

export function buildAgencyDomainsContainer(deps: AgencyDomainsDeps): AgencyDomainsContainer {
  const storage = deps.storage as StoragePort;
  const domains = new DomainAttachService(deps.agencyId, deps.clientId, storage, deps.activity, deps.events);
  return { domains };
}
