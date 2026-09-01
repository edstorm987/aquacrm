import { readOrUnavailable } from "@/lib/readAvailability";
import type { AttentionPlanReads } from "@/lib/inbox/attentionPlanRead";
import type { ResolutionPlan } from "@/lib/inbox/resolutionContext";
import type { ResolutionEvidence } from "@/lib/inbox/resolutionEvidence";
import type { ResolutionExplain } from "@/lib/inbox/resolutionExplain";

export interface AttentionPlanReaders {
  plan: () => Promise<ResolutionPlan | null>;
  explain: () => Promise<ResolutionExplain | null>;
  evidence: () => Promise<ResolutionEvidence | null>;
}

/**
 * Read the three attention details independently.
 *
 * A missing plan/evidence is a valid successful result for alert families that
 * do not have one. A rejected read is different and remains unavailable, so a
 * consumer never has to infer failure from the same `null` used for "none".
 */
export async function loadAttentionPlanReads(
  readers: AttentionPlanReaders,
): Promise<AttentionPlanReads> {
  const [plan, explain, evidence] = await Promise.all([
    readOrUnavailable(
      readers.plan,
      null,
      "The resolution checklist could not be read. Retry before assuming this item is complete.",
    ),
    readOrUnavailable(
      readers.explain,
      null,
      "The alert explanation could not be read. Retry to restore the confirmed details.",
    ),
    readOrUnavailable(
      readers.evidence,
      null,
      "The records behind this alert could not be read. Retry before treating the evidence as empty.",
    ),
  ]);

  return { plan, explain, evidence };
}
