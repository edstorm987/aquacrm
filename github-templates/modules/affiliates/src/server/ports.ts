// Foundation port contracts for the affiliates plugin.
//
// Six ports — same discipline as memberships. The new one is
// `EcommerceOrdersPort`, a cross-plugin read into ecommerce: lets
// AttributionService look up an order by id when the ecommerce
// `order.created` event fires (since order metadata isn't carried in
// the event payload — keeps the event surface minimal).

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

export interface UserPort {
  getUser(id: UserId): Promise<EndCustomerProfile | null> | EndCustomerProfile | null;
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

// ─── Event bus ───────────────────────────────────────────────────────────

export type AffiliateEventName =
  | "affiliate.enrolled"
  | "affiliate.code_created"
  | "affiliate.code_archived"
  | "affiliate.attribution_recorded"
  | "affiliate.attribution_approved"
  | "affiliate.attribution_reversed"
  | "affiliate.payout_scheduled"
  | "affiliate.payout_completed"
  | "affiliate.payout_failed";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: AffiliateEventName | string,
    payload: T,
  ): void;
}

// ─── Plugin install lookup ───────────────────────────────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Ecommerce orders (cross-plugin read) ────────────────────────────────
//
// AttributionService.recordOrder(orderId, code) needs the order's
// subtotal + already-applied discount to compute commission. Rather
// than coupling to ecommerce's order shape, we declare a narrow
// projection. The foundation's adapter reads from
// `@aqua/plugin-ecommerce/server`'s `containerFor(storage).orders`
// and projects.
//
// `referralCodeId` is what the ecommerce CartContext attaches to
// orders when a referral code is in scope at checkout — same flow
// `02 felicias aqua portal work`'s `serverOrders` shape used. Today
// ecommerce doesn't carry that field on `ServerOrder`; that's a
// follow-up patch the orchestrator will broker (see chapter
// §"Foundation pending"). Until then, AttributionService accepts
// the code via an explicit handler argument too.

export interface EcommerceOrderProjection {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  endCustomerUserId?: UserId;
  amountTotal: number;                 // cents
  currency: string;
  // Subtotal pre-discount, in cents. Falls back to amountTotal if
  // ecommerce doesn't ship a per-line subtotal sum.
  subtotal: number;
  // Set when checkout carried a code — the affiliate referral code
  // (different from a member-discount code). When the ecommerce
  // schema lands the field, this is an authoritative read; until
  // then, foundation may project from order.metadata.
  referralCodeId?: string;
  // Set when ecommerce already applied another discount (e.g.
  // membership). Affiliates SHOULD still record an attribution —
  // commission is computed against the original subtotal, not the
  // post-discount total — but the source is recorded for audit.
  discountSource?: string;
  createdAt: number;
}

export interface EcommerceOrdersPort {
  getOrder(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    orderId: string;
  }): Promise<EcommerceOrderProjection | null>;
}

// ─── Stripe Connect (R12) ────────────────────────────────────────────────
//
// Narrow Connect surface so the plugin doesn't import `stripe`.
// Foundation projects this from ecommerce's per-install Stripe key
// (same precedent as memberships's StripePort in R4 / R5). Tests
// inject a mock; runtime callers don't have to.
//
// Why a separate port (and not `requireFoundation()` reading
// ecommerce's containerFor): keeps tsc isolation clean — nothing
// in `@aqua/plugin-affiliates` imports `@aqua/plugin-ecommerce`,
// nor `stripe`. The foundation layer wires whichever Stripe driver
// is current at boot.

export type StripeOnboardingStatusValue = "pending" | "complete" | "restricted";

export interface StripeConnectAccountSnapshot {
  accountId: string;
  onboardingStatus: StripeOnboardingStatusValue;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  // Optional disabled-reason mirror of Stripe's `requirements.disabled_reason`.
  disabledReason?: string;
}

export interface StripeConnectPort {
  // Step 1 of onboarding — provisions an Express connected account.
  // Idempotent at the foundation layer (caller passes `affiliateId` so
  // foundation can short-circuit on retry).
  createAccount(args: {
    email: string;
    affiliateId: string;
    agencyId: AgencyId;
    clientId: ClientId;
  }): Promise<{ accountId: string }>;

  // Step 2 — generates a single-use AccountLink the affiliate visits to
  // complete KYC / payout-method capture.
  createOnboardingLink(args: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string; expiresAt: number }>;

  // Status read — collapses Stripe's account-state fields into a single
  // onboarding status the plugin persists.
  retrieveAccount(accountId: string): Promise<StripeConnectAccountSnapshot>;

  // Transfer for a payout — destinationAccountId is the connected
  // affiliate. `idempotencyKey` MUST be derived from the payout id so
  // retries don't double-pay (`payout:<payoutId>` by convention).
  createTransfer(args: {
    destinationAccountId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    description?: string;
    transferGroup?: string;
  }): Promise<{ transferId: string; created: number }>;

  // Webhook signature verification. Returns false on mismatch / missing
  // signing secret. The handler treats false as 400.
  verifyWebhookSignature(args: { rawBody: string; signature: string | null }): boolean;
}
