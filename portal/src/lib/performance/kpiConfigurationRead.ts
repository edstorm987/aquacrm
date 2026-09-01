import { readOrUnavailable, type ReadResult } from "@/lib/readAvailability";
import type {
  CustomKpiDefinition,
  CustomKpiOp,
  SharedKpiComparisonView,
} from "@/server/types";

export type KpiConfigurationFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

const CUSTOM_OPERATIONS = new Set<CustomKpiOp>(["ratio", "rate", "sum", "diff"]);
const COMPARISON_MODES = new Set<SharedKpiComparisonView["mode"]>(["plan", "indexed", "change", "raw"]);
const COMPARISON_RANGES = new Set<SharedKpiComparisonView["range"]>([
  "24h",
  "7d",
  "30d",
  "90d",
  "quarter",
  "ytd",
  "12m",
  "all",
  "custom",
]);

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

export function isCustomKpiDefinition(value: unknown): value is CustomKpiDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const definition = value as Record<string, unknown>;
  return typeof definition.id === "string"
    && typeof definition.label === "string"
    && typeof definition.numeratorId === "string"
    && isOptionalString(definition.denominatorId)
    && CUSTOM_OPERATIONS.has(definition.op as CustomKpiOp)
    && isOptionalString(definition.category)
    && (definition.direction === undefined || definition.direction === "higher" || definition.direction === "lower")
    && typeof definition.createdAt === "number"
    && Number.isFinite(definition.createdAt)
    && isOptionalString(definition.createdBy);
}

export function isSharedKpiView(value: unknown): value is SharedKpiComparisonView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const view = value as Record<string, unknown>;
  return typeof view.id === "string"
    && typeof view.name === "string"
    && Array.isArray(view.kpiIds)
    && view.kpiIds.every(id => typeof id === "string")
    && COMPARISON_MODES.has(view.mode as SharedKpiComparisonView["mode"])
    && COMPARISON_RANGES.has(view.range as SharedKpiComparisonView["range"])
    && isOptionalString(view.start)
    && isOptionalString(view.end)
    && typeof view.createdAt === "number"
    && Number.isFinite(view.createdAt)
    && isOptionalString(view.createdBy);
}

export type KpiConfigurationReadState = "loading" | "ready" | "error";

/**
 * A catalogue mutation is safe only while the last read is confirmed and no
 * other mutation is in flight. A lost mutation response makes the server state
 * ambiguous, so callers move back to `error` and require a fresh GET before
 * enabling another write.
 */
export function canMutateKpiConfiguration(
  state: KpiConfigurationReadState,
  mutationPending = false,
): boolean {
  return state === "ready" && !mutationPending;
}

/** Validate a successful custom-KPI response before adopting it as truth. */
export function customKpiDefinitionsFromPayload(payload: unknown): CustomKpiDefinition[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return record.ok === true
    && Array.isArray(record.definitions)
    && record.definitions.every(isCustomKpiDefinition)
    ? record.definitions
    : null;
}

/** Validate a successful shared-view response before adopting it as truth. */
export function sharedKpiViewsFromPayload(payload: unknown): SharedKpiComparisonView[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return record.ok === true
    && Array.isArray(record.views)
    && record.views.every(isSharedKpiView)
    ? record.views
    : null;
}

async function readCheckedList<T>(
  path: string,
  key: "definitions" | "views",
  validate: (value: unknown) => value is T,
  fetcher: KpiConfigurationFetcher,
): Promise<T[]> {
  const response = await fetcher(path, { cache: "no-store" });
  const payload = await response.json() as unknown;
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`KPI configuration failed with HTTP ${response.status}.`);
  }
  const record = payload as Record<string, unknown>;
  const rows = record[key];
  if (record.ok !== true || !Array.isArray(rows) || !rows.every(validate)) {
    throw new Error("KPI configuration response was malformed.");
  }
  return rows;
}

/** Read agency custom KPI definitions without turning a refusal into zero definitions. */
export async function readCustomKpiDefinitions(
  fetcher: KpiConfigurationFetcher = fetch,
): Promise<ReadResult<CustomKpiDefinition[]>> {
  return readOrUnavailable(
    () => readCheckedList("/api/portal/kpi-registry/custom", "definitions", isCustomKpiDefinition, fetcher),
    [],
    "Custom KPI definitions could not be read. Retry before creating or deleting a custom KPI.",
  );
}

/** Read agency-shared comparison views without manufacturing an empty shared workspace. */
export async function readSharedKpiViews(
  fetcher: KpiConfigurationFetcher = fetch,
): Promise<ReadResult<SharedKpiComparisonView[]>> {
  return readOrUnavailable(
    () => readCheckedList("/api/portal/kpi-registry/views", "views", isSharedKpiView, fetcher),
    [],
    "Shared KPI views could not be read. Retry before saving or deleting a shared view.",
  );
}
