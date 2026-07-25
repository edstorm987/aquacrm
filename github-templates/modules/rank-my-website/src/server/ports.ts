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

export type RmwEventName =
  | "rank-my-website.diagnostic.run"
  | "rank-my-website.diagnostic.failed"
  | "rank-my-website.capture.handed-off";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: RmwEventName | string,
    payload: T,
  ): void;
}

// Pluggable HTTP fetcher — abstracted so the smoke can inject a
// deterministic in-memory responder. Foundation wires Node's fetch
// (with timeout + max-bytes guardrails enforced INSIDE this port).
export interface HttpFetchPort {
  // Fetch the URL and return the response context the analyzer needs.
  // Errors must be thrown with a `kind` discriminator the service
  // can map to a fetch-error band.
  fetchPage(url: string, opts: { timeoutMs: number; maxBodyBytes: number }): Promise<FetchPageResult>;
  // HEAD/GET probe a related URL (robots.txt / sitemap.xml).
  // Returns true when reachable with a 2xx or 3xx response.
  reachable(url: string, opts: { timeoutMs: number }): Promise<boolean>;
}

export interface FetchPageResult {
  finalUrl: string;        // post-redirect
  status: number;
  body: string;            // truncated to maxBodyBytes
  headers: Record<string, string>;
}

export class HttpFetchError extends Error {
  constructor(public kind: "timeout" | "network" | "http" | "too-large" | "blocked-private", message: string, public status?: number) {
    super(message);
    this.name = "HttpFetchError";
  }
}

// Hand-off to @aqua/plugin-public-funnel — when installed, the
// foundation injects this port so the rmw capture flow can create a
// lead user via the funnel's `tool-complete` path. Absent → capture
// returns a guidance string ("install @aqua/plugin-public-funnel").
export interface FunnelCapturePort {
  captureToolCompletion(input: {
    email: string;
    toolId: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    sourceMeta?: Record<string, unknown>;
  }): Promise<{ leadUserId: string; created: boolean; session?: string }> | { leadUserId: string; created: boolean; session?: string };
}
