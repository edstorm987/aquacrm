// Server-side barrel — services + container builder + foundation adapter.

export { ContactService } from "./contacts";
export { SegmentService, DEFAULT_SEGMENT_SEEDS } from "./segments";
export { ActivityService } from "./activity";

export type {
  ActivityLogPort,
  CrmEventName,
  EcommerceOrderProjection,
  EcommerceOrdersPort,
  EventBusPort,
  ListActivityFilter,
  LogActivityInput,
  MembershipBenefitsPort,
  MembershipSnapshot,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerClientCrmFoundation,
  clearClientCrmFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { ClientCrmFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  MembershipBenefitsPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { ContactService } from "./contacts";
import { SegmentService } from "./segments";
import { ActivityService } from "./activity";

// ─── Container ────────────────────────────────────────────────────────────

export interface ClientCrmDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
  membershipBenefits?: MembershipBenefitsPort;
  ecommerceOrders?: EcommerceOrdersPort;
}

export interface ClientCrmContainer {
  contacts: ContactService;
  segments: SegmentService;
  activity: ActivityService;
}

export function buildClientCrmContainer(deps: ClientCrmDeps): ClientCrmContainer {
  const storage = deps.storage as StoragePort;
  const contacts = new ContactService(
    deps.agencyId, deps.clientId, storage, deps.user, deps.activity, deps.events,
  );
  const segments = new SegmentService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
    contacts, deps.membershipBenefits,
  );
  const activity = new ActivityService(
    deps.agencyId, deps.clientId, storage, deps.activity, deps.events,
    contacts, deps.ecommerceOrders,
  );
  return { contacts, segments, activity };
}
