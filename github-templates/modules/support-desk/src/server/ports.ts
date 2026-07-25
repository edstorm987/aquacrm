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

export type SupportDeskEventName =
  | "support.ticket.opened"
  | "support.ticket.replied"
  | "support.ticket.assigned"
  | "support.ticket.status-changed"
  | "support.ticket.resolved"
  | "support.ticket.closed"
  | "support.ticket.reopened";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: SupportDeskEventName | string,
    payload: T,
  ): void;

  // Optional subscriber registration. The plugin uses this to listen
  // for ecommerce `order.shipped` and post a follow-up agent-side
  // message on any open ticket from that customer email. If the
  // foundation event bus doesn't expose `on`, the subscriber simply
  // doesn't wire — graceful degradation.
  on?<T = unknown>(
    name: string,
    handler: (
      scope: { agencyId: AgencyId; clientId?: ClientId },
      payload: T,
    ) => void | Promise<void>,
  ): () => void;
}
