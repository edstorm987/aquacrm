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

export type AgencyDomainsEventName =
  | "agency-domains.attach.created"
  | "agency-domains.attach.deleted"
  | "agency-domains.attach.transitioned";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: AgencyDomainsEventName | string,
    payload: T,
  ): void;
}
