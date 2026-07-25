// Foundation port contracts for @aqua/plugin-domains.
//
// Domains is `scopePolicy: "either"` — installable at agency scope (to
// manage the agency's main domain) or client scope (to manage a Live
// client's per-domain Vercel project). Ports are kept narrow:
//
//   - TenantPort        — read agency / client metadata for activity messages.
//   - ActivityLogPort   — write `domain.attached`/etc. to the foundation log.
//   - EventBusPort      — emit `domain.*` events for downstream listeners.
//   - PluginInstallStorePort — peek at the install row when needed.
//
// Concrete adapters live in `04-the-final-portal/portal/src/plugins/
// foundation-adapters/domainsFoundation.ts` (foundation-pending; new
// patch documented in chapter 04-deployment-domains-observability.md).

import type {
  ActivityCategory,
  ActivityEntry,
  Agency,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";

// ─── Tenant port ─────────────────────────────────────────────────────────

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
  getClient(scope: { agencyId: AgencyId; clientId: ClientId }): Promise<Client | null> | Client | null;
}

// ─── Activity log ──────────────────────────────────────────────────────────

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

// ─── Event bus ─────────────────────────────────────────────────────────────

export type DomainsEventName =
  | "domain.attach.requested"
  | "domain.attached"
  | "domain.attach.failed"
  | "domain.verified"
  | "domain.verify.failed"
  | "domain.removed";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: DomainsEventName | string,
    payload: T,
  ): void;
}

// ─── Plugin install store (read-only slice) ──────────────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}
