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

export type StripeEventName =
  | "stripe.event.received"
  | "stripe.event.deduped"
  | "stripe.event.rejected"
  | "stripe.subscription.upserted"
  | "stripe.subscription.deleted";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: StripeEventName | string,
    payload: T,
  ): void;
}

// Vault soft-pair — the round prompt names credentials-vault as a
// hard `requires`. Foundation injects a minimal port that resolves
// the install's webhook secret without exposing the full vault
// surface to this plugin. Absent → ingestion rejects with
// `missing_secret`.
export interface VaultPort {
  getWebhookSecret(scope: { agencyId: AgencyId }): Promise<string | null> | string | null;
}
