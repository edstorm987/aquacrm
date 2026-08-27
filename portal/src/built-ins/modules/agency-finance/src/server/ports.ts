// Foundation port contracts for the agency-finance plugin.
//
// Six ports — same discipline as memberships + agency-HR. Notably no
// cross-plugin EcommerceOrdersPort or StripePort: invoices are
// generated-and-tracked, not billed-through-Stripe in v1 (real
// Stripe Invoice sync deferred to a future round).

import type {
  ActivityCategory,
  ActivityEntry,
  Agency,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
  UserProjection,
} from "../lib/tenancy";
import type {
  CompensationRateBasis,
  Currency,
  PayeeType,
} from "../lib/domain";

// ─── Storage (per-install plugin storage) ────────────────────────────────

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  runExclusive?<T>(key: string, operation: () => Promise<T>): Promise<T>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// ─── Tenant (read agency + client metadata) ─────────────────────────────

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
  getClient(id: ClientId): Promise<Client | null> | Client | null;
  getClientForAgency(agencyId: AgencyId, clientId: ClientId): Promise<Client | null> | Client | null;
  listClients?(agencyId: AgencyId): Promise<Client[]> | Client[];
}

// ─── User (resolve staff identity) ───────────────────────────────────────

export interface UserPort {
  getUser(id: UserId): Promise<UserProjection | null> | UserProjection | null;
}

// ─── Activity log ────────────────────────────────────────────────────────

export interface LogActivityInput {
  /** Stable source-operation identity. Replays return the original entry. */
  idempotencyKey?: string;
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

export type FinanceEventName =
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.voided"
  | "invoice.refunded"
  | "expense.created"
  | "expense.approved"
  | "expense.rejected"
  | "expense.reimbursed"
  | "category.created"
  | "category.archived";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: FinanceEventName | string,
    payload: T,
  ): void;
}

// ─── Plugin install lookup ───────────────────────────────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Canonical People compensation terms ────────────────────────────────

export interface CanonicalCompensationTerms {
  staffId: string;
  compensationProfileId?: string;
  name: string;
  email: string;
  title: string;
  departmentName?: string;
  payeeType: PayeeType;
  currency: Currency;
  rateBasis: CompensationRateBasis;
  baseRateCents: number;
  unitsPerWeek?: number;
  annualBonusTargetCents: number;
  activeCommissionRuleCount: number;
  hasVariableCommission: boolean;
  contractStartsAt?: number;
  contractEndsAt?: number;
}

export interface CompensationTermsPort {
  getTerms(agencyId: AgencyId, staffId: string): Promise<CanonicalCompensationTerms | null> | CanonicalCompensationTerms | null;
  setProfileLink(agencyId: AgencyId, staffId: string, profileId: string | null, actor: UserId, expectedCurrentProfileId?: string): Promise<void> | void;
}
