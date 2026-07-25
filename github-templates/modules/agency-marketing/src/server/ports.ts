// Foundation port contracts for the agency-marketing plugin.
// Six ports — same set as agency-finance + agency-HR.

import type {
  ActivityCategory,
  ActivityEntry,
  Agency,
  AgencyId,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
  UserProjection,
} from "../lib/tenancy";

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
}

export interface UserPort {
  getUser(id: UserId): Promise<UserProjection | null> | UserProjection | null;
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

export type MarketingEventName =
  | "campaign.created"
  | "campaign.scheduled"
  | "campaign.started"
  | "campaign.paused"
  | "campaign.completed"
  | "campaign.archived"
  | "lead.created"
  | "lead.contacted"
  | "lead.status_changed"
  | "lead.converted"
  | "template.created"
  | "template.archived";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: MarketingEventName | string,
    payload: T,
  ): void;
}

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}
