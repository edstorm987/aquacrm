import "server-only";

import type { BusinessRadarIssue } from "@/lib/businessRadar";
import type { ClientTelemetryEvent } from "@/lib/clientTelemetry";
import type { AgencyWebsiteProject, AgencyWebsiteTelemetryEvent, Client, RadarSyntheticProbeResult } from "@/server/types";

const DAY = 86_400_000;

type TelemetryEvent = ClientTelemetryEvent | AgencyWebsiteTelemetryEvent;

interface StoredProperty {
  id?: string;
  label?: string;
  kind?: string;
  status?: string;
  liveUrl?: string;
  previewUrl?: string;
  tagStatus?: string;
  lastSeenAt?: number;
}

export interface RadarTelemetryProperty {
  id: string;
  label: string;
  clientId?: string;
  clientName?: string;
  href: string;
  publicUrl?: string;
  expectedLive: boolean;
  tagDeclared: boolean;
  lastSeenAt?: number;
  current7d: number;
  previous7d: number;
  pageviews24h: number;
  forms24h: number;
  forms7d: number;
  conversions7d: number;
  errors24h: number;
  heartbeats24h: number;
  averageLoadMs?: number;
  searchImpressions28d: number;
  searchClicks28d: number;
  syntheticProbe?: RadarSyntheticProbeResult;
  events: TelemetryEvent[];
}

export interface RadarTelemetrySnapshot {
  properties: RadarTelemetryProperty[];
  issues: BusinessRadarIssue[];
  totals: {
    properties: number;
    expectedProperties: number;
    connectedTags: number;
    staleTags: number;
    pageviews24h: number;
    pageviews7d: number;
    previousPageviews7d: number;
    forms24h: number;
    forms7d: number;
    conversions7d: number;
    errors24h: number;
    heartbeats24h: number;
    trafficSurges: number;
    trafficDrops: number;
    slowProperties: number;
    searchImpressions28d: number;
    searchClicks28d: number;
    averageLoadMs?: number;
    latestEventAt?: number;
  };
}

export function buildRadarTelemetrySnapshot(
  agencyWebsite: AgencyWebsiteProject | undefined,
  clients: Client[],
  syntheticProbes: Record<string, RadarSyntheticProbeResult> = {},
  now = Date.now(),
): RadarTelemetrySnapshot {
  const properties: RadarTelemetryProperty[] = [];
  if (agencyWebsite) {
    properties.push(propertySnapshot({
      id: "agency-website",
      label: agencyWebsite.name,
      href: "/portal/agency/fulfilment/technical/website",
      publicUrl: agencyWebsite.productionUrl,
      expectedLive: agencyWebsite.status === "live" || Boolean(clean(agencyWebsite.productionUrl)),
      tagDeclared: Boolean(agencyWebsite.telemetrySiteKey),
      events: agencyWebsite.telemetryEvents,
      declaredLastSeenAt: agencyWebsite.telemetryLastSeenAt,
      syntheticProbe: syntheticProbes["agency-website"],
      now,
    }));
  }

  for (const client of clients.filter(item => item.status === "active")) {
    const metadata = client.metadata ?? {};
    const events = Array.isArray(metadata.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : [];
    const storedProperties = Array.isArray(metadata.properties) ? metadata.properties as StoredProperty[] : [];
    const clientProperties = storedProperties.length
      ? storedProperties
      : client.websiteUrl || events.length
        ? [{ id: `client-${client.id}`, label: client.name, kind: "website", status: "live", liveUrl: client.websiteUrl }]
        : [];
    for (const [index, property] of clientProperties.entries()) {
      const propertyId = clean(property.id) || `client-${client.id}-${index + 1}`;
      const propertyEvents = events.filter(event => eventMatchesProperty(event, propertyId, property));
      properties.push(propertySnapshot({
        id: `${client.id}:${propertyId}`,
        label: clean(property.label) || `${client.name} ${clean(property.kind) || "property"}`,
        clientId: client.id,
        clientName: client.name,
        href: `/portal/clients/${client.id}?tab=systems`,
        publicUrl: clean(property.liveUrl) || clean(client.websiteUrl) || undefined,
        expectedLive: ["live", "active", "production", "published"].includes(clean(property.status).toLowerCase()) || Boolean(property.liveUrl),
        tagDeclared: property.tagStatus === "installed" || Boolean(property.lastSeenAt) || propertyEvents.length > 0,
        events: propertyEvents,
        declaredLastSeenAt: numeric(property.lastSeenAt),
        syntheticProbe: syntheticProbes[`${client.id}:${propertyId}`],
        now,
      }));
    }
  }

  const issues = properties.flatMap(property => issuesForProperty(property, now));
  const loads = properties.flatMap(property => property.averageLoadMs === undefined ? [] : [property.averageLoadMs]);
  const latestEventAt = newest(properties.map(property => property.lastSeenAt));
  return {
    properties,
    issues,
    totals: {
      properties: properties.length,
      expectedProperties: properties.filter(property => property.expectedLive).length,
      connectedTags: properties.filter(property => property.lastSeenAt).length,
      staleTags: properties.filter(property => property.expectedLive && property.lastSeenAt && now - property.lastSeenAt > 2 * DAY).length,
      pageviews24h: sum(properties.map(property => property.pageviews24h)),
      pageviews7d: sum(properties.map(property => property.current7d)),
      previousPageviews7d: sum(properties.map(property => property.previous7d)),
      forms24h: sum(properties.map(property => property.forms24h)),
      forms7d: sum(properties.map(property => property.forms7d)),
      conversions7d: sum(properties.map(property => property.conversions7d)),
      errors24h: sum(properties.map(property => property.errors24h)),
      heartbeats24h: sum(properties.map(property => property.heartbeats24h)),
      trafficSurges: properties.filter(isTrafficSurge).length,
      trafficDrops: properties.filter(isTrafficDrop).length,
      slowProperties: properties.filter(property => (property.averageLoadMs ?? 0) > 2_500).length,
      searchImpressions28d: sum(properties.map(property => property.searchImpressions28d)),
      searchClicks28d: sum(properties.map(property => property.searchClicks28d)),
      averageLoadMs: loads.length ? Math.round(sum(loads) / loads.length) : undefined,
      latestEventAt,
    },
  };
}

function propertySnapshot(input: {
  id: string;
  label: string;
  clientId?: string;
  clientName?: string;
  href: string;
  publicUrl?: string;
  expectedLive: boolean;
  tagDeclared: boolean;
  events: TelemetryEvent[];
  declaredLastSeenAt?: number;
  syntheticProbe?: RadarSyntheticProbeResult;
  now: number;
}): RadarTelemetryProperty {
  const currentStart = input.now - 7 * DAY;
  const previousStart = input.now - 14 * DAY;
  const dayStart = input.now - DAY;
  const searchStart = input.now - 28 * DAY;
  const pageviews = input.events.filter(event => event.type === "pageview");
  const loads = input.events
    .filter(event => event.type === "performance" && event.metric === "load" && event.occurredAt >= dayStart && typeof event.value === "number")
    .map(event => event.value as number);
  const lastSeenAt = Math.max(input.declaredLastSeenAt ?? 0, newest(input.events.map(event => event.receivedAt || event.occurredAt)) ?? 0) || undefined;
  return {
    id: input.id,
    label: input.label,
    clientId: input.clientId,
    clientName: input.clientName,
    href: input.href,
    publicUrl: input.publicUrl,
    expectedLive: input.expectedLive,
    tagDeclared: input.tagDeclared,
    lastSeenAt,
    current7d: pageviews.filter(event => event.occurredAt >= currentStart).length,
    previous7d: pageviews.filter(event => event.occurredAt >= previousStart && event.occurredAt < currentStart).length,
    pageviews24h: pageviews.filter(event => event.occurredAt >= dayStart).length,
    forms24h: input.events.filter(event => event.type === "form" && event.occurredAt >= dayStart).length,
    forms7d: input.events.filter(event => event.type === "form" && event.occurredAt >= currentStart).length,
    conversions7d: input.events.filter(event => isConversion(event) && event.occurredAt >= currentStart).length,
    errors24h: input.events.filter(event => event.type === "error" && event.occurredAt >= dayStart).length,
    heartbeats24h: input.events.filter(event => event.type === "heartbeat" && event.occurredAt >= dayStart).length,
    averageLoadMs: loads.length ? Math.round(sum(loads) / loads.length) : undefined,
    searchImpressions28d: input.events.filter(event => event.type === "search" && event.occurredAt >= searchStart).reduce((total, event) => total + (event.impressions ?? 0), 0),
    searchClicks28d: input.events.filter(event => event.type === "search" && event.occurredAt >= searchStart).reduce((total, event) => total + (event.clicks ?? 0), 0),
    syntheticProbe: input.syntheticProbe,
    events: input.events,
  };
}

function issuesForProperty(property: RadarTelemetryProperty, now: number): BusinessRadarIssue[] {
  const issues: BusinessRadarIssue[] = [];
  if (property.expectedLive && !property.lastSeenAt) {
    issues.push(issue(property, "watch", "development", `Aqua Tag has never reported for ${property.label}`, "This live property has no telemetry event. Installation, consent, deployment, or property mapping may be incomplete.", ["No event timestamp", `Tag declared: ${property.tagDeclared ? "yes" : "no"}`], now));
  } else if (property.expectedLive && property.lastSeenAt && now - property.lastSeenAt > 2 * DAY) {
    const ageDays = Math.floor((now - property.lastSeenAt) / DAY);
    issues.push(issue(property, ageDays >= 7 ? "critical" : "warning", "development", `${property.label} monitoring has gone quiet`, `No telemetry has arrived for ${ageDays} days. Check the Aqua Tag, consent state, production release, and server availability.`, [`Last event ${new Date(property.lastSeenAt).toISOString()}`, `${property.events.length} retained events`], property.lastSeenAt));
  }
  if (property.errors24h) {
    const latest = property.events.filter(event => event.type === "error").sort((left, right) => right.occurredAt - left.occurredAt)[0];
    issues.push(issue(property, property.errors24h >= 5 ? "critical" : "warning", "development", `${property.label} recorded ${property.errors24h} production error${property.errors24h === 1 ? "" : "s"}`, clean(latest?.message) || clean(latest?.path) || "Inspect the latest runtime event and affected release.", [`Errors in 24h ${property.errors24h}`, latest?.release ? `Release ${latest.release}` : "Release not tagged"], latest?.occurredAt ?? now));
  }
  if ((property.averageLoadMs ?? 0) > 2_500) {
    issues.push(issue(property, (property.averageLoadMs ?? 0) > 5_000 ? "critical" : "warning", "development", `${property.label} is loading slowly`, `Average reported page load is ${property.averageLoadMs}ms against the 2500ms radar guardrail.`, [`Average load ${property.averageLoadMs}ms`, "Guardrail 2500ms"], property.lastSeenAt ?? now));
  }
  if (isTrafficDrop(property)) {
    const change = trafficChange(property);
    issues.push(issue(property, property.current7d === 0 && property.previous7d >= 10 ? "critical" : "warning", "marketing", `${property.label} traffic ${property.current7d === 0 ? "has stopped" : "has dropped sharply"}`, `${property.current7d} pageviews arrived in the last 7 days versus ${property.previous7d} in the preceding period.`, [`Traffic change ${change.toFixed(1)}%`, `Current ${property.current7d}`, `Previous ${property.previous7d}`], property.lastSeenAt ?? now));
  } else if (isTrafficSurge(property)) {
    issues.push(issue(property, "watch", "marketing", `${property.label} traffic is surging`, `${property.current7d} pageviews arrived in the last 7 days versus ${property.previous7d} previously. Check source quality and conversion readiness while attention is high.`, [`Traffic change +${trafficChange(property).toFixed(1)}%`, `Forms in 7d ${property.forms7d}`], property.lastSeenAt ?? now));
  }
  if (property.current7d >= 20 && property.forms7d === 0 && property.conversions7d === 0) {
    issues.push(issue(property, "warning", "marketing", `${property.label} has traffic but no tracked conversions`, `${property.current7d} pageviews were recorded in 7 days without a form or conversion event. Check the offer, form flow, conversion tag, and call to action.`, [`Pageviews ${property.current7d}`, "Forms 0", "Conversions 0"], property.lastSeenAt ?? now));
  }
  const recentForms = property.events.filter(event => event.type === "form" && event.occurredAt >= now - DAY).slice(0, 12);
  for (const form of recentForms) {
    issues.push({
      id: `telemetry:form:${form.id}`,
      severity: "watch",
      domain: "marketing",
      title: `${property.label} received ${clean(form.formName) || "a form submission"}`,
      detail: `${clean(form.path) || "/"} submitted at ${new Date(form.occurredAt).toLocaleString("en-GB")}. Confirm attribution, lead linkage, notification delivery, and response ownership.`,
      evidence: [form.sessionId ? `Session ${form.sessionId}` : "Session not recorded", form.referrer ? `Referrer ${form.referrer}` : "Direct or unknown referrer"],
      href: property.href,
      detectedAt: form.occurredAt,
      sourceIds: [`telemetry:${form.id}`, property.id],
    });
  }
  return issues;
}

function issue(property: RadarTelemetryProperty, severity: BusinessRadarIssue["severity"], domain: BusinessRadarIssue["domain"], title: string, detail: string, evidence: string[], detectedAt: number): BusinessRadarIssue {
  return {
    id: `telemetry:${property.id}:${slug(title)}`,
    severity,
    domain,
    title,
    detail,
    evidence,
    href: property.href,
    detectedAt,
    sourceIds: [property.id],
  };
}

function eventMatchesProperty(event: TelemetryEvent, propertyId: string, property: StoredProperty): boolean {
  if (event.propertyId === propertyId) return true;
  if (!event.propertyId && !property.liveUrl && !property.previewUrl) return true;
  const host = safeHost(event.url);
  return Boolean(host && [property.liveUrl, property.previewUrl].some(url => safeHost(url) === host));
}

function isConversion(event: TelemetryEvent): boolean {
  return event.type === "conversion" || event.type === "form" || (event.type === "interaction" && event.metric === "conversion");
}

function isTrafficDrop(property: RadarTelemetryProperty): boolean {
  return property.previous7d >= 5 && property.current7d <= property.previous7d * 0.5;
}

function isTrafficSurge(property: RadarTelemetryProperty): boolean {
  return property.current7d >= 20 && property.current7d >= Math.max(1, property.previous7d) * 2;
}

function trafficChange(property: RadarTelemetryProperty): number {
  if (!property.previous7d) return property.current7d ? 100 : 0;
  return (property.current7d - property.previous7d) / property.previous7d * 100;
}

function safeHost(value?: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).host.toLowerCase(); } catch { return undefined; }
}

function newest(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && value > 0);
  return valid.length ? Math.max(...valid) : undefined;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
