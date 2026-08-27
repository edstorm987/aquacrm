import "server-only";

import crypto from "node:crypto";
import { applyKpiTargetOverride, clearKpiTargetOverride } from "@/lib/performance/kpiRegistry";
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
const OPERATION_RECEIPT_LIMIT = 500;
const ACTIVITY_HARD_CAP = 50_000;

/** The agency's persisted KPI targets config (empty if none set). */
export function getKpiTargetsConfig(agencyId: string): KpiTargetsConfig {
  return getState().agencySettings[agencyId]?.kpiTargets ?? EMPTY;
}

function persist(
  agencyId: string,
  nextConfig: KpiTargetsConfig,
  activity: { actorUserId: string; action: "kpi.target_set" | "kpi.target_cleared"; message: string; operationId?: string; now: number },
): void {
  const fallback = getState().agencySettings[agencyId] ? null : getAgencyWorkspaceSettings(agencyId);
  const activityId = activity.operationId
    ? `act_${crypto.createHash("sha256").update(`${agencyId}\u0000kpi-target:${activity.operationId}`).digest("hex").slice(0, 24)}`
    : `act_${crypto.randomBytes(6).toString("hex")}`;
  mutate(state => {
    const row = state.agencySettings[agencyId];
    if (row) row.kpiTargets = nextConfig;
    else state.agencySettings[agencyId] = { ...fallback!, kpiTargets: nextConfig };
    if (!state.activity.some(entry => entry.id === activityId)) {
      state.activity.push({
        id: activityId,
        ts: activity.now,
        agencyId,
        actorUserId: activity.actorUserId,
        category: "settings",
        action: activity.action,
        message: activity.message,
      });
      if (state.activity.length > ACTIVITY_HARD_CAP) {
        state.activity.splice(0, state.activity.length - ACTIVITY_HARD_CAP);
      }
    }
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
  persist(agencyId, nextConfig, {
    actorUserId: opts.actorUserId,
    action: "kpi.target_set",
    message: `Set KPI target for ${kpiId}${opts.companyId ? ` (company ${opts.companyId})` : ""}.`,
    now,
  });
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
  persist(agencyId, nextConfig, {
    actorUserId: opts.actorUserId,
    action: "kpi.target_cleared",
    message: `Cleared KPI target for ${kpiId}${opts.companyId ? ` (company ${opts.companyId})` : ""}.`,
    now,
  });
  return nextConfig;
}

export interface KpiTargetCommand {
  operationId: string;
  expectedUpdatedAt: number;
  kpiId: string;
  companyId?: string;
  action: "set" | "clear";
  baselineValue?: number | null;
  targetValue?: number | null;
}

export class KpiTargetVersionConflictError extends Error {
  constructor(public readonly config: KpiTargetsConfig) {
    super("KPI targets changed in another session.");
    this.name = "KpiTargetVersionConflictError";
  }
}

export class KpiTargetOperationConflictError extends Error {
  constructor(public readonly config: KpiTargetsConfig) {
    super("This KPI target operation was already used for different values.");
    this.name = "KpiTargetOperationConflictError";
  }
}

function commandFingerprint(command: KpiTargetCommand): string {
  const absent = "__undefined__";
  return crypto.createHash("sha256").update(JSON.stringify([
    command.kpiId,
    command.companyId ?? "",
    command.action,
    command.baselineValue === undefined ? absent : command.baselineValue,
    command.targetValue === undefined ? absent : command.targetValue,
  ])).digest("hex");
}

function withOperationReceipt(
  config: KpiTargetsConfig,
  command: KpiTargetCommand,
  fingerprint: string,
  committedAt: number,
): KpiTargetsConfig {
  const operations = Object.fromEntries(
    Object.entries({
      ...(config.operations ?? {}),
      [command.operationId]: {
        kpiId: command.kpiId,
        companyId: command.companyId,
        fingerprint,
        committedAt,
      },
    })
      .sort(([, left], [, right]) => left.committedAt - right.committedAt)
      .slice(-OPERATION_RECEIPT_LIMIT),
  );
  return { ...config, operations };
}

/**
 * Apply one browser command against the exact agency version it was edited
 * from. The route wraps this in a fresh, flushed cross-process transaction.
 */
export function applyKpiTargetCommand(
  agencyId: string,
  command: KpiTargetCommand,
  opts: { actorUserId: string; now?: number },
): { config: KpiTargetsConfig; replayed: boolean } {
  const current = getKpiTargetsConfig(agencyId);
  const fingerprint = commandFingerprint(command);
  const receipt = current.operations?.[command.operationId];
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) throw new KpiTargetOperationConflictError(current);
    return { config: current, replayed: true };
  }
  if (command.expectedUpdatedAt !== current.updatedAt) throw new KpiTargetVersionConflictError(current);

  const now = Math.max(opts.now ?? Date.now(), current.updatedAt + 1);
  const changed = command.action === "clear"
    ? clearKpiTargetOverride(current, command.kpiId, { companyId: command.companyId, now })
    : applyKpiTargetOverride(current, command.kpiId, {
        baselineValue: command.baselineValue,
        targetValue: command.targetValue,
      }, { companyId: command.companyId, actorUserId: opts.actorUserId, now });
  const nextConfig = withOperationReceipt(changed, command, fingerprint, now);
  const scope = command.companyId ? ` (company ${command.companyId})` : "";
  persist(agencyId, nextConfig, {
    actorUserId: opts.actorUserId,
    action: command.action === "clear" ? "kpi.target_cleared" : "kpi.target_set",
    message: `${command.action === "clear" ? "Cleared" : "Set"} KPI target for ${command.kpiId}${scope}.`,
    operationId: command.operationId,
    now,
  });
  return { config: nextConfig, replayed: false };
}
