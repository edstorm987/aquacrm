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

// Cross-plugin events — agency-finance subscribes to `payroll.payslip.paid`
// to surface a reconciliation hint on its dashboard. period.opened/closed
// also re-broadcast for any future consumer (e.g. agency-marketing run-rate).
export type AgencyPayrollEventName =
  | "payroll.period.opened"
  | "payroll.period.closed"
  | "payroll.payslip.created"
  | "payroll.payslip.updated"
  | "payroll.payslip.paid"
  | "payroll.payslip.deleted"
  | "payroll.contractor.created"
  | "payroll.contractor.updated"
  | "payroll.contractor.archived";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: AgencyPayrollEventName | string,
    payload: T,
  ): void;
}
