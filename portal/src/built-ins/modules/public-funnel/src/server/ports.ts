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

// Foundation lead-user port. T1 R023 added the `lead` role + the
// `LEAD_AGENCY_ID` sentinel; this port wraps the foundation
// `createUser` path so the plugin doesn't depend on the foundation's
// internal user store directly.
export interface LeadUserPort {
  // Anonymous capture is registration, never authentication. The adapter must
  // create a brand-new lead only when the canonical address belongs to no
  // existing identity of any role. `created:false` is a fail-closed refusal.
  // The foundation owns the transaction because identity and plugin capture
  // must commit together. `createLead` is lazy: the callback first checks the
  // completion id, then creates the identity immediately before persistence.
  withNewLeadByEmail<T>(
    email: string,
    operation: (createLead: () => UserProfile) => Promise<T>,
  ): Promise<{ value: T; created: true } | { created: false }>;

  /**
   * Erasure-only cleanup. Exact capture ids may always lose their own audit
   * trail, but the generated lead account is deleted only when no plugin
   * capture anywhere still owns it.
   */
  eraseIfUnreferenced(input: {
    agencyId: AgencyId;
    userId: UserId;
    email: string;
    captureIds: string[];
  }): Promise<{
    status: "deleted" | "missing" | "preserved";
    recordsErased: number;
    reason?: "still-referenced" | "ambiguous-user" | "non-capture-lead";
  }>;
}
