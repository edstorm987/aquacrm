import "server-only";

import { applyKpiTargetOverride, clearKpiTargetOverride } from "@/lib/performance/kpiRegistry";
import { logActivity } from "@/server/activity";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { getState, mutate } from "@/server/storage";
import type { KpiTargetsConfig } from "@/server/types";

/**
 * KPI target store (Phase 4).
 *
 * Persists per-agency (optionally per-company) target/baseline overrides into
 * `agencySettings.kpiTargets`, replacing the explorer's browser-only localStorage
 * overrides. The pure layering + versioning lives in `lib/kpiRegistry`
 * (`resolveKpiTarget` / `applyKpiTargetOverride`); this file is just the
 * server-side read/write around it.
 */

const EMPTY: KpiTargetsConfig = { byKpi: {}, updatedAt: 0 };

/** The agency's persisted KPI targets config (empty if none set). */
export function getKpiTargetsConfig(agencyId: string): KpiTargetsConfig {
  return getState().agencySettings[agencyId]?.kpiTargets ?? EMPTY;
}

function persist(agencyId: string, nextConfig: KpiTargetsConfig): void {
  const fallback = getState().agencySettings[agencyId] ? null : getAgencyWorkspaceSettings(agencyId);
  mutate(state => {
    const row = state.agencySettings[agencyId];
    if (row) row.kpiTargets = nextConfig;
    else state.agencySettings[agencyId] = { ...fallback!, kpiTargets: nextConfig };
  });
}

/** Set (or update) a KPI target/baseline override, versioned. Returns the new config. */
export function setKpiTarget(
  agencyId: string,
  kpiId: string,
  patch: { baselineValue?: number | null; targetValue?: number | null },
  opts: { companyId?: string; actorUserId: string; now?: number },
): KpiTargetsConfig {
  const now = opts.now ?? Date.now();
  const nextConfig = applyKpiTargetOverride(getKpiTargetsConfig(agencyId), kpiId, patch, { companyId: opts.companyId, actorUserId: opts.actorUserId, now });
  persist(agencyId, nextConfig);
  logActivity({ agencyId, actorUserId: opts.actorUserId, category: "settings", action: "kpi.target_set", message: `Set KPI target for ${kpiId}${opts.companyId ? ` (company ${opts.companyId})` : ""}.` });
  return nextConfig;
}

/** Clear a KPI override at the agency or company level. Returns the new config. */
export function clearKpiTarget(
  agencyId: string,
  kpiId: string,
  opts: { companyId?: string; actorUserId: string; now?: number },
): KpiTargetsConfig {
  const now = opts.now ?? Date.now();
  const nextConfig = clearKpiTargetOverride(getKpiTargetsConfig(agencyId), kpiId, { companyId: opts.companyId, now });
  persist(agencyId, nextConfig);
  logActivity({ agencyId, actorUserId: opts.actorUserId, category: "settings", action: "kpi.target_cleared", message: `Cleared KPI target for ${kpiId}${opts.companyId ? ` (company ${opts.companyId})` : ""}.` });
  return nextConfig;
}
