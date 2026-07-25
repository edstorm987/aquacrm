// Foundation port contracts for the ai-builder plugin.
//
// Trimmed from the email-sender plugin's port set — ai-builder only
// needs the standard tenant/activity/events surface (no driver
// pattern, no template port). The vendored AquaPlugin contract
// (`src/lib/aquaPluginTypes.ts`) imports these.

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";

// ─── Storage (mirror of PluginStorage from aquaPluginTypes) ────────────────

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// ─── Tenant projection ─────────────────────────────────────────────────────

export interface TenantPort {
  getAgency(agencyId: AgencyId): Promise<{ id: AgencyId; name: string } | null>;
}

// ─── Activity log ──────────────────────────────────────────────────────────

export interface LogActivityInput {
  agencyId: AgencyId;
  clientId?: ClientId;
  pluginId: string;
  category: ActivityCategory;
  action: string;
  resourceId?: string;
  resourceLink?: string;
  actor?: UserId;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  log(input: LogActivityInput): Promise<void>;
  list(filter: ListActivityFilter): Promise<ActivityEntry[]>;
}

// ─── Event bus ─────────────────────────────────────────────────────────────

export type AiBuilderEventName =
  | "ai-builder.generation.completed"
  | "ai-builder.generation.rejected"
  | "ai-builder.generation.failed"
  | "ai-builder.cache.hit";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: AiBuilderEventName | string,
    payload: T,
  ): void;
}

// ─── Plugin install store ──────────────────────────────────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}
