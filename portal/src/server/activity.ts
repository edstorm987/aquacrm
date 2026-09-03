import "server-only";
// Activity log — durable audit trail.
//
// Cap kept generous (50k entries) so the JSON blob stays bounded even
// when retention is set to several years. Newest entries kept; oldest
// evicted on append.

import crypto from "crypto";
import { appendActivityToClientRecordLedger } from "@/lib/server/clients/clientRecordLedger";
import { businessCalendarDate } from "@/lib/shared/formatDateTime";
import { getState, mutate } from "./storage";
import type { ActivityCategory, ActivityEntry, PersonalMetricKey, PortalState } from "./types";

const ACTIVITY_HARD_CAP = 50_000;
const PERSONAL_METRIC_RETENTION_DAYS = 400;

function personalMetricEvidence(entry: ActivityEntry): { metric: PersonalMetricKey; id: string; occurredAt: number } | null {
  if (!entry.actorUserId) return null;
  const metadata = entry.metadata ?? {};
  const text = (key: string) => typeof metadata[key] === "string" && metadata[key] ? String(metadata[key]) : entry.id;
  if (entry.action === "leads.prospect.created") {
    return { metric: "prospects-scouted", id: text("prospectId"), occurredAt: entry.ts };
  }
  if (entry.action === "leads.prospect.outreach-recorded") {
    const metric = metadata.channel === "call" ? "calls-made" : metadata.channel === "email" ? "emails-sent" : null;
    const occurredAt = typeof metadata.contactedAt === "number" && Number.isFinite(metadata.contactedAt) ? metadata.contactedAt : entry.ts;
    return metric ? { metric, id: text("attemptId"), occurredAt } : null;
  }
  if (entry.action === "leads.prospect.qualified") {
    return { metric: "leads-qualified", id: text("prospectId"), occurredAt: entry.ts };
  }
  if (entry.action === "leads.contact.converted") {
    return { metric: "clients-converted", id: text("contactId"), occurredAt: entry.ts };
  }
  return null;
}

function personalMetricEvidenceId(metric: PersonalMetricKey, id: string): string {
  return crypto.createHash("sha256").update(`${metric}\u0000${id}`).digest("hex").slice(0, 24);
}

function projectPersonalMetric(state: PortalState, entry: ActivityEntry): void {
  const evidence = personalMetricEvidence(entry);
  if (!evidence || !entry.actorUserId) return;
  // A scheduled outreach attempt is not work completed yet. It remains in the
  // audit bridge and becomes countable once its actual occurrence time passes.
  if (evidence.occurredAt > Date.now()) return;
  const date = businessCalendarDate(evidence.occurredAt);
  const key = `${entry.agencyId}\u0000${entry.actorUserId}\u0000${date}`;
  const current = state.personalMetricDays[key];
  const evidenceId = personalMetricEvidenceId(evidence.metric, evidence.id);
  if (current) {
    if (current.evidenceIds?.includes(evidenceId)) return;
    state.personalMetricDays[key] = {
      ...current,
      counts: { ...current.counts, [evidence.metric]: (current.counts[evidence.metric] ?? 0) + 1 },
      evidenceIds: [...(current.evidenceIds ?? []), evidenceId],
      updatedAt: Math.max(current.updatedAt, entry.ts),
    };
  } else {
    // First write after the projection ships: backfill this person's business
    // day from retained actor-stamped audit rows, including the new row. Later
    // writes increment the compact counters directly.
    const counts: Partial<Record<PersonalMetricKey, number>> = {};
    const evidenceIds = new Set<string>();
    for (const candidate of state.activity) {
      if (candidate.agencyId !== entry.agencyId || candidate.actorUserId !== entry.actorUserId) continue;
      const projected = personalMetricEvidence(candidate);
      if (!projected || projected.occurredAt > Date.now() || businessCalendarDate(projected.occurredAt) !== date) continue;
      const projectedId = personalMetricEvidenceId(projected.metric, projected.id);
      if (evidenceIds.has(projectedId)) continue;
      evidenceIds.add(projectedId);
      counts[projected.metric] = (counts[projected.metric] ?? 0) + 1;
    }
    state.personalMetricDays[key] = {
      agencyId: entry.agencyId,
      userId: entry.actorUserId,
      date,
      counts,
      evidenceIds: [...evidenceIds],
      updatedAt: entry.ts,
    };
  }

  // Daily/weekly targets need seven days; streaks get a generous 400-day
  // window. Compact daily counters make this bounded by people x days rather
  // than by call volume.
  const cutoff = businessCalendarDate(entry.ts - PERSONAL_METRIC_RETENTION_DAYS * 86_400_000);
  for (const [dayKey, day] of Object.entries(state.personalMetricDays)) {
    if (day.agencyId === entry.agencyId && day.userId === entry.actorUserId && day.date < cutoff) {
      delete state.personalMetricDays[dayKey];
    }
  }
}

export interface LogActivityInput {
  /** Stable source-operation identity. Replays return the original entry. */
  idempotencyKey?: string;
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
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, 500);
  const stableId = idempotencyKey
    ? `act_${crypto.createHash("sha256").update(`${input.agencyId}\u0000${idempotencyKey}`).digest("hex").slice(0, 24)}`
    : undefined;
  if (stableId) {
    const existing = getState().activity.find(entry => entry.id === stableId);
    if (existing) return existing;
  }
  const entry: ActivityEntry = {
    id: stableId ?? `act_${crypto.randomBytes(6).toString("hex")}`,
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
    projectPersonalMetric(state, entry);
    if (state.activity.length > ACTIVITY_HARD_CAP) {
      state.activity.splice(0, state.activity.length - ACTIVITY_HARD_CAP);
    }
  });
  appendActivityToClientRecordLedger(entry);
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
