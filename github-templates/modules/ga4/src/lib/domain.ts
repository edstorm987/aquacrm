// GA4 plugin domain.

import type { AgencyId } from "./tenancy";

// Public config. Service-account JSON does NOT live here — it's
// stored in credentials-vault and resolved via VaultPort.
export interface Ga4Config {
  agencyId: AgencyId;
  propertyId?: string;            // numeric, no `properties/` prefix; we add it on the wire
  serviceAccountPresent: boolean; // true when vault has a JSON for this agency
  defaultDays: number;            // default lookback window (7)
  cacheTtlMs: number;             // default 15 * 60 * 1000
  updatedAt: number;
  lastTestedAt?: number;
  lastError?: string;
  lastFetchedAt?: number;
}

export interface UpdateGa4ConfigInput {
  propertyId?: string;
  defaultDays?: number;
  cacheTtlMs?: number;
}

// runReport result shape. Pure data — the foundation port (or smoke
// fixture) returns this; the plugin doesn't know about JWTs / OAuth.
export interface DailyRow {
  date: string;                   // "YYYYMMDD" per GA4 default
  sessions: number;
  conversions: number;
}

export interface TouchpointsReport {
  agencyId: AgencyId;
  propertyId: string;
  days: number;
  rows: DailyRow[];
  total: { sessions: number; conversions: number };
  fetchedAt: number;
  fromCache: boolean;
  // Honesty contract (chapter #68): when GA4 isn't configured the
  // plugin still returns a report with `provisional: true` and an
  // empty rows array so the founder dashboard can render "Connect
  // GA4" without fabricating numbers.
  provisional?: boolean;
  // Last error message from a runReport failure (rate limit / auth /
  // quota). Surfaced on diagnostic page; founder dashboard ignores
  // and falls back to its prior metric source.
  error?: string;
}

// Status returned by `testConnection` — distinct from the cached
// report so the diagnostic page can call without warming the cache
// for the touchpoints tile.
export interface TestConnectionResult {
  ok: boolean;
  rowsReturned?: number;
  message: string;
}

// Service-account JSON shape. We only consume `client_email` +
// `private_key`; rest is recorded but unused.
export interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
  type?: string;
  [key: string]: unknown;
}

export function isPlausibleServiceAccountJson(value: unknown): value is ServiceAccountJson {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.client_email === "string" && typeof v.private_key === "string";
}

export function parseServiceAccountJson(raw: string): ServiceAccountJson | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  return isPlausibleServiceAccountJson(parsed) ? parsed : null;
}

// Cache shape. Stored under `cache/touchpoints/<days>` keyed by
// lookback window; LRU not needed at v1 sizes.
export interface CacheEntry {
  fetchedAt: number;
  report: TouchpointsReport;
}

export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_DAYS = 7;
// Rate-limit guard: even if cacheTtlMs is misconfigured to 0 we
// still wait this long between runReport calls per (agency,days)
// pair to avoid hammering GA4 with concurrent founder-dashboard
// renders.
export const MIN_FETCH_GAP_MS = 30 * 1000;

// Reasons returned by getTouchpoints when it serves a placeholder
// report instead of dialing GA4. Activity-inbox surfaces these so
// the operator knows WHY the tile isn't lit.
export type ProvisionalReason =
  | "not_configured"
  | "missing_service_account"
  | "fetch_error";
