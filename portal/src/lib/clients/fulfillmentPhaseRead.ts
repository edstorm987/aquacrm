import { readOrUnavailable, type ReadResult } from "@/lib/readAvailability";

export interface FulfillmentPhase {
  id: string;
  stage: string;
  label: string;
  order: number;
  pluginPreset: string[];
}

export interface FulfillmentPhasePreset {
  id?: string;
  stage: string;
  label: string;
  description?: string;
  pluginPreset: readonly string[];
  portalVariantId?: string;
}

export type FulfillmentPhaseFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isFulfillmentPhase(value: unknown): value is FulfillmentPhase {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const phase = value as Record<string, unknown>;
  return typeof phase.id === "string"
    && typeof phase.stage === "string"
    && typeof phase.label === "string"
    && typeof phase.order === "number"
    && Number.isFinite(phase.order)
    && stringList(phase.pluginPreset);
}

function isFulfillmentPhasePreset(value: unknown): value is FulfillmentPhasePreset {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const phase = value as Record<string, unknown>;
  return optionalString(phase.id)
    && typeof phase.stage === "string"
    && typeof phase.label === "string"
    && optionalString(phase.description)
    && stringList(phase.pluginPreset)
    && optionalString(phase.portalVariantId);
}

async function checkedPhaseList<T>(
  path: string,
  key: "phases" | "presets",
  validate: (value: unknown) => value is T,
  fetcher: FulfillmentPhaseFetcher,
): Promise<T[]> {
  const response = await fetcher(path, { cache: "no-store" });
  const payload = await response.json() as unknown;
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Lifecycle catalogue failed with HTTP ${response.status}.`);
  }
  const record = payload as Record<string, unknown>;
  const rows = record[key];
  if (record.ok !== true || !Array.isArray(rows) || !rows.every(validate)) {
    throw new Error("Lifecycle catalogue response was malformed.");
  }
  return rows;
}

export async function readFulfillmentPhases(
  fetcher: FulfillmentPhaseFetcher = fetch,
): Promise<ReadResult<FulfillmentPhase[]>> {
  return readOrUnavailable(
    () => checkedPhaseList("/api/portal/fulfillment/phases", "phases", isFulfillmentPhase, fetcher),
    [],
    "Lifecycle phases could not be read. Retry before changing a client's stage.",
  );
}

export async function readFulfillmentPhasePresets(
  fetcher: FulfillmentPhaseFetcher = fetch,
): Promise<ReadResult<FulfillmentPhasePreset[]>> {
  return readOrUnavailable(
    () => checkedPhaseList("/api/portal/fulfillment/presets", "presets", isFulfillmentPhasePreset, fetcher),
    [],
    "Starting phases could not be read. Retry before creating a client.",
  );
}

/**
 * Resolve a selected phase from the latest confirmed catalogue.
 *
 * Keeping the whole phase object in component state lets an old label or
 * plugin preset survive a failed read and then reappear after retry. Retaining
 * only the id and resolving through this helper makes the confirmed catalogue
 * the sole source of truth; a removed target closes cleanly.
 */
export function resolveFulfillmentPhaseTarget(
  phases: readonly FulfillmentPhase[] | null,
  targetId: string | null,
): FulfillmentPhase | null {
  if (!phases || !targetId) return null;
  return phases.find(phase => phase.id === targetId) ?? null;
}
