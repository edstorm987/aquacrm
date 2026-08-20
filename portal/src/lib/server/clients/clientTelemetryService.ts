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

export function newTelemetrySiteKey(): string {
  return `aqua_${crypto.randomBytes(24).toString("base64url")}`;
}

export function ensureClientTelemetry(
  agencyId: string,
  clientId: string,
): ClientTelemetrySnapshot | null {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  const metadata = client.metadata ?? {};
  const existingKey = typeof metadata.telemetrySiteKey === "string"
    ? metadata.telemetrySiteKey
    : "";
  const siteKey = existingKey || newTelemetrySiteKey();
  const events = Array.isArray(metadata.telemetryEvents)
    ? metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];
  const lastSeenAt = typeof metadata.telemetryLastSeenAt === "number"
    ? metadata.telemetryLastSeenAt
    : undefined;

  if (!existingKey) {
    updateClient(agencyId, clientId, {
      metadata: {
        telemetrySiteKey: siteKey,
        telemetryEvents: events,
      },
    });
  }

  return {
    siteKey,
    events,
    lastSeenAt,
    connected: events.length > 0,
  };
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
): { status: "recorded"; clientId: string; event: ClientTelemetryEvent } | { status: "rate-limited" } | null {
  const state = getState();
  const client = Object.values(state.clients).find(candidate =>
    candidate.metadata?.telemetrySiteKey === siteKey
  );
  if (!client) return null;
  const existingEvents = Array.isArray(client.metadata?.telemetryEvents)
    ? client.metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];
  const minuteAgo = Date.now() - 60_000;
  if (existingEvents.filter(event => event.receivedAt >= minuteAgo).length >= MAX_EVENTS_PER_MINUTE) {
    return { status: "rate-limited" };
  }

  const requestedType = cleanText(input.type, 32) as ClientTelemetryEventType | undefined;
  const type = requestedType && TELEMETRY_EVENT_TYPES.includes(requestedType)
    ? requestedType
    : "custom";
  const now = Date.now();
  const occurredAtInput = cleanNumber(input.occurredAt);
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

  let connectedPropertyId = "";
  let connectedPropertyLabel = "";
  mutate(current => {
    const stored = current.clients[client.id];
    if (!stored || stored.metadata?.telemetrySiteKey !== siteKey) return;
    const previous = Array.isArray(stored.metadata.telemetryEvents)
      ? stored.metadata.telemetryEvents as ClientTelemetryEvent[]
      : [];
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
