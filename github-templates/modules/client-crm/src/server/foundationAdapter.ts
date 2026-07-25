// Foundation registration adapter — same pattern as memberships +
// affiliates + agency-finance + agency-marketing.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  MembershipBenefitsPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "./ports";
import type { ClientCrmContainer } from "./index";
import { buildClientCrmContainer } from "./index";

export interface ClientCrmFoundation {
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional cross-plugin reads. Foundation supplies these when the
  // memberships / ecommerce plugin is also installed for the same
  // client. Absent → segments + activity backfill degrade gracefully.
  membershipBenefits?: MembershipBenefitsPort;
  ecommerceOrders?: EcommerceOrdersPort;
}

let registered: ClientCrmFoundation | null = null;

export function registerClientCrmFoundation(deps: ClientCrmFoundation): void {
  registered = deps;
}

export function clearClientCrmFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): ClientCrmFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-client-crm: foundation not registered. Call registerClientCrmFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): ClientCrmContainer {
  const f = requireFoundation();
  return buildClientCrmContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
    pluginInstalls: f.pluginInstalls,
    membershipBenefits: f.membershipBenefits,
    ecommerceOrders: f.ecommerceOrders,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  membershipBenefits?: MembershipBenefitsPort;
  ecommerceOrders?: EcommerceOrdersPort;
}): ClientCrmContainer {
  return buildClientCrmContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    user: args.user,
    pluginInstalls: args.pluginInstalls,
    membershipBenefits: args.membershipBenefits,
    ecommerceOrders: args.ecommerceOrders,
  });
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
}): ClientCrmContainer | null {
  if (!registered) return null;
  return buildClientCrmContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
    pluginInstalls: registered.pluginInstalls,
    membershipBenefits: registered.membershipBenefits,
    ecommerceOrders: registered.ecommerceOrders,
  });
}
