// Foundation registration adapter — same pattern as memberships +
// agency-hr + ecommerce.
//
// Foundation imports this at boot, calls registerAffiliatesFoundation
// once with concrete port implementations, and from then on every
// page + handler resolves its services via containerFor({...}).
//
// The cross-plugin EcommerceOrdersPort is read by the foundation from
// `@aqua/plugin-ecommerce/server`'s `containerFor(storage).orders`
// — the foundation's adapter projects the ServerOrder shape into our
// EcommerceOrderProjection. Until ecommerce ships a `referralCodeId`
// field on its order shape (foundation pending), the projection
// reads from `metadata.referralCodeId` the storefront stamps.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EcommerceOrdersPort,
  EventBusPort,
  PluginInstallStorePort,
  StripeConnectPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { AffiliatesContainer } from "./index";
import { buildAffiliatesContainer } from "./index";

export interface AffiliatesFoundation {
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  ecommerceOrders: EcommerceOrdersPort;
  // R12 — optional. Foundation registers undefined when ecommerce/Stripe
  // isn't configured for the client; the legacy `markPaid` path keeps
  // working and `processPayout` returns a clean error.
  stripeConnect?: StripeConnectPort;
}

let registered: AffiliatesFoundation | null = null;

export function registerAffiliatesFoundation(deps: AffiliatesFoundation): void {
  registered = deps;
}

export function clearAffiliatesFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): AffiliatesFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-affiliates: foundation not registered. Call registerAffiliatesFoundation({...}) at boot.",
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

export function containerFor(args: ContainerForArgs): AffiliatesContainer {
  const f = requireFoundation();
  return buildAffiliatesContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
    pluginInstalls: f.pluginInstalls,
    ecommerceOrders: f.ecommerceOrders,
    stripeConnect: f.stripeConnect,
  });
}

// Programmatic-test helper — same pattern as memberships's
// containerWithDeps. Lets tests skip the singleton.
export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  ecommerceOrders: EcommerceOrdersPort;
  stripeConnect?: StripeConnectPort;
}): AffiliatesContainer {
  return buildAffiliatesContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    user: args.user,
    pluginInstalls: args.pluginInstalls,
    ecommerceOrders: args.ecommerceOrders,
    stripeConnect: args.stripeConnect,
  });
}

// onInstall + healthcheck hook. Returns null if foundation hasn't been
// registered yet — the manifest's onInstall is best-effort.
export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
}): AffiliatesContainer | null {
  if (!registered) return null;
  return buildAffiliatesContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
    pluginInstalls: registered.pluginInstalls,
    ecommerceOrders: registered.ecommerceOrders,
    stripeConnect: registered.stripeConnect,
  });
}
