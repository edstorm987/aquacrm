import "server-only";
// Activity log — durable audit trail.
//
// Cap kept generous (50k entries) so the JSON blob stays bounded even
// when retention is set to several years. Newest entries kept; oldest
// evicted on append.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import type { ActivityCategory, ActivityEntry } from "./types";

const ACTIVITY_HARD_CAP = 50_000;

export interface LogActivityInput {
  agencyId: string;
  clientId?: string;
  actorUserId?: string;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export function logActivity(input: LogActivityInput): ActivityEntry {
  const entry: ActivityEntry = {
    id: `act_${crypto.randomBytes(6).toString("hex")}`,
    ts: Date.now(),
    agencyId: input.agencyId,
    clientId: input.clientId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: input.category,
    action: input.action,
    message: input.message,
    metadata: input.metadata,
  };
  mutate(state => {
    state.activity.push(entry);
    if (state.activity.length > ACTIVITY_HARD_CAP) {
      state.activity.splice(0, state.activity.length - ACTIVITY_HARD_CAP);
    }
  });
  return entry;
}

export interface ListActivityFilter {
  agencyId: string;
  clientId?: string;
  limit?: number;
}

export interface QueryActivityFilter extends ListActivityFilter {
  category?: string;
  action?: string;
  actor?: string;
  query?: string;
  from?: number;
  to?: number;
  offset?: number;
}

export interface ActivityQueryResult {
  entries: ActivityEntry[];
  total: number;
  agencyTotal: number;
  categories: string[];
  actions: string[];
  actors: string[];
}

export function listActivity(filter: ListActivityFilter): ActivityEntry[] {
  const limit = filter.limit ?? 50;
  return getState().activity
    .filter(a => {
      if (a.agencyId !== filter.agencyId) return false;
      if (filter.clientId !== undefined && a.clientId !== filter.clientId) return false;
      return true;
    })
    .slice(-limit)
    .reverse();
}

export function queryActivity(filter: QueryActivityFilter): ActivityQueryResult {
  const all = getState().activity
    .filter(entry => entry.agencyId === filter.agencyId)
    .sort((left, right) => right.ts - left.ts);
  const query = filter.query?.trim().toLowerCase() ?? "";
  const actor = filter.actor?.trim().toLowerCase() ?? "";
  const filtered = all.filter(entry => {
    if (filter.clientId && entry.clientId !== filter.clientId) return false;
    if (filter.category && entry.category !== filter.category) return false;
    if (filter.action && entry.action !== filter.action) return false;
    if (filter.from && entry.ts < filter.from) return false;
    if (filter.to && entry.ts > filter.to) return false;
    if (actor && !`${entry.actorEmail ?? ""} ${entry.actorUserId ?? ""}`.toLowerCase().includes(actor)) return false;
    if (query) {
      const searchable = [
        entry.message,
        entry.action,
        entry.category,
        entry.actorEmail,
        entry.actorUserId,
        entry.clientId,
        JSON.stringify(redactActivityValue(entry.metadata)),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
  const offset = Math.max(0, filter.offset ?? 0);
  const limit = Math.max(1, Math.min(filter.limit ?? 100, ACTIVITY_HARD_CAP));

  return {
    entries: filtered.slice(offset, offset + limit),
    total: filtered.length,
    agencyTotal: all.length,
    categories: uniqueSorted(all.map(entry => entry.category)),
    actions: uniqueSorted(all.map(entry => entry.action)),
    actors: uniqueSorted(all.flatMap(entry => [entry.actorEmail, entry.actorUserId]).filter((value): value is string => Boolean(value))),
  };
}

const PRIVATE_METADATA_KEY = /(password|secret|token|api[-_]?key|cookie|authorization|credential|hash|nonce)/i;
const STORED_CONTENT_KEY = /(base64|fileContent|contentBase64|dataUrl|attachmentBody)/i;

export function redactActivityValue(value: unknown, key = "", depth = 0): unknown {
  if (PRIVATE_METADATA_KEY.test(key)) return "[redacted]";
  if (STORED_CONTENT_KEY.test(key)) return "[stored content]";
  if (depth > 8) return "[nested data]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}...` : value;
  if (Array.isArray(value)) return value.map(item => redactActivityValue(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([childKey, childValue]) => [childKey, redactActivityValue(childValue, childKey, depth + 1)]),
    );
  }
  return String(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
