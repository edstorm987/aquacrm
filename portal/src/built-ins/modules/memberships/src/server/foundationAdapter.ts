// Foundation registration adapter — same pattern as ecommerce + agency-hr.
//
// The foundation imports this module at boot, calls
// `registerMembershipsFoundation({...})` once with concrete port
// implementations + a per-request Stripe-client factory, and from
// then on every page + handler resolves its services via
// `containerFor({ agencyId, clientId, storage, install })`.
//
// Why a factory instead of a singleton StripePort: per-install Stripe
// keys live on the **ecommerce** install (memberships requires
// ecommerce). Building a Stripe client without knowing which
// (agencyId, clientId) install we're operating against is impossible.
// The foundation wires this up by reading the ecommerce install's
// config inside the factory closure.

import type { AgencyId, ClientId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  StripePort,
  TenantPort,
  UserPort,
} from "./ports";
import type { MembershipsContainer } from "./index";
import { buildMembershipsContainer } from "./index";

export interface MembershipsFoundation {
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  // Per-(agencyId, clientId) Stripe client. The foundation reads the
  // ecommerce install's config in this closure and constructs a real
  // Stripe SDK wrapper. Returning null means "no Stripe configured for
  // this install" — handlers degrade gracefully (free-tier subscribes
  // still work, paid-tier subscribes return 422 with a clear message).
  stripeFor(args: { agencyId: AgencyId; clientId: ClientId }): StripePort | null;
}

let registered: MembershipsFoundation | null = null;

export function registerMembershipsFoundation(deps: MembershipsFoundation): void {
  registered = deps;
}

export function clearMembershipsFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): MembershipsFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-memberships: foundation not registered. Call registerMembershipsFoundation({...}) at boot.",
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

export function containerFor(args: ContainerForArgs): MembershipsContainer {
  const f = requireFoundation();
  // No Stripe for this install → build anyway with the NOOP port. Everything
  // that does not need Stripe (admin reads, benefits, free-tier subscribes)
  // must keep working; the paid paths hit the NOOP's throw and surface a named
  // "Stripe not configured" message. Callers that would rather answer 422 than
  // let a paid operation fail mid-flight should check `isStripeAvailable()`
  // first — which is honest precisely because `stripeFor` returns null here.
  const stripe = f.stripeFor({ agencyId: args.agencyId, clientId: args.clientId }) ?? NOOP_STRIPE;
  return buildMembershipsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    tenant: f.tenant,
    user: f.user,
    pluginInstalls: f.pluginInstalls,
    stripe,
  });
}

// Handlers can call this to short-circuit before requesting a
// container — useful when you'd rather return 422 with a clear
// "Stripe not configured" message than throw 500.
export function isStripeAvailable(args: { agencyId: AgencyId; clientId: ClientId }): boolean {
  if (!registered) return false;
  return registered.stripeFor(args) !== null;
}

// Programmatic-test helper: build a container without going through
// the registered singleton. Mirrors agency-hr's `containerWithDeps`.
export interface ContainerWithDepsArgs extends ContainerForArgs {
  foundation: MembershipsFoundation & { stripe: StripePort };
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
  stripe: StripePort;
}): MembershipsContainer {
  return buildMembershipsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: args.activity,
    events: args.events,
    tenant: args.tenant,
    user: args.user,
    pluginInstalls: args.pluginInstalls,
    stripe: args.stripe,
  });
}

// `_containerFromCtx` mirrors agency-hr — used by the manifest's
// `onInstall` to build a container without hitting the singleton's
// Stripe-required path (free-tier seeding is allowed even when
// Stripe isn't configured). Returns null if foundation not yet
// registered.
export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage;
}): MembershipsContainer | null {
  if (!registered) return null;
  // For onInstall we expect the agency-side caller to have at least a
  // stub StripePort wired so that $0 plans seed without a paid Stripe
  // round-trip. If stripeFor returns null, fall back to a NOOP_STRIPE
  // — seeding only creates Prices for plans with priceMonthly > 0
  // anyway, but Bronze ($0) doesn't need any Stripe call.
  const stripe = registered.stripeFor(args) ?? NOOP_STRIPE;
  return buildMembershipsContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    tenant: registered.tenant,
    user: registered.user,
    pluginInstalls: registered.pluginInstalls,
    stripe,
  });
}

// No-op Stripe used when this install has no Stripe configured — either the
// manifest's onInstall fired before the agency owner wired keys, or nobody ever
// did. Throws on every paid method so `seedDefaults` falls through cleanly for
// the $0 Bronze plan and only the paid Silver/Gold plans require keys later.
// PlanService.create checks `priceMonthly > 0` before calling createPrice so
// Bronze proceeds without touching Stripe.
//
// The message names the remedy — an operator reading it in an activity log or a
// 422 body must know where to go.
export const STRIPE_NOT_CONFIGURED_MESSAGE =
  "Stripe not configured for this client. Add the Stripe secret key in the ecommerce plugin's settings.";

function stripeUnavailable(): never {
  throw new Error(STRIPE_NOT_CONFIGURED_MESSAGE);
}

const NOOP_STRIPE: StripePort = {
  async createCustomer() { return stripeUnavailable(); },
  async retrieveCustomer() { return null; },
  async createSubscription() { return stripeUnavailable(); },
  async cancelSubscription() { return stripeUnavailable(); },
  async retrieveSubscription() { return null; },
  async pauseSubscription() { return stripeUnavailable(); },
  async resumeSubscription() { return stripeUnavailable(); },
  async changeSubscriptionPlan() { return stripeUnavailable(); },
  async createCheckoutSession() { return stripeUnavailable(); },
  async createBillingPortalSession() { return stripeUnavailable(); },
  async createPrice() { return stripeUnavailable(); },
  async verifyWebhookSignature() { return null; },
};
