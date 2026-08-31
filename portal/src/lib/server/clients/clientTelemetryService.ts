import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import {
  TELEMETRY_EVENT_TYPES,
  type ClientTelemetryEvent,
  type ClientTelemetryEventType,
  type ClientTelemetrySnapshot,
} from "@/lib/clients/clientTelemetry";
import { syncClientPerformanceMilestones } from "@/server/clientMilestones";

const MAX_EVENTS_PER_CLIENT = 500;
const MAX_EVENTS_PER_MINUTE = 120;
const MAX_TEXT = 2_000;

/**
 * Deterministic beacon identity — the telemetry half of "imports are
 * idempotent by provider ids" (docs/data/MIGRATION-PLAN.md Phase 5).
 *
 * Until 2026-08-30 every beacon got `evt_<random>`, so an HTTP retry or a
 * replayed request double-counted straight into traffic-7d, forms-7d,
 * website-conversion and every ROAS denominator — with a duplicate activity
 * row alongside. The Aqua Tag stamps `occurredAt: Date.now()` ONCE per event
 * client-side (aquaTagSource.ts), so a replay carries the same
 * millisecond-precision timestamp while two genuine identical events differ.
 * That makes content+time a real identity: hash the cleaned content plus the
 * RAW supplied occurredAt (pre-coercion, so stale replays outside the 7-day
 * window still dedupe) under the site key.
 *
 * A beacon that carries NO occurredAt keeps a random id — with neither a
 * provider id nor an event time there is no honest identity to dedupe on,
 * and suppressing possibly-distinct events would be worse than counting a
 * rare replay. Events evicted past the 500-event retention can re-enter if
 * replayed later; accepted, recorded here rather than hidden.
 */
function deterministicTelemetryEventId(
  siteKey: string,
  occurredAtInput: number,
  event: ClientTelemetryEvent,
): string {
  const content: Array<string | number | null | undefined> = [
    siteKey,
    event.type,
    occurredAtInput,
    event.propertyId,
    event.url,
    event.path,
    event.title,
    event.referrer,
    event.message,
    event.metric,
    event.value,
    event.sessionId,
    event.formName,
    event.query,
    event.impressions,
    event.clicks,
    event.position,
    event.experimentId,
    event.variant,
    event.conversionValueCents,
  ].map(value => (value === undefined ? null : value));
  // JSON keeps field boundaries unambiguous — a bare join would let
  // ["ab", ""] and ["a", "b"] hash identically.
  return `evt_${crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 24)}`;
}

function cleanText(value: unknown, limit = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, limit);
  return text || undefined;
}

function cleanUrl(value: unknown): string | undefined {
  const text = cleanText(value, 2_048);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(-1_000_000_000, Math.min(1_000_000_000, value))
    : undefined;
}

function cleanBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Epoch-ms timestamps must NOT go through `cleanNumber` — its ±1e9 clamp
 * flattened every real `Date.now()` (~1.79e12) to the clamp value, so the
 * supplied event time never survived the 7-day plausibility window and
 * `occurredAt` silently became the server's ingestion time for every beacon.
 * Found 2026-08-30 by the idempotency suite: two distinct events one
 * millisecond apart hashed to one identity because both "occurred" at the
 * clamp. Timestamps are validated to a plausible epoch range instead.
 */
function cleanTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  // 2001-09-09 … 2128-06-11 in epoch ms — anything outside is not a clock.
  return value > 1_000_000_000_000 && value < 5_000_000_000_000 ? value : undefined;
}

export function newTelemetrySiteKey(): string {
  return `aqua_${crypto.randomBytes(24).toString("base64url")}`;
}

/** Read the current telemetry snapshot without provisioning a new site key. */
export function readClientTelemetry(
  agencyId: string,
  clientId: string,
): ClientTelemetrySnapshot | null {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  const metadata = client.metadata ?? {};
  const events = Array.isArray(metadata.telemetryEvents)
    ? metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];
  return {
    siteKey: typeof metadata.telemetrySiteKey === "string" ? metadata.telemetrySiteKey : "",
    events,
    lastSeenAt: typeof metadata.telemetryLastSeenAt === "number"
      ? metadata.telemetryLastSeenAt
      : undefined,
    connected: events.length > 0,
  };
}

export function ensureClientTelemetry(
  agencyId: string,
  clientId: string,
): ClientTelemetrySnapshot | null {
  const snapshot = readClientTelemetry(agencyId, clientId);
  if (!snapshot) return null;
  const siteKey = snapshot.siteKey || newTelemetrySiteKey();
  if (!snapshot.siteKey) {
    updateClient(agencyId, clientId, {
      metadata: {
        telemetrySiteKey: siteKey,
        telemetryEvents: snapshot.events,
      },
    });
  }
  return { ...snapshot, siteKey };
}

export function resetClientTelemetryKey(
  agencyId: string,
  clientId: string,
): ClientTelemetrySnapshot | null {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  const metadata = client.metadata ?? {};
  const events = Array.isArray(metadata.telemetryEvents)
    ? metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];
  const lastSeenAt = typeof metadata.telemetryLastSeenAt === "number"
    ? metadata.telemetryLastSeenAt
    : undefined;
  const siteKey = newTelemetrySiteKey();
  updateClient(agencyId, clientId, { metadata: { telemetrySiteKey: siteKey } });
  return { siteKey, events, lastSeenAt, connected: events.length > 0 };
}

export function clearClientTelemetry(
  agencyId: string,
  clientId: string,
): ClientTelemetrySnapshot | null {
  const snapshot = ensureClientTelemetry(agencyId, clientId);
  if (!snapshot) return null;
  updateClient(agencyId, clientId, {
    metadata: {
      telemetryEvents: [],
      telemetryLastSeenAt: null,
    },
  });
  return { ...snapshot, events: [], lastSeenAt: undefined, connected: false };
}

export function recordClientTelemetry(
  siteKey: string,
  input: Record<string, unknown>,
  userAgent?: string,
): { status: "recorded"; clientId: string; event: ClientTelemetryEvent; deduplicated?: true } | { status: "rate-limited" } | null {
  const state = getState();
  const client = Object.values(state.clients).find(candidate =>
    candidate.metadata?.telemetrySiteKey === siteKey
  );
  if (!client) return null;
  const existingEvents = Array.isArray(client.metadata?.telemetryEvents)
    ? client.metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];

  const requestedType = cleanText(input.type, 32) as ClientTelemetryEventType | undefined;
  const type = requestedType && TELEMETRY_EVENT_TYPES.includes(requestedType)
    ? requestedType
    : "custom";
  const now = Date.now();
  const occurredAtInput = cleanTimestamp(input.occurredAt);
  const occurredAt = occurredAtInput && Math.abs(now - occurredAtInput) < 7 * 24 * 60 * 60 * 1000
    ? occurredAtInput
    : now;
  const event: ClientTelemetryEvent = {
    id: `evt_${crypto.randomBytes(10).toString("hex")}`,
    type,
    receivedAt: now,
    occurredAt,
    propertyId: cleanText(input.propertyId, 120),
    url: cleanUrl(input.url),
    path: cleanText(input.path, 1_024),
    title: cleanText(input.title, 240),
    referrer: cleanUrl(input.referrer),
    message: cleanText(input.message),
    metric: cleanText(input.metric, 80),
    value: cleanNumber(input.value),
    release: cleanText(input.release, 160),
    environment: cleanText(input.environment, 80),
    sessionId: cleanText(input.sessionId, 120),
    formName: cleanText(input.formName, 160),
    query: cleanText(input.query, 300),
    impressions: cleanNumber(input.impressions),
    clicks: cleanNumber(input.clicks),
    position: cleanNumber(input.position),
    experimentId: cleanText(input.experimentId, 120),
    variant: cleanText(input.variant, 120),
    conversionValueCents: cleanNumber(input.conversionValueCents),
    consentVersion: cleanNumber(input.consentVersion),
    consentNecessary: cleanBoolean(input.consentNecessary),
    consentPreferences: cleanBoolean(input.consentPreferences),
    consentAnalytics: cleanBoolean(input.consentAnalytics),
    consentMarketing: cleanBoolean(input.consentMarketing),
    userAgent: cleanText(userAgent, 400),
  };

  // Content+time identity where the beacon carries its own event time — see
  // deterministicTelemetryEventId. A replayed request maps to the SAME id,
  // is answered with the event it already recorded, and consumes neither the
  // rate limit nor a second activity row nor a milestone sync. Ordered
  // before the rate limit deliberately: a burst of provider retries must not
  // starve genuine new events.
  if (occurredAtInput !== undefined) {
    event.id = deterministicTelemetryEventId(siteKey, occurredAtInput, event);
    const alreadyRecorded = existingEvents.find(existing => existing.id === event.id);
    if (alreadyRecorded) {
      return { status: "recorded", clientId: client.id, event: alreadyRecorded, deduplicated: true };
    }
  }

  const minuteAgo = now - 60_000;
  if (existingEvents.filter(existing => existing.receivedAt >= minuteAgo).length >= MAX_EVENTS_PER_MINUTE) {
    return { status: "rate-limited" };
  }

  let connectedPropertyId = "";
  let connectedPropertyLabel = "";
  let duplicateInMutate = false;
  mutate(current => {
    const stored = current.clients[client.id];
    if (!stored || stored.metadata?.telemetrySiteKey !== siteKey) return;
    const previous = Array.isArray(stored.metadata.telemetryEvents)
      ? stored.metadata.telemetryEvents as ClientTelemetryEvent[]
      : [];
    // Re-check under the mutate: two replays racing past the snapshot read
    // above must still converge on one stored event.
    if (previous.some(existing => existing.id === event.id)) {
      duplicateInMutate = true;
      return;
    }
    stored.metadata = {
      ...stored.metadata,
      telemetryEvents: [event, ...previous].slice(0, MAX_EVENTS_PER_CLIENT),
      telemetryLastSeenAt: now,
    };

    // A manual heartbeat proves the collector works, not that the client's
    // production code contains the tag. Only genuine site events can move a
    // property into the installed state.
    if (event.type !== "heartbeat") {
      const properties = Array.isArray(stored.metadata.properties)
        ? stored.metadata.properties as Array<{
            id: string;
            label?: string;
            kind?: string;
            liveUrl?: string;
            previewUrl?: string;
            tagStatus?: string;
          }>
        : [];
      const eventHost = (() => {
        try { return event.url ? new URL(event.url).host : ""; }
        catch { return ""; }
      })();
      const siteProperties = properties.filter(property =>
        property.kind === "website"
        || property.kind === "client-portal"
        || property.kind === "dev-portal"
      );
      const matched = properties.find(property => event.propertyId && property.id === event.propertyId)
        ?? siteProperties.find(property => {
          if (!eventHost) return false;
          return [property.liveUrl, property.previewUrl].some(value => {
            try { return value ? new URL(value).host === eventHost : false; }
            catch { return false; }
          });
        })
        ?? (siteProperties.length === 1 ? siteProperties[0] : undefined);

      if (matched && matched.tagStatus !== "installed") {
        stored.metadata.properties = properties.map(property =>
          property.id === matched.id ? { ...property, tagStatus: "installed", updatedAt: now } : property
        );
        connectedPropertyId = matched.id;
        connectedPropertyLabel = matched.label || "Website";
      }
    }
    stored.updatedAt = now;
  });

  if (duplicateInMutate) {
    return { status: "recorded", clientId: client.id, event, deduplicated: true };
  }

  if (connectedPropertyId) {
    logActivity({
      agencyId: client.agencyId,
      clientId: client.id,
      category: "system",
      action: "telemetry.connected",
      message: `Aqua monitoring connected to ${connectedPropertyLabel}.`,
      metadata: { propertyId: connectedPropertyId, eventType: event.type },
    });
  }

  if (["error", "deployment", "form", "conversion", "search", "chatbot", "interaction", "custom"].includes(event.type)) {
    const eventLabel = event.type === "form"
      ? "form submission"
      : event.type === "chatbot"
        ? "chatbot interaction"
        : event.type;
    logActivity({
      agencyId: client.agencyId,
      clientId: client.id,
      category: event.type === "error"
        ? "support"
        : event.type === "deployment"
          ? "fulfillment"
          : event.type === "form"
            ? "public-funnel"
            : "marketing",
      action: `telemetry.${event.type}`,
      message: `${client.name} recorded a ${eventLabel}.`,
      metadata: {
        telemetryEventId: event.id,
        propertyId: event.propertyId,
        path: event.path,
        url: event.url,
        title: event.title,
        metric: event.metric,
        value: event.value,
        release: event.release,
        environment: event.environment,
        message: event.type === "error" ? event.message : undefined,
        messageLength: event.message?.length,
        formName: event.formName,
        experimentId: event.experimentId,
        variant: event.variant,
      },
    });
  }

  syncClientPerformanceMilestones(client.agencyId, client.id);
  return { status: "recorded", clientId: client.id, event };
}
