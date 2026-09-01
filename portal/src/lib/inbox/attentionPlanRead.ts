import {
  readUnavailable,
  type ReadResult,
} from "@/lib/readAvailability";
import type { ResolutionPlan } from "@/lib/inbox/resolutionContext";
import type { ResolutionEvidence } from "@/lib/inbox/resolutionEvidence";
import type { ResolutionExplain } from "@/lib/inbox/resolutionExplain";

export interface AttentionPlanReads {
  plan: ReadResult<ResolutionPlan | null>;
  explain: ReadResult<ResolutionExplain | null>;
  evidence: ReadResult<ResolutionEvidence | null>;
}

export interface AttentionPlanSnapshot {
  plan: ResolutionPlan | null;
  explain: ResolutionExplain | null;
  evidence: ResolutionEvidence | null;
}

export const EMPTY_ATTENTION_PLAN_SNAPSHOT: AttentionPlanSnapshot = {
  plan: null,
  explain: null,
  evidence: null,
};

/**
 * React key for state that belongs to exactly one alert.
 *
 * The universal banner lives in a persistent layout, so changing only the URL
 * query does not unmount it. Keying its stateful child by this value prevents a
 * dismissed/completed checklist or retained evidence from being painted under
 * the next alert id.
 */
export function attentionScopeKey(surface: "banner" | "evidence", alertId: string): string {
  return `${surface}:${alertId}`;
}

/**
 * Adopt only reads that actually answered.
 *
 * Polling the attention endpoint must not replace the last confirmed checklist
 * or evidence with `null` when a later provider read fails. Availability is
 * updated by the caller, while this snapshot remains the last known truth.
 */
export function adoptAttentionPlanSnapshot(
  current: AttentionPlanSnapshot,
  reads: AttentionPlanReads,
): AttentionPlanSnapshot {
  return {
    plan: reads.plan.available ? reads.plan.data : current.plan,
    explain: reads.explain.available ? reads.explain.data : current.explain,
    evidence: reads.evidence.available ? reads.evidence.data : current.evidence,
  };
}

export function unavailableAttentionPlanReads(reason: string): AttentionPlanReads {
  return {
    plan: readUnavailable(null, reason),
    explain: readUnavailable(null, reason),
    evidence: readUnavailable(null, reason),
  };
}

export function isAttentionPlanReads(value: unknown): value is AttentionPlanReads {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["plan", "explain", "evidence"].every(key => {
    const read = record[key];
    return Boolean(
      read
      && typeof read === "object"
      && typeof (read as { available?: unknown }).available === "boolean"
      && "data" in read,
    );
  });
}
