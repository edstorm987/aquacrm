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
  // R12 — optional, and resolved PER CLIENT SCOPE. Stripe keys live on the
  // ecommerce install of one (agencyId, clientId), so a single global port
  // could never transfer to the right account or verify the right webhook
  // secret. The factory returns null when that client has no configured
  // Stripe: the legacy manual `markPaid` path keeps working, `processPayout`
  // returns a clean error, and the mounted controls can gate themselves on
  // `isStripeConnectAvailable()` instead of offering a button that 422s.
  //
  // Omitting the factory entirely (the pre-R12 state) means the same thing as
  // a factory that always returns null: Connect is unavailable everywhere.
  stripeConnectFor?(args: { agencyId: AgencyId; clientId: ClientId }): StripeConnectPort | null;
  /**
   * Whether this scope can complete a TRANSFER, not merely onboard.
   *
   * Availability is two-level on purpose. Onboarding and the "refresh my
   * status" poll work with a secret key alone. Moving money does not: the only
   * route from `in_progress` to `completed` is the `transfer.paid` webhook
   * (payouts.ts confirmTransferPaid), and a webhook that cannot be verified is
   * never accepted. Offering "Process via Stripe" on a scope with no verifiable
   * webhook secret creates a REAL transfer that can never be confirmed and has
   * no UI action left — the affiliate's money leaves and the payout is stuck.
   *
   * Absent (or false) means: onboarding may still be offered, automated
   * transfer must not be. Manual mark-paid remains the supported route.
   */
  stripeConnectTransferReady?(args: { agencyId: AgencyId; clientId: ClientId }): boolean;
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

/**
 * The Stripe Connect driver for one client scope, or null when that client has
 * no configured Stripe.
 *
 * Exported so a handler or a page can ask the same question the container asks
 * without building a container first.
 */
export function stripeConnectFor(args: {
  agencyId: AgencyId;
  clientId: ClientId;
}): StripeConnectPort | null {
  if (!registered?.stripeConnectFor) return null;
  return registered.stripeConnectFor({ agencyId: args.agencyId, clientId: args.clientId }) ?? null;
}

/**
 * Whether automated Stripe Connect payouts are actually available in this
 * scope. Mounted surfaces gate on this so the customer is never offered a
 * "Set up payouts via Stripe" button that can only answer 422, and an admin is
 * never offered "Process via Stripe" for an install with no Stripe at all.
 *
 * False is the honest answer for an unconfigured install; manual mark-paid
 * remains the supported route.
 */
export function isStripeConnectAvailable(args: {
  agencyId: AgencyId;
  clientId: ClientId;
}): boolean {
  return stripeConnectFor(args) !== null;
}

/**
 * Whether an AUTOMATED PAYOUT can actually complete in this scope.
 *
 * Stricter than {@link isStripeConnectAvailable} by design — see
 * `stripeConnectTransferReady` on the foundation. Gate money-moving controls
 * on this; gate onboarding on the looser check.
 */
export function isStripeTransferAvailable(args: {
  agencyId: AgencyId;
  clientId: ClientId;
}): boolean {
  if (stripeConnectFor(args) === null) return false;
  if (!registered?.stripeConnectTransferReady) return false;
  return registered.stripeConnectTransferReady({ agencyId: args.agencyId, clientId: args.clientId });
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
    stripeConnect: stripeConnectFor({ agencyId: args.agencyId, clientId: args.clientId }) ?? undefined,
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
    stripeConnect: stripeConnectFor({ agencyId: args.agencyId, clientId: args.clientId }) ?? undefined,
  });
}
