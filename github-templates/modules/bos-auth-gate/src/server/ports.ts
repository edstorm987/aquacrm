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

export type GateEventName =
  | "bos-auth-gate.allow"
  | "bos-auth-gate.redirect"
  | "bos-auth-gate.dev-bypass"
  | "bos-auth-gate.me_read";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: GateEventName | string,
    payload: T,
  ): void;
}

// Soft-pair with @aqua/plugin-public-funnel — when installed, the
// foundation injects this port so the gate's `me` endpoint can
// surface the lead's HC slot. Absent → me payload still works,
// just without `hcSlot` / `capturedAt`.
export interface FunnelMePort {
  getMeContextByUserId(userId: UserId): Promise<{
    leadUserId: UserId;
    email: string;
    hcSlot?: Record<string, unknown>;
    capturedAt?: number;
  } | null> | {
    leadUserId: UserId;
    email: string;
    hcSlot?: Record<string, unknown>;
    capturedAt?: number;
  } | null;
}
