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

export type OnboardingEventName =
  | "onboarding.item.created"
  | "onboarding.item.completed"
  | "onboarding.item.skipped"
  | "onboarding.item.deleted"
  | "onboarding.completed";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: OnboardingEventName | string,
    payload: T,
  ): void;
}

// Optional soft-pair with @aqua/plugin-kanban — when installed, the
// foundation injects this port so that on 100% completion we can post
// a "Move to Diagnostics phase" card to the client-tasks board. When
// absent (or no client-tasks board), no-op gracefully.
export interface KanbanPort {
  postCardToClientTasksBoard?(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    title: string;
    description?: string;
  }): Promise<{ posted: boolean; cardId?: string }> | { posted: boolean; cardId?: string };
}
