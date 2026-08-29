import "server-only";

import crypto from "node:crypto";

import {
  TELEMETRY_EVENT_TYPES,
  type ClientTelemetrySummary,
} from "@/lib/clients/clientTelemetry";
import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type {
  AgencyWebsitePage,
  AgencyWebsiteProject,
  AgencyWebsiteReleaseStatus,
  AgencyWebsiteTelemetryEvent,
} from "@/server/types";
import { publicAquaPropertyId, publicAquaSite } from "@/lib/public/publicSites";
import type { PerformanceEvent } from "@/lib/performance/performanceAnalytics";

const MAX_EVENTS = 5_000;
const MAX_EVENTS_PER_MINUTE = 120;

function defaults(agencyId: string): AgencyWebsiteProject {
  return {
    agencyId,
    name: "Milesymedia website",
    firstParty: true,
    status: "gated",
    gateHeadline: "Website redesign in progress",
    gateMessage: "The new Milesymedia website is being prepared. The studio and client support remain open.",
    maintenanceMessage: "We are carrying out a planned update. Client support and portal access remain available.",
    productionUrl: "https://milesymedia.com",
    previewUrl: "http://localhost:3030/?preview=portal",
    repositoryUrl: "https://github.com/edstorm987/milesymedia-photography-brand",
    localPath: "/Users/eds/Desktop/Projects/Web Development/Personal EcoSystem/milesymedia/website",
    pages: [
      { route: "/", label: "Home", status: "live", updatedAt: 0 },
      { route: "/client-centre", label: "Client centre", status: "live", updatedAt: 0 },
    ],
    telemetrySiteKey: newWebsiteSiteKey(),
    telemetryEvents: [],
    updatedAt: 0,
  };
}

/**
 * Read a website snapshot without creating or upgrading persisted state.
 *
 * Absence stays absence. The old fallback returned a complete Milesymedia
 * project for every agency, which made an unconfigured workspace look as if it
 * had a live repository, domain and local checkout.
 */
export function readAgencyWebsite(agencyId: string): AgencyWebsiteProject | null {
  const existing = getState().agencyWebsites[agencyId];
  if (!existing) return null;
  const fallback = defaults(agencyId);
  return { ...fallback, ...existing, pages: existing.pages?.length ? existing.pages : fallback.pages };
}

/**
 * An agency's website record as a READ sees it — merged with the defaults, and
 * never stored.
 *
 * `readAgencyWebsite` answers null when there is no record; four rendered pages
 * wanted an object and so called `ensureAgencyWebsite`, which created one
 * (issue #21). This gives them the object without the write; the legacy-value
 * upgrade inside `ensureAgencyWebsite` still happens on the write paths.
 */
export function agencyWebsiteForRead(agencyId: string): AgencyWebsiteProject {
  return readAgencyWebsite(agencyId) ?? defaults(agencyId);
}

export function ensureAgencyWebsite(agencyId: string): AgencyWebsiteProject {
  const existing = getState().agencyWebsites[agencyId];
  if (existing) {
    const fallback = defaults(agencyId);
    const merged = { ...fallback, ...existing, pages: existing.pages?.length ? existing.pages : fallback.pages };
    const upgraded: AgencyWebsiteProject = {
      ...merged,
      productionUrl: /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(merged.productionUrl)
        ? fallback.productionUrl
        : merged.productionUrl,
      repositoryUrl: merged.repositoryUrl === "https://github.com/edstorm987/aquacrm"
        ? fallback.repositoryUrl
        : merged.repositoryUrl,
      localPath: merged.localPath === "04-milesymedia-portal/milesymedia-portal/portal/src/app/(website)"
        ? fallback.localPath
        : merged.localPath,
    };
    if (
      upgraded.productionUrl !== existing.productionUrl
      || upgraded.repositoryUrl !== existing.repositoryUrl
      || upgraded.localPath !== existing.localPath
    ) {
      mutate(state => { state.agencyWebsites[agencyId] = upgraded; });
    }
    return upgraded;
  }
  const project = defaults(agencyId);
  mutate(state => { state.agencyWebsites[agencyId] = project; });
  return project;
}

/**
 * The primary agency's website record, as a READ sees it. Writes nothing.
 *
 * Issue #21, and the sharpest of the remaining read-time writes because it is
 * the only one a STRANGER could trigger: the public website layout called
 * `ensurePrimaryAgencyWebsite()`, so a visitor loading the marketing site could
 * create the tenant's website record.
 *
 * Falls back to the in-memory defaults rather than null, so the public site
 * renders exactly as it did — the difference is that nothing is stored.
 */
export function readPrimaryAgencyWebsite(): AgencyWebsiteProject | null {
  const state = getState();
  const agency = Object.values(state.agencies).find(item => /milesy\s*media/i.test(item.name))
    ?? Object.values(state.agencies)[0];
  if (!agency) return null;
  return readAgencyWebsite(agency.id) ?? defaults(agency.id);
}

export function ensurePrimaryAgencyWebsite(): AgencyWebsiteProject | null {
  const state = getState();
  const agency = Object.values(state.agencies).find(item => /milesy\s*media/i.test(item.name))
    ?? Object.values(state.agencies)[0];
  return agency ? ensureAgencyWebsite(agency.id) : null;
}

export function updateAgencyWebsite(
  agencyId: string,
  input: Partial<Pick<AgencyWebsiteProject,
    "status" | "gateHeadline" | "gateMessage" | "maintenanceMessage" |
    "productionUrl" | "previewUrl" | "repositoryUrl" | "localPath">>,
  actorUserId: string,
): AgencyWebsiteProject {
  const current = ensureAgencyWebsite(agencyId);
  const updated: AgencyWebsiteProject = {
    ...current,
    status: cleanStatus(input.status ?? current.status),
    gateHeadline: cleanText(input.gateHeadline ?? current.gateHeadline, 160) || current.gateHeadline,
    gateMessage: cleanText(input.gateMessage ?? current.gateMessage, 1_000) || current.gateMessage,
    maintenanceMessage: cleanText(input.maintenanceMessage ?? current.maintenanceMessage, 1_000) || current.maintenanceMessage,
    productionUrl: cleanUrl(input.productionUrl) ?? current.productionUrl,
    previewUrl: cleanUrl(input.previewUrl) ?? current.previewUrl,
    repositoryUrl: cleanUrl(input.repositoryUrl) ?? current.repositoryUrl,
    localPath: cleanText(input.localPath ?? current.localPath, 1_000) || current.localPath,
    updatedBy: actorUserId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.agencyWebsites[agencyId] = updated; });
  logActivity({
    agencyId,
    actorUserId,
    category: "system",
    action: "website.release_updated",
    message: `Milesymedia website set to ${updated.status}.`,
  });
  return updated;
}

export function updateAgencyWebsitePage(
  agencyId: string,
  route: string,
  patch: Partial<Pick<AgencyWebsitePage, "status" | "message">>,
  actorUserId: string,
): AgencyWebsiteProject | null {
  const current = ensureAgencyWebsite(agencyId);
  const cleanRoute = normalizeRoute(route);
  const page = current.pages.find(item => item.route === cleanRoute);
  if (!page) return null;
  const pages = current.pages.map(item => item.route === cleanRoute ? {
    ...item,
    status: patch.status === "updating" ? "updating" as const : "live" as const,
    message: cleanText(patch.message, 500),
    updatedAt: Date.now(),
  } : item);
  const updated = { ...current, pages, updatedBy: actorUserId, updatedAt: Date.now() };
  mutate(state => { state.agencyWebsites[agencyId] = updated; });
  logActivity({
    agencyId,
    actorUserId,
    category: "system",
    action: "website.page_status_updated",
    message: `${page.label} set to ${pages.find(item => item.route === cleanRoute)?.status}.`,
    metadata: { route: cleanRoute },
  });
  return updated;
}

export function resetAgencyWebsiteTelemetryKey(agencyId: string, actorUserId: string): AgencyWebsiteProject {
  const current = ensureAgencyWebsite(agencyId);
  const updated = { ...current, telemetrySiteKey: newWebsiteSiteKey(), updatedBy: actorUserId, updatedAt: Date.now() };
  mutate(state => { state.agencyWebsites[agencyId] = updated; });
  return updated;
}

export function clearAgencyWebsiteTelemetry(agencyId: string, actorUserId: string): AgencyWebsiteProject {
  const current = ensureAgencyWebsite(agencyId);
  const updated = {
    ...current,
    telemetryEvents: [],
    telemetryLastSeenAt: undefined,
    updatedBy: actorUserId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.agencyWebsites[agencyId] = updated; });
  return updated;
}

export function recordAgencyWebsiteTelemetry(
  siteKey: string,
  input: Record<string, unknown>,
  userAgent?: string,
): { status: "recorded"; agencyId: string; event: AgencyWebsiteTelemetryEvent } | { status: "rate-limited" } | null {
  const publicSite = publicAquaSite(siteKey);
  const project = publicSite
    ? ensurePrimaryAgencyWebsite()
    : Object.values(getState().agencyWebsites).find(item => item.telemetrySiteKey === siteKey);
  if (!project) return null;
  const minuteAgo = Date.now() - 60_000;
  const propertyId = publicSite
    ? publicAquaPropertyId(siteKey, input.propertyId) ?? undefined
    : cleanText(input.propertyId, 120);
  if (project.telemetryEvents.filter(event => event.receivedAt >= minuteAgo && (!propertyId || event.propertyId === propertyId)).length >= MAX_EVENTS_PER_MINUTE) {
    return { status: "rate-limited" };
  }
  const now = Date.now();
  const requestedType = cleanText(input.type, 32);
  const type = TELEMETRY_EVENT_TYPES.includes(requestedType as AgencyWebsiteTelemetryEvent["type"])
    ? requestedType as AgencyWebsiteTelemetryEvent["type"]
    : "custom";
  const requestedAt = cleanNumber(input.occurredAt);
  const event: AgencyWebsiteTelemetryEvent = {
    id: `web_evt_${crypto.randomBytes(10).toString("hex")}`,
    type,
    receivedAt: now,
    occurredAt: requestedAt && Math.abs(now - requestedAt) < 7 * 24 * 60 * 60 * 1_000 ? requestedAt : now,
    propertyId,
    url: cleanUrl(input.url),
    path: cleanText(input.path, 1_024),
    title: cleanText(input.title, 240),
    referrer: cleanUrl(input.referrer),
    message: cleanText(input.message, 2_000),
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
  mutate(state => {
    const stored = state.agencyWebsites[project.agencyId];
    if (!stored || (!publicSite && stored.telemetrySiteKey !== siteKey)) return;
    stored.telemetryEvents = [event, ...stored.telemetryEvents].slice(0, MAX_EVENTS);
    stored.telemetryLastSeenAt = now;
    stored.updatedAt = now;
  });
  if (["error", "deployment", "form", "conversion", "search", "chatbot", "interaction", "custom"].includes(event.type)) {
    logActivity({
      agencyId: project.agencyId,
      category: event.type === "error" ? "support" : event.type === "deployment" ? "fulfillment" : "marketing",
      action: `website.${event.type}`,
      message: `${publicSite?.brand ?? project.name} recorded a ${event.type === "form" ? "form submission" : event.type}.`,
      metadata: {
        telemetryEventId: event.id,
        path: event.path,
        formName: event.formName,
        experimentId: event.experimentId,
        variant: event.variant,
      },
    });
  }
  return { status: "recorded", agencyId: project.agencyId, event };
}

export function summarizeAgencyWebsite(project: AgencyWebsiteProject): ClientTelemetrySummary {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1_000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1_000;
  const recent = project.telemetryEvents.filter(event => event.occurredAt >= dayAgo);
  const loads = recent.filter(event => event.type === "performance" && event.metric === "load" && typeof event.value === "number");
  return {
    pageviews24h: recent.filter(event => event.type === "pageview").length,
    errors24h: recent.filter(event => event.type === "error").length,
    deployments30d: project.telemetryEvents.filter(event => event.type === "deployment" && event.occurredAt >= monthAgo).length,
    averageLoadMs: loads.length ? Math.round(loads.reduce((sum, event) => sum + (event.value ?? 0), 0) / loads.length) : undefined,
    lastSeenAt: project.telemetryLastSeenAt,
  };
}

export function replaceAgencyWebsiteSearchEvents(
  agencyId: string,
  connectionId: string,
  events: PerformanceEvent[],
  actorUserId: string,
): AgencyWebsiteProject {
  const current = ensureAgencyWebsite(agencyId);
  const metric = `search-console:${connectionId}`;
  const imported: AgencyWebsiteTelemetryEvent[] = events.map((event, index) => ({
    id: `gsc_${crypto.randomBytes(8).toString("hex")}_${index}`,
    type: "search",
    receivedAt: Date.now(),
    occurredAt: event.occurredAt,
    propertyId: event.propertyId,
    path: event.path,
    query: event.query,
    impressions: event.impressions,
    clicks: event.clicks,
    position: event.position,
    metric,
  }));
  const retained = current.telemetryEvents.filter(event => event.metric !== metric);
  const updated: AgencyWebsiteProject = {
    ...current,
    telemetryEvents: [...imported, ...retained].slice(0, MAX_EVENTS),
    updatedBy: actorUserId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.agencyWebsites[agencyId] = updated; });
  return updated;
}

export function websitePageIsUpdating(project: AgencyWebsiteProject | null, route: string): AgencyWebsitePage | null {
  return project?.pages.find(page => page.route === normalizeRoute(route) && page.status === "updating") ?? null;
}

function newWebsiteSiteKey(): string {
  return `aqua_own_${crypto.randomBytes(24).toString("base64url")}`;
}

function cleanStatus(value: unknown): AgencyWebsiteReleaseStatus {
  return value === "live" || value === "maintenance" ? value : "gated";
}

function normalizeRoute(value: string): string {
  const route = `/${value.trim().replace(/^\/+|\/+$/g, "")}`;
  return route === "/" ? "/" : route;
}

function cleanText(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(-1_000_000_000, Math.min(1_000_000_000, value))
    : undefined;
}

function cleanBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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
