import {
  checkedJsonMutation,
  mutationErrorMessage,
} from "@/lib/client/checkedMutation";

export interface WebsiteSourceRegistrySource {
  id: string;
  host: string;
  label: string;
  destinationClientId?: string;
  destinationCompanyId?: string;
}

export interface WebsiteSourceRegistryClient {
  id: string;
  name: string;
}

export interface WebsiteSourceRegistryCompany {
  id: string;
  name: string;
  website?: string;
}

export interface WebsiteSourceRegistryPayload {
  ok: true;
  sources: WebsiteSourceRegistrySource[];
  clients: WebsiteSourceRegistryClient[];
  companies: WebsiteSourceRegistryCompany[];
  formSchemasBySource: Record<string, unknown>;
}

export type WebsiteSourceRegistryRead =
  | { available: true; data: WebsiteSourceRegistryPayload }
  | { available: false; message: string };

export type WebsiteSourceRegistryReadState = "loading" | "ready" | "unavailable";

type RegistryFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function validSource(value: unknown): value is WebsiteSourceRegistrySource {
  const item = record(value);
  return Boolean(
    item &&
    typeof item.id === "string" &&
    typeof item.host === "string" &&
    typeof item.label === "string" &&
    optionalString(item.destinationClientId) &&
    optionalString(item.destinationCompanyId),
  );
}

function validNamedOption(value: unknown): value is WebsiteSourceRegistryClient {
  const item = record(value);
  return Boolean(item && typeof item.id === "string" && typeof item.name === "string");
}

function validCompany(value: unknown): value is WebsiteSourceRegistryCompany {
  const item = record(value);
  return Boolean(
    item &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    optionalString(item.website),
  );
}

export function isWebsiteSourceRegistryPayload(value: unknown): value is WebsiteSourceRegistryPayload {
  const payload = record(value);
  return Boolean(
    payload &&
    payload.ok === true &&
    Array.isArray(payload.sources) &&
    payload.sources.every(validSource) &&
    Array.isArray(payload.clients) &&
    payload.clients.every(validNamedOption) &&
    Array.isArray(payload.companies) &&
    payload.companies.every(validCompany) &&
    record(payload.formSchemasBySource),
  );
}

/**
 * Read the complete routing registry contract. A partial/malformed payload is
 * unavailable, never a confirmed empty list. Both registry panels share this
 * boundary so the agency and per-client views cannot disagree about success.
 */
export async function readWebsiteSourceRegistry(options: {
  signal?: AbortSignal;
  fetcher?: RegistryFetcher;
} = {}): Promise<WebsiteSourceRegistryRead> {
  const fallback = "Website routing could not be loaded.";
  try {
    const data = await checkedJsonMutation<WebsiteSourceRegistryPayload>(
      "/api/portal/website-sources",
      { method: "GET", cache: "no-store", signal: options.signal },
      {
        fallback,
        fetcher: options.fetcher,
        validate: isWebsiteSourceRegistryPayload,
      },
    );
    return { available: true, data };
  } catch (error) {
    return { available: false, message: mutationErrorMessage(error, fallback) };
  }
}

/**
 * The mounted panels may retain a last-confirmed snapshot, but only a current
 * successful read authorises writes or an ordinary empty-state claim.
 */
export function websiteSourceRegistryPresentation(
  state: WebsiteSourceRegistryReadState,
  hasConfirmedSnapshot: boolean,
  rowCount: number,
) {
  return {
    canMutate: state === "ready",
    showLoading: state === "loading",
    showUnavailable: state === "unavailable",
    showEmpty: state === "ready" && hasConfirmedSnapshot && rowCount === 0,
    showRows: hasConfirmedSnapshot && rowCount > 0,
    retainedSnapshotIsStale: state === "unavailable" && hasConfirmedSnapshot,
  };
}

// ─── Source mutations ─────────────────────────────────────────────────────────
//
// The two mounted routing panels and the inbox's website-sources panel share
// these so "route back to the agency inbox" and "permanently remove" cannot
// disagree about what a success is. Every call goes through the checked
// mutation contract: transport failure, unreadable JSON, non-2xx, `{ok:false}`
// and an incomplete or wrong-source receipt all reject, and the panel keeps
// what it was showing. → issues #85

export const WEBSITE_SOURCE_ROUTE_FALLBACK = "That site could not be routed back to the agency inbox.";
export const WEBSITE_SOURCE_UPDATE_FALLBACK = "That change could not be saved.";
export const WEBSITE_SOURCE_REMOVE_FALLBACK = "That could not be removed.";

export interface WebsiteSourceRouteReceipt {
  ok: true;
  source: WebsiteSourceRegistrySource;
}

export interface WebsiteSourceRemoveReceipt {
  ok: true;
  removed: { id: string; host: string };
}

export interface WebsiteSourceRouting {
  destinationClientId?: string;
  destinationCompanyId?: string;
}

/**
 * A routing receipt must describe the source that was asked about, and must
 * show the destination that was asked for — an `ok:true` naming another row
 * or a different home is not a success for this click.
 */
export function isWebsiteSourceRouteReceipt(
  value: unknown,
  expected: { sourceId: string; routing: WebsiteSourceRouting },
): value is WebsiteSourceRouteReceipt {
  const payload = record(value);
  if (!payload || payload.ok !== true || !validSource(payload.source)) return false;
  const source = payload.source;
  return source.id === expected.sourceId
    && (source.destinationClientId ?? undefined) === (expected.routing.destinationClientId || undefined)
    && (source.destinationCompanyId ?? undefined) === (expected.routing.destinationCompanyId || undefined);
}

export function isWebsiteSourceRemoveReceipt(
  value: unknown,
  expected: { sourceId: string },
): value is WebsiteSourceRemoveReceipt {
  const payload = record(value);
  const removed = payload && payload.ok === true ? record(payload.removed) : null;
  return Boolean(removed && removed.id === expected.sourceId && typeof removed.host === "string");
}

async function postWebsiteSourceMutation<T>(
  body: Record<string, unknown>,
  options: { fallback: string; validate: (payload: T) => boolean; fetcher?: RegistryFetcher; signal?: AbortSignal },
): Promise<T> {
  return checkedJsonMutation<T>(
    "/api/portal/website-sources",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    },
    { fallback: options.fallback, validate: options.validate, fetcher: options.fetcher },
  );
}

/**
 * Point a registered site back at the agency inbox. The registration, its
 * tool injections and imported form schemas all remain — only where NEW
 * enquiries go changes. Resolves with the confirmed source.
 */
export async function routeWebsiteSourceToInbox(
  sourceId: string,
  options: { fetcher?: RegistryFetcher; signal?: AbortSignal } = {},
): Promise<WebsiteSourceRegistrySource> {
  const receipt = await postWebsiteSourceMutation<WebsiteSourceRouteReceipt>(
    { action: "route-to-inbox", id: sourceId },
    {
      fallback: WEBSITE_SOURCE_ROUTE_FALLBACK,
      validate: payload => isWebsiteSourceRouteReceipt(payload, { sourceId, routing: {} }),
      ...options,
    },
  );
  return receipt.source;
}

/** Re-point a registered site at a client, a company, or (neither) the inbox. */
export async function updateWebsiteSourceRouting(
  sourceId: string,
  routing: WebsiteSourceRouting,
  options: { fetcher?: RegistryFetcher; signal?: AbortSignal } = {},
): Promise<WebsiteSourceRegistrySource> {
  const receipt = await postWebsiteSourceMutation<WebsiteSourceRouteReceipt>(
    { action: "update", id: sourceId, ...routing },
    {
      fallback: WEBSITE_SOURCE_UPDATE_FALLBACK,
      validate: payload => isWebsiteSourceRouteReceipt(payload, { sourceId, routing }),
      ...options,
    },
  );
  return receipt.source;
}

/**
 * Permanently remove a registration together with its tool injections and
 * imported form schemas. Callers confirm with the person first; this only
 * runs the mutation and resolves with what the server says it removed.
 */
export async function removeWebsiteSourceRegistration(
  sourceId: string,
  options: { fetcher?: RegistryFetcher; signal?: AbortSignal } = {},
): Promise<{ id: string; host: string }> {
  const receipt = await postWebsiteSourceMutation<WebsiteSourceRemoveReceipt>(
    { action: "remove", id: sourceId },
    {
      fallback: WEBSITE_SOURCE_REMOVE_FALLBACK,
      validate: payload => isWebsiteSourceRemoveReceipt(payload, { sourceId }),
      ...options,
    },
  );
  return receipt.removed;
}

export { mutationErrorMessage as websiteSourceMutationMessage };
