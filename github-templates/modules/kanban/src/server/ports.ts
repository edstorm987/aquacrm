// Foundation port contracts for the kanban plugin.

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
  // Boards can be agency-scoped or per-client. The kanban plugin
  // reads tenant only to render assignee labels — minimal surface.
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

export type KanbanEventName =
  | "kanban.board.created"
  | "kanban.board.updated"
  | "kanban.board.archived"
  | "kanban.column.added"
  | "kanban.column.renamed"
  | "kanban.column.removed"
  | "kanban.column.reordered"
  | "kanban.card.created"
  | "kanban.card.updated"
  | "kanban.card.moved"
  | "kanban.card.archived"
  | "kanban.card.restored";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: KanbanEventName | string,
    payload: T,
  ): void;
}
