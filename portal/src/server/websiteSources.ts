import "server-only";

import crypto from "node:crypto";
import { getState, mutate } from "./storage";
import { getClientForAgency } from "./tenants";
import { getTradingCompany } from "./tradingCompanies";
import { newTelemetrySiteKey } from "@/lib/server/clients/clientTelemetryService";
import type { WebsiteSourceDestination } from "./types";

/**
 * Where a tagged website's submissions go.
 *
 * The Aqua Tag sits on many sites — Ed's own companies and his clients'. Until
 * now every submission landed in the agency inbox, because routing was a
 * hardcoded brand list. This registry replaces that with a decision Ed makes:
 * each site (by its domain) either feeds the agency inbox or a specific
 * client's. That is the whole point of tagging a client's site — their
 * enquiries should reach them, not pile up in the agency's queue.
 *
 * Keyed by host, not by the brand slug, because the host is what a submission
 * actually arrives carrying and what Ed actually thinks in ("cedar-dental.com
 * goes to Cedar"). A missing entry means the old behaviour — the agency inbox
 * — so nothing breaks for a site not yet registered.
 */

export interface WebsiteSource {
  id: string;
  agencyId: string;
  /** Normalised domain, e.g. "cedar-dental.com". The routing key. */
  host: string;
  label: string;
  /**
   * Where this host's submissions go. Both absent → the agency inbox.
   * `destinationClientId` → that client's inbox; `destinationCompanyId` → one of
   * Ed's own trading companies. Mutually exclusive — a site has one home, kept
   * that way by the mutators below.
   */
  destinationClientId?: string;
  destinationCompanyId?: string;
  createdAt: number;
  createdBy: string;
}

/**
 * A domain, reduced to the form two submissions from the same site share.
 *
 * Strips the protocol, any path, a leading `www.`, and the case — so
 * `https://www.Cedar-Dental.com/contact` and `cedar-dental.com` are one site.
 * Left deliberately simple: no public-suffix cleverness, because a subdomain
 * (`book.cedar-dental.com`) is often a genuinely different destination and
 * should be registered on its own rather than silently merged.
 */
export function normalizeHost(input: string): string {
  let value = (input ?? "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z]+:\/\//, "");   // protocol
  value = value.split("/")[0] ?? value;         // path
  value = value.split("?")[0] ?? value;         // stray query
  value = value.split("@").pop() ?? value;       // any credentials
  value = value.split(":")[0] ?? value;         // port
  value = value.replace(/^www\./, "");
  return value.trim();
}

function sources(agencyId: string): WebsiteSource[] {
  return Object.values(getState().websiteSources ?? {}).filter(source => source.agencyId === agencyId);
}

export function listWebsiteSources(agencyId: string): WebsiteSource[] {
  return sources(agencyId).sort((a, b) => a.host.localeCompare(b.host));
}

/** A single source by id, scoped to the agency — for callers that key off a site. */
export function getWebsiteSource(agencyId: string, id: string): WebsiteSource | null {
  const source = getState().websiteSources?.[id];
  return source && source.agencyId === agencyId ? source : null;
}

/**
 * Where a submission from this host belongs — the agency inbox, a specific
 * client, or one of Ed's own trading companies.
 *
 * A missing entry, or one with no destination set, is the agency inbox — the
 * old behaviour, so nothing breaks for a site not yet registered. A company
 * destination is preferred over a client one if both were somehow stored, but
 * the mutators keep them mutually exclusive so that never happens in practice.
 */
export function resolveWebsiteSourceRouting(agencyId: string, host: string | undefined): WebsiteSourceDestination {
  const normalized = normalizeHost(host ?? "");
  if (!normalized) return { kind: "inbox" };
  const match = sources(agencyId).find(source => source.host === normalized);
  if (!match) return { kind: "inbox" };
  if (match.destinationCompanyId) return { kind: "company", companyId: match.destinationCompanyId };
  if (match.destinationClientId) return { kind: "client", clientId: match.destinationClientId };
  return { kind: "inbox" };
}

export function addWebsiteSource(input: {
  agencyId: string;
  host: string;
  label?: string;
  destinationClientId?: string;
  destinationCompanyId?: string;
  createdBy: string;
}): WebsiteSource {
  const host = normalizeHost(input.host);
  if (!host) throw new Error("Enter the website's address so submissions can be matched to it.");
  // A site has one home: a client, or a company, or the agency inbox — never two
  // at once. Reject a contradictory request rather than silently picking one.
  if (input.destinationClientId && input.destinationCompanyId) {
    throw new Error("A site routes to a client or a company, not both.");
  }
  // A destination must belong to this agency — never routed somewhere the
  // caller cannot see.
  if (input.destinationClientId && !getClientForAgency(input.agencyId, input.destinationClientId)) {
    throw new Error("That client was not found.");
  }
  if (input.destinationCompanyId && !getTradingCompany(input.agencyId, input.destinationCompanyId)) {
    throw new Error("That company was not found.");
  }
  if (sources(input.agencyId).some(source => source.host === host)) {
    throw new Error(`${host} is already routed. Edit it instead of adding it twice.`);
  }
  const source: WebsiteSource = {
    id: `wsrc_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    host,
    label: (input.label ?? "").trim().slice(0, 120) || host,
    destinationClientId: input.destinationClientId,
    destinationCompanyId: input.destinationCompanyId,
    createdAt: Date.now(),
    createdBy: input.createdBy,
  };
  mutate(state => {
    state.websiteSources ??= {};
    state.websiteSources[source.id] = source;
  });
  return source;
}

export function updateWebsiteSourceRouting(input: {
  agencyId: string;
  id: string;
  destinationClientId?: string;
  destinationCompanyId?: string;
  label?: string;
}): WebsiteSource | null {
  const stored = getState().websiteSources?.[input.id];
  if (!stored || stored.agencyId !== input.agencyId) return null;
  if (input.destinationClientId && input.destinationCompanyId) {
    throw new Error("A site routes to a client or a company, not both.");
  }
  if (input.destinationClientId && !getClientForAgency(input.agencyId, input.destinationClientId)) {
    throw new Error("That client was not found.");
  }
  if (input.destinationCompanyId && !getTradingCompany(input.agencyId, input.destinationCompanyId)) {
    throw new Error("That company was not found.");
  }
  let saved: WebsiteSource | null = null;
  mutate(state => {
    const source = state.websiteSources?.[input.id];
    if (!source) return;
    // A site has one home. Setting one destination clears the other; sending
    // neither points it back at the agency inbox.
    source.destinationClientId = input.destinationClientId || undefined;
    source.destinationCompanyId = input.destinationCompanyId || undefined;
    if (typeof input.label === "string" && input.label.trim()) source.label = input.label.trim().slice(0, 120);
    saved = source;
  });
  return saved;
}

/**
 * The agency's master tag key — the owner's tag for their own websites.
 *
 * One per agency, generated the first time it is asked for and kept forever
 * after (the tag lives in people's site HTML; rotating it would silently break
 * every install). Installed on any of Ed's own sites, it pours submissions
 * into his inbox — "absorbing it all". A site whose host is registered to a
 * client still overrides to that client; the master key is the default, not a
 * bypass.
 */
export function ensureAgencyMasterSiteKey(agencyId: string): string {
  const existing = getState().agencyMasterTagKeys?.[agencyId];
  if (existing) return existing;
  const key = newTelemetrySiteKey();
  mutate(state => {
    state.agencyMasterTagKeys ??= {};
    state.agencyMasterTagKeys[agencyId] ??= key;
  });
  return getState().agencyMasterTagKeys![agencyId]!;
}

/** Which agency a master tag key belongs to, for the ingestion path. */
export function resolveAgencyByMasterSiteKey(siteKey: string | undefined): string | undefined {
  if (!siteKey) return undefined;
  const map = getState().agencyMasterTagKeys ?? {};
  return Object.keys(map).find(agencyId => map[agencyId] === siteKey);
}

/** The one-line snippet to paste into a site's HTML. */
export function masterTagSnippet(origin: string, siteKey: string): string {
  return `<script src="${origin.replace(/\/+$/, "")}/aqua-tag.js" data-site-key="${siteKey}" defer></script>`;
}

export function removeWebsiteSource(agencyId: string, id: string): boolean {
  const stored = getState().websiteSources?.[id];
  if (!stored || stored.agencyId !== agencyId) return false;
  mutate(state => {
    delete state.websiteSources![id];
    // A removed site takes its per-site config (injections, form schemas) with
    // it — never orphan config keyed to a source that no longer exists.
    if (state.websiteSiteConfigs) delete state.websiteSiteConfigs[id];
  });
  return true;
}
