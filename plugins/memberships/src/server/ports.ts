// Foundation port contracts for the memberships plugin.
//
// Same discipline as fulfillment / ecommerce / agency-hr: every reach
// into the foundation goes through one of these interfaces. T1 binds
// concrete implementations at boot via `registerMembershipsFoundation`
// and the plugin sees only the typed surface.
//
// Memberships needs more ports than agency-HR because it (a) talks to
// Stripe via per-install keys and (b) needs to resolve end-customer
// identities to drive the customer-facing pages. The Stripe surface is
// declared here as `StripePort` rather than imported from the ecommerce
// package — the prompt's preferred decoupled default. T1 brokers by
// reading per-install Stripe keys from the ecommerce install (same
// agencyId+clientId scope) and constructing a Stripe client per
// request, then handing it to the memberships container.

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  EndCustomerProfile,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";

// ─── Storage (per-install plugin storage) ────────────────────────────────

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// ─── Tenant (read-only client lookup) ────────────────────────────────────

export interface TenantPort {
  getClient(id: ClientId): Promise<Client | null> | Client | null;
  getClientForAgency(agencyId: AgencyId, clientId: ClientId): Promise<Client | null> | Client | null;
}

// ─── User (resolve end-customer identity) ───────────────────────────────
//
// NEW for memberships: agency-HR + ecommerce + fulfillment didn't need
// this. T1's `users.ts` already exposes `getUser(id)`; the foundation
// adapter wires it through. Only the fields memberships actually
// consumes are surfaced — keeping the port narrow lets T1 enforce
// access control if it wants to.

export interface UserPort {
  getUser(id: UserId): Promise<EndCustomerProfile | null> | EndCustomerProfile | null;
  // Future-compatible: list end-customers for a client (paged).
  // T1 owns the storage path; we only need the projection.
  listEndCustomersForClient?(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    limit?: number;
    cursor?: string;
  }): Promise<{ users: EndCustomerProfile[]; nextCursor?: string }> | { users: EndCustomerProfile[]; nextCursor?: string };
}

// ─── Activity log ────────────────────────────────────────────────────────

export interface LogActivityInput {
  agencyId: AgencyId;
  clientId?: ClientId;
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
  listActivity(filter: ListActivityFilter): Promise<ActivityEntry[]> | ActivityEntry[];
}

// ─── Event bus ─────────────────────────────────────────────────────────────
//
// Memberships emits subscription state-change + payment events. Names
// follow the foundation's dot-namespaced convention; the canonical
// `EventName` union doesn't constrain these — `string` is permitted
// alongside known names so plugin-defined events are first-class
// citizens.

export type MembershipEventName =
  | "membership.subscription_changed"
  | "membership.subscription_started"
  | "membership.subscription_canceled"
  | "membership.payment_failed"
  | "membership.payment_succeeded"
  | "membership.benefit_unlocked"
  | "membership.benefit_revoked";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: MembershipEventName | string,
    payload: T,
  ): void;
}

// ─── Plugin install store (read-only slice) ──────────────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Stripe port (injected — does NOT import the Stripe SDK directly) ───
//
// The foundation reads per-install Stripe keys (from the ecommerce
// install in the same scope, since `requires: ["ecommerce"]`) and
// constructs a concrete client. This port is the surface memberships
// consumes — minimal, async, no SDK types leak through. The shapes
// match the parts of the Stripe SDK we need; the foundation's adapter
// translates between them and the real SDK calls.

export interface StripeCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface StripeCustomer {
  id: string;
  email?: string;
}

export interface StripeSubscriptionInput {
  customerId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface StripeSubscription {
  id: string;
  customerId: string;
  status: string;                  // raw Stripe status — caller maps to SubscriptionStatus
  currentPeriodEnd?: number;       // unix seconds
  cancelAtPeriodEnd: boolean;
  trialEnd?: number;               // unix seconds
  items: { priceId: string }[];
}

export interface StripeCheckoutSessionInput {
  customerId?: string;
  customerEmail?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  trialDays?: number;
  // Subscription mode is implied — memberships always creates
  // recurring subscriptions, not one-shot payments.
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export interface StripeBillingPortalInput {
  customerId: string;
  returnUrl: string;
}

export interface StripeBillingPortalSession {
  id: string;
  url: string;
}

export interface StripePriceInput {
  product: string | { name: string; description?: string };
  unitAmount: number;              // cents
  currency: string;                // ISO 4217 lowercase
  recurring: { interval: "month" | "year" };
  metadata?: Record<string, string>;
}

export interface StripePrice {
  id: string;
  productId: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
}

export interface StripePort {
  // Customer + subscription lifecycle
  createCustomer(input: StripeCustomerInput): Promise<StripeCustomer>;
  retrieveCustomer(id: string): Promise<StripeCustomer | null>;
  createSubscription(input: StripeSubscriptionInput): Promise<StripeSubscription>;
  cancelSubscription(id: string, atPeriodEnd: boolean): Promise<StripeSubscription>;
  retrieveSubscription(id: string): Promise<StripeSubscription | null>;
  pauseSubscription(id: string): Promise<StripeSubscription>;
  resumeSubscription(id: string): Promise<StripeSubscription>;
  changeSubscriptionPlan(args: {
    id: string;
    newPriceId: string;
  }): Promise<StripeSubscription>;

  // Hosted UIs
  createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession>;
  createBillingPortalSession(input: StripeBillingPortalInput): Promise<StripeBillingPortalSession>;

  // Price management (called from PlanService.syncStripe)
  createPrice(input: StripePriceInput): Promise<StripePrice>;

  // Webhook signature verification — the foundation supplies the
  // per-install webhook secret (Stripe `whsec_…`). Returning
  // null means "signature did not verify" → 400 from the handler.
  verifyWebhookSignature(args: {
    rawBody: string;
    signatureHeader: string;
  }): Promise<StripeWebhookEvent | null>;
}
