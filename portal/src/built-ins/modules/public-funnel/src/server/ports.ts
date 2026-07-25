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
  // Idempotent on email — returns existing lead user if one already
  // matches (case-insensitive), creates a new lead user otherwise.
  // Returns `{ user, created }` so the caller can distinguish first
  // capture vs. re-engagement.
  upsertLeadByEmail(email: string): Promise<{ user: UserProfile; created: boolean }> | { user: UserProfile; created: boolean };
}

// Foundation session port — issues a session for the just-captured
// lead so the funnel handler can set a Set-Cookie response header and
// the user lands on /business-os already signed in. The plugin treats
// the returned token as opaque.
export interface SessionPort {
  issueSession(userId: UserId): Promise<string> | string;
}
