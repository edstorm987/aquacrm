// Foundation port contracts for the SOPs plugin. Mirrors the shape
// other Aqua plugins use (storage / activity / events / tenant /
// user) — minimal surface; SOPs only need storage + activity for v1.

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

export interface TenantPort {
  getUser?(id: UserId): Promise<UserProfile | null> | UserProfile | null;
}

export interface UserPort {
  getUser(id: UserId): Promise<UserProfile | null> | UserProfile | null;
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

export type SopEventName =
  | "sops.sop.created"
  | "sops.sop.updated"
  | "sops.sop.published"
  | "sops.sop.archived"
  | "sops.sop.restored";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: SopEventName | string,
    payload: T,
  ): void;
}
