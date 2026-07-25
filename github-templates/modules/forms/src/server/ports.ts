// Foundation port contracts for the forms plugin.
//
// Six standard ports + one OPTIONAL EmailQueuePort. Email sending
// itself remains agency-marketing's territory; this plugin only
// enqueues notification requests.

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

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
  getClient(id: ClientId): Promise<Client | null> | Client | null;
}

export interface UserPort {
  getUser(id: UserId): Promise<{ id: UserId; email: string; name?: string } | null>
    | { id: UserId; email: string; name?: string } | null;
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

export type FormsEventName =
  | "forms.form.created"
  | "forms.form.updated"
  | "forms.form.published"
  | "forms.form.archived"
  | "forms.submission.created"
  | "forms.submission.status_changed"
  | "forms.notification.requested"
  | "forms.template.created";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: FormsEventName | string,
    payload: T,
  ): void;
}

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Optional port: agency-marketing's email queue ───────────────────────
//
// Foundation supplies this when agency-marketing is also installed for
// the agency. Absent → notification requests still emit as events
// (`forms.notification.requested`) but no email is queued. agency-
// marketing's send-time integration (deferred to a future round) is
// what would actually deliver.

export interface EmailQueueRequest {
  to: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
}

export interface EmailQueuePort {
  enqueue(args: { agencyId: AgencyId; clientId?: ClientId; request: EmailQueueRequest }): Promise<{ ok: boolean; queued?: boolean }>;
}
