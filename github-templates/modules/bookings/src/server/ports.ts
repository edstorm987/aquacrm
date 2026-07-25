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

export type BookingsEventName =
  | "bookings.service.created"
  | "bookings.service.updated"
  | "bookings.service.archived"
  | "bookings.booking.created"
  | "bookings.booking.confirmed"
  | "bookings.booking.cancelled"
  | "bookings.booking.completed"
  | "bookings.booking.no_show";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: BookingsEventName | string,
    payload: T,
  ): void;
}

// Optional cross-plugin ports — engine no-ops gracefully when absent.

export interface EmailSenderPort {
  send(args: {
    agencyId: AgencyId;
    clientId?: ClientId;
    to: string;
    subject: string;
    body: string;
    attachments?: Array<{ filename: string; contentType: string; body: string }>;
  }): Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
}

export interface CrmPort {
  mergeFromBooking(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    email: string;
    name: string;
    bookingId: string;
  }): Promise<void> | void;
}
