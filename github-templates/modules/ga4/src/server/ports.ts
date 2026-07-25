import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
  UserProfile,
} from "../lib/tenancy";
import type { DailyRow, ServiceAccountJson } from "../lib/domain";

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

export type Ga4EventName =
  | "ga4.config.updated"
  | "ga4.report.fetched"
  | "ga4.report.cached_hit"
  | "ga4.report.fetch_error"
  | "ga4.connection.tested";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: Ga4EventName | string,
    payload: T,
  ): void;
}

// Vault soft-pair — round prompt names credentials-vault as
// `requires`; absent → service treats config as un-keyed and
// returns provisional reports instead of dialing GA4.
export interface VaultPort {
  getServiceAccountJson(scope: { agencyId: AgencyId }): Promise<string | null> | string | null;
  // Tests pass a parsed JSON via setter; production wires real
  // vault. Setter is optional — settings handler sets when
  // operator pastes JSON in the form.
  setServiceAccountJson?(scope: { agencyId: AgencyId }, jsonString: string): Promise<void> | void;
}

// GA4 runReport port. Production wires the Google Analytics Data
// API (Service Account JWT → access token → POST runReport); the
// plugin treats it as a swappable function. Smoke injects a
// deterministic in-memory responder.
export interface Ga4Port {
  runReport(args: {
    propertyId: string;
    serviceAccount: ServiceAccountJson;
    days: number;
  }): Promise<RunReportResult>;
}

export interface RunReportResult {
  rows: DailyRow[];
  total: { sessions: number; conversions: number };
}

export class Ga4ApiError extends Error {
  constructor(public kind: "auth" | "quota" | "rate_limit" | "network" | "permission" | "other", message: string) {
    super(message);
    this.name = "Ga4ApiError";
  }
}
