// Foundation port contracts for the notifications plugin.
//
// In addition to the standard storage / activity / events triple, we
// expose a `ChannelDriverPort` per channel so production deployments
// can swap out the bundled HTTP-fetch driver for a richer one without
// touching the rules engine.

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
  UserProfile,
} from "../lib/tenancy";
import type { ChannelKey, ChannelConfig, DispatchInput, DispatchResult } from "../lib/domain";

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface UserPort {
  getUser(id: UserId): Promise<UserProfile | null> | UserProfile | null;
}

// Vendored types reference TenantPort; expose a no-op shape so the
// plugin types compile standalone.
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

export type NotificationEventName =
  | "notifications.rule.created"
  | "notifications.rule.updated"
  | "notifications.rule.archived"
  | "notifications.dispatch.sent"
  | "notifications.dispatch.skipped"
  | "notifications.dispatch.error"
  | "notifications.dispatch.suppressed";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: NotificationEventName | string,
    payload: T,
  ): void;
}

// Channel drivers are pluggable: a foundation can supply one per
// ChannelKey or rely on the bundled defaults. A driver returns a
// DispatchResult; throwing is permitted — engine maps to "error"
// status with the message.
export interface ChannelDriver {
  channel: ChannelKey;
  dispatch(input: DispatchInput, config: ChannelConfig): Promise<DispatchResult> | DispatchResult;
}

// Optional dependency on the email-sender plugin (Goal A graceful
// fallback). When absent, the email channel emits a "skipped:
// email_sender_not_installed" result.
export interface EmailSenderPort {
  send(args: {
    agencyId: AgencyId;
    clientId?: ClientId;
    to: string;
    subject: string;
    body: string;
  }): Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
}
