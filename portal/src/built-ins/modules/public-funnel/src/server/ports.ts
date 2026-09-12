import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
  UserProfile,
} from "../lib/tenancy";

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  setIfAbsent?<T = unknown>(key: string, value: T): Promise<boolean>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface UserPort {
  getUser(id: UserId): Promise<UserProfile | null> | UserProfile | null;
}

export interface TenantPort {
  getClient?(id: ClientId): Promise<{ id: ClientId; name: string } | null> | { id: ClientId; name: string } | null;
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

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
}

export type FunnelEventName =
  | "public-funnel.lead.captured"
  | "public-funnel.hc.completed"
  | "public-funnel.tool.completed";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: FunnelEventName | string,
    payload: T,
  ): void;
}

// Foundation identity-admission port. The historical name is retained for API
// compatibility, but anonymous capture must never create a global User.
export interface LeadUserPort {
  // The adapter refuses any address already owned by a real identity, then
  // allocates an opaque pending id inside the same transaction as plugin
  // persistence. The id has no password, session, membership or provider
  // identity. Only a future mailbox-proof promotion may create/attach a User.
  withPendingLeadByEmail<T>(
    email: string,
    operation: (createPendingLead: () => { id: string }) => Promise<T>,
  ): Promise<{ value: T; created: true } | { created: false }>;

  /** Remove audit/ledger artifacts owned by exact captures of any identity kind. */
  eraseCaptureArtifacts(input: {
    agencyId: AgencyId;
    captureIds: string[];
  }): Promise<{ recordsErased: number }>;

  /**
   * Erasure-only cleanup. Exact capture ids may always lose their own audit
   * trail. This removes only legacy capture-created User rows after proving no
   * plugin capture anywhere still owns them. New pending captures have no User.
   */
  eraseIfUnreferenced(input: {
    userId: UserId;
    email: string;
  }): Promise<{
    status: "deleted" | "missing" | "preserved";
    recordsErased: number;
    reason?: "still-referenced" | "ambiguous-user" | "non-capture-lead";
  }>;
}
