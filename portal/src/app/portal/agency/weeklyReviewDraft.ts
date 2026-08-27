import type { DashboardWeekPlan } from "@/server/types";

export type WeeklyReviewDraft = {
  outcome: string;
  reviewNotes: string;
  wins: string;
  misses: string;
  lessons: string;
  decisions: string;
  risks: string;
  startDoing: string;
  stopDoing: string;
  continueDoing: string;
  nextWeekPriorities: string;
  executionScore?: 1 | 2 | 3 | 4 | 5;
  energyScore?: 1 | 2 | 3 | 4 | 5;
  confidenceScore?: 1 | 2 | 3 | 4 | 5;
  reviewStatus: "draft" | "complete";
  reviewedAt?: number;
};

export function weeklyReviewDraftFromPlan(plan: DashboardWeekPlan | null): WeeklyReviewDraft {
  return {
    outcome: plan?.outcome ?? "",
    reviewNotes: plan?.reviewNotes ?? "",
    wins: plan?.wins ?? "",
    misses: plan?.misses ?? "",
    lessons: plan?.lessons ?? "",
    decisions: plan?.decisions ?? "",
    risks: plan?.risks ?? "",
    startDoing: plan?.startDoing ?? "",
    stopDoing: plan?.stopDoing ?? "",
    continueDoing: plan?.continueDoing ?? "",
    nextWeekPriorities: plan?.nextWeekPriorities ?? "",
    executionScore: plan?.executionScore,
    energyScore: plan?.energyScore,
    confidenceScore: plan?.confidenceScore,
    reviewStatus: plan?.reviewStatus ?? "draft",
    reviewedAt: plan?.reviewedAt,
  };
}
