// Domain types for the Activity Inbox plugin.
//
// The plugin reads existing foundation activity events; it does NOT
// write new events. Per-install storage holds:
//   - per-actor lastReadTs (ms)  — drives the unread badge
//   - per-actor lastFilters JSON — convenience persistence
//
// The "category" union is intentionally narrow (re-exported from
// foundation tenancy) so we don't drift from the source of truth.

import type { ActivityCategory, ActivityEntry, ClientId, UserId } from "./tenancy";

export type DateRangePreset = "today" | "week" | "month" | "all" | "custom";

export interface InboxFilter {
  // Empty / undefined = all categories.
  categories?: ActivityCategory[];
  // Empty / undefined = all clients (including agency-level events).
  clientIds?: ClientId[];
  // Inclusive start, exclusive end.
  range?: DateRangePreset;
  rangeStart?: number;
  rangeEnd?: number;
  // When true, hide entries with ts <= actor.lastReadTs.
  unreadOnly?: boolean;
  // Free-text search over message + action.
  query?: string;
  limit?: number;
}

export interface InboxItem extends ActivityEntry {
  read: boolean;
}

export interface InboxGroup {
  // ISO date `YYYY-MM-DD` of the day in UTC.
  day: string;
  clientId?: ClientId;
  items: InboxItem[];
}

export interface InboxListResult {
  items: InboxItem[];
  groups: InboxGroup[];
  unreadCount: number;
  totalScanned: number;
}

export interface ActorReadState {
  actorUserId: UserId;
  lastReadTs: number;
  lastSeenAt: number;
}

// Resolve a DateRangePreset to a [start, end) window in ms.
export function resolveRange(
  range: DateRangePreset | undefined,
  refNow: number,
  rangeStart?: number,
  rangeEnd?: number,
): { start: number; end: number } {
  const day = 86_400_000;
  const startOfDay = (t: number): number => {
    const d = new Date(t);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };
  const sod = startOfDay(refNow);
  if (range === "custom") {
    return { start: rangeStart ?? 0, end: rangeEnd ?? Number.MAX_SAFE_INTEGER };
  }
  if (range === "today") return { start: sod, end: sod + day };
  if (range === "week") return { start: sod - 6 * day, end: sod + day };
  if (range === "month") return { start: sod - 29 * day, end: sod + day };
  return { start: 0, end: Number.MAX_SAFE_INTEGER };
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// All known categories — used by the chip filter row.
export const ALL_CATEGORIES: readonly ActivityCategory[] = [
  "auth", "tenant", "plugin", "phase",
  "fulfillment", "ecommerce", "settings", "system",
  "hr", "memberships", "affiliates", "finance", "marketing", "crm",
  "forms", "email", "export", "kanban", "sops",
] as const;

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  auth: "Auth",
  tenant: "Tenant",
  plugin: "Plugin",
  phase: "Phase",
  fulfillment: "Fulfillment",
  ecommerce: "Ecommerce",
  settings: "Settings",
  system: "System",
  hr: "HR",
  memberships: "Memberships",
  affiliates: "Affiliates",
  finance: "Finance",
  marketing: "Marketing",
  crm: "CRM",
  forms: "Forms",
  email: "Email",
  export: "Export",
  kanban: "Kanban",
  sops: "SOPs",
};
