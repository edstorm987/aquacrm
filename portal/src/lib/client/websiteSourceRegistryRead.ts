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
