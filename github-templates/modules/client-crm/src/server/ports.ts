// Foundation port contracts for the client-CRM plugin.
//
// Six standard ports (Storage, Tenant, User, ActivityLog, EventBus,
// PluginInstallStore) plus two OPTIONAL cross-plugin ports
// (MembershipBenefits, EcommerceOrders) that return null when their
// source plugin isn't installed for the same client. The CRM
// degrades gracefully — segments work without memberships, contact
// timelines work without ecommerce.

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

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface TenantPort {
  getClient(id: ClientId): Promise<Client | null> | Client | null;
  getClientForAgency(agencyId: AgencyId, clientId: ClientId): Promise<Client | null> | Client | null;
}

export interface UserPort {
  getUser(id: UserId): Promise<EndCustomerProfile | null> | EndCustomerProfile | null;
  getUserByEmail?(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    email: string;
  }): Promise<EndCustomerProfile | null> | EndCustomerProfile | null;
}

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

export type CrmEventName =
  | "crm.contact.created"
  | "crm.contact.updated"
  | "crm.contact.archived"
  | "crm.contact.imported"
  | "crm.contact.merged"
  | "crm.segment.created"
  | "crm.segment.archived"
  | "crm.activity.recorded";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: CrmEventName | string,
    payload: T,
  ): void;
}

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Optional cross-plugin ports ─────────────────────────────────────────
//
// Same return-null-when-absent pattern used in R5 (ecommerce ↔
// memberships) + R5b (affiliates ↔ ecommerce orders). Foundation
// brokers the cross-package read at boot via a side-effect-import
// file; CRM never imports those packages directly.

export interface MembershipSnapshot {
  planId: string;
  planName?: string;
  status: string;                  // raw subscription status, e.g. "active"|"trialing"
}

export interface MembershipBenefitsPort {
  getMembershipForUser(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    userId: UserId;
  }): Promise<MembershipSnapshot | null>;
}

export interface EcommerceOrderProjection {
  orderId: string;
  endCustomerUserId?: UserId;
  customerEmail?: string;
  amountTotal: number;
  currency: string;
  createdAt: number;
}

export interface EcommerceOrdersPort {
  // List recent orders for a single end-customer. Returns [] when
  // ecommerce isn't installed or has no orders for the user.
  listForUser(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    userId?: UserId;
    email?: string;
    limit?: number;
  }): Promise<EcommerceOrderProjection[]>;
}
