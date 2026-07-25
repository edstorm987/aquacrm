export const TELEMETRY_EVENT_TYPES = [
  "pageview",
  "performance",
  "error",
  "deployment",
  "heartbeat",
  "custom",
] as const;

export type ClientTelemetryEventType = (typeof TELEMETRY_EVENT_TYPES)[number];

export interface ClientTelemetryEvent {
  id: string;
  type: ClientTelemetryEventType;
  receivedAt: number;
  occurredAt: number;
  propertyId?: string;
  url?: string;
  path?: string;
  title?: string;
  referrer?: string;
  message?: string;
  metric?: string;
  value?: number;
  release?: string;
  environment?: string;
  userAgent?: string;
}

export interface ClientTelemetrySnapshot {
  siteKey: string;
  events: ClientTelemetryEvent[];
  lastSeenAt?: number;
  connected: boolean;
}

export interface ClientTelemetrySummary {
  pageviews24h: number;
  errors24h: number;
  deployments30d: number;
  averageLoadMs?: number;
  lastSeenAt?: number;
}

export function summarizeClientTelemetry(
  events: ClientTelemetryEvent[],
  now = Date.now(),
): ClientTelemetrySummary {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recent = events.filter(event => event.occurredAt >= dayAgo);
  const loadValues = recent
    .filter(event => event.type === "performance" && event.metric === "load" && typeof event.value === "number")
    .map(event => event.value as number);

  return {
    pageviews24h: recent.filter(event => event.type === "pageview").length,
    errors24h: recent.filter(event => event.type === "error").length,
    deployments30d: events.filter(event => event.type === "deployment" && event.occurredAt >= monthAgo).length,
    averageLoadMs: loadValues.length
      ? Math.round(loadValues.reduce((sum, value) => sum + value, 0) / loadValues.length)
      : undefined,
    lastSeenAt: events[0]?.receivedAt,
  };
}
