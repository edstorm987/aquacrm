import type { KpiTargetsConfig } from "@/server/types";

export type KpiPlanOverride = { baselineValue?: number; targetValue?: number };
export type KpiPlanOverrides = Record<string, KpiPlanOverride>;

export interface KpiTargetMutation {
  operationId: string;
  expectedUpdatedAt: number;
  kpiId: string;
  action: "set" | "clear";
  baselineValue?: number | null;
  targetValue?: number | null;
}

type FetchTarget = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class KpiTargetRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly config?: KpiTargetsConfig,
  ) {
    super(message);
    this.name = "KpiTargetRequestError";
  }
}

export function kpiPlanOverridesFromConfig(config: KpiTargetsConfig): KpiPlanOverrides {
  return Object.fromEntries(Object.entries(config.byKpi ?? {}).flatMap(([id, override]) => {
    const baselineValue = typeof override.baselineValue === "number" && Number.isFinite(override.baselineValue)
      ? override.baselineValue
      : undefined;
    const targetValue = typeof override.targetValue === "number" && Number.isFinite(override.targetValue)
      ? override.targetValue
      : undefined;
    return baselineValue === undefined && targetValue === undefined
      ? []
      : [[id, { baselineValue, targetValue }]];
  }));
}

function validConfig(value: unknown): value is KpiTargetsConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<KpiTargetsConfig>;
  return Boolean(config.byKpi && typeof config.byKpi === "object" && !Array.isArray(config.byKpi))
    && typeof config.updatedAt === "number"
    && Number.isFinite(config.updatedAt);
}

export async function submitKpiTargetMutation(
  mutation: KpiTargetMutation,
  fetchTarget: FetchTarget = fetch,
): Promise<{ config: KpiTargetsConfig; replayed: boolean }> {
  const response = await fetchTarget("/api/portal/kpi-registry/targets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mutation),
  });
  const data = await response.json().catch(() => ({})) as {
    ok?: unknown;
    error?: unknown;
    config?: unknown;
    replayed?: unknown;
  };
  const config = validConfig(data.config) ? data.config : undefined;
  if (!response.ok || data.ok !== true || !config) {
    throw new KpiTargetRequestError(
      typeof data.error === "string" && data.error.trim() ? data.error : "KPI targets could not be saved.",
      response.status,
      config,
    );
  }
  return { config, replayed: data.replayed === true };
}
