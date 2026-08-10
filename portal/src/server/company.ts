import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { CompanyCapacityPlan, CompanyObjective, CompanyPlan, CompanyProfile, CompanyQuarterlyReview } from "./types";

const profileKey = (agencyId: string, companyId?: string | null) => companyId ? `${agencyId}:${companyId}` : agencyId;

const defaults = (agencyId: string, companyId?: string | null): CompanyProfile => ({
  agencyId,
  companyId: companyId || undefined,
  mission: "",
  vision: "",
  values: [],
  monthlyRevenueTargetCents: 500_000,
  averageDealValueCents: 1_000_00,
  salesCallCloseRatePercent: 25,
  annualRevenueTargetCents: 60_000_00,
  capacity: {
    weeklyAvailableHours: 32,
    deliveryHoursPerActiveClient: 4,
    salesHoursPerCall: 1,
    adminBufferPercent: 20,
    hiringTriggerPercent: 85,
    notes: "",
  },
  objectives: [],
  plans: [],
  reviews: [],
  updatedAt: 0,
});

export function getCompanyProfile(agencyId: string, companyId?: string | null): CompanyProfile {
  const key = profileKey(agencyId, companyId);
  return { ...defaults(agencyId, companyId), ...getState().companyProfiles[key], agencyId, companyId: companyId || undefined };
}

export function updateCompanyProfile(
  agencyId: string,
  input: Partial<CompanyProfile>,
  actorUserId: string,
  companyId?: string | null,
): CompanyProfile {
  const current = getCompanyProfile(agencyId, companyId);
  const updated: CompanyProfile = {
    agencyId,
    companyId: companyId || undefined,
    mission: cleanText(input.mission ?? current.mission, 2_000),
    vision: cleanText(input.vision ?? current.vision, 2_000),
    values: cleanList(input.values ?? current.values, 20, 100),
    monthlyRevenueTargetCents: cleanMoney(input.monthlyRevenueTargetCents, current.monthlyRevenueTargetCents),
    averageDealValueCents: cleanMoney(input.averageDealValueCents, current.averageDealValueCents),
    salesCallCloseRatePercent: cleanNumber(input.salesCallCloseRatePercent, current.salesCallCloseRatePercent, 1, 100),
    annualRevenueTargetCents: cleanMoney(input.annualRevenueTargetCents, current.annualRevenueTargetCents),
    capacity: cleanCapacity(input.capacity ?? current.capacity, current.capacity),
    objectives: cleanObjectives(input.objectives ?? current.objectives),
    plans: cleanPlans(input.plans ?? current.plans),
    reviews: cleanReviews(input.reviews ?? current.reviews),
    updatedAt: Date.now(),
  };
  mutate(state => { state.companyProfiles[profileKey(agencyId, companyId)] = updated; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "company.profile_updated",
    message: companyId ? "Updated trading company direction, targets, or plans." : "Updated company direction, targets, or plans.",
    metadata: companyId ? { companyId } : undefined,
  });
  return updated;
}

function cleanCapacity(value: unknown, fallback: CompanyCapacityPlan): CompanyCapacityPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyCapacityPlan> : {};
  return {
    weeklyAvailableHours: cleanNumber(item.weeklyAvailableHours, fallback.weeklyAvailableHours, 1, 500),
    deliveryHoursPerActiveClient: cleanNumber(item.deliveryHoursPerActiveClient, fallback.deliveryHoursPerActiveClient, 0, 200),
    salesHoursPerCall: cleanNumber(item.salesHoursPerCall, fallback.salesHoursPerCall, 0, 24),
    adminBufferPercent: cleanNumber(item.adminBufferPercent, fallback.adminBufferPercent, 0, 80),
    hiringTriggerPercent: cleanNumber(item.hiringTriggerPercent, fallback.hiringTriggerPercent, 1, 100),
    notes: cleanText(item.notes, 2_000) || undefined,
  };
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string").map(item => cleanText(item, maxLength)).filter(Boolean))).slice(0, maxItems)
    : [];
}

function cleanMoney(value: unknown, fallback: number): number {
  return cleanNumber(value, fallback, 0, 1_000_000_000_00);
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(Math.min(max, Math.max(min, numeric))) : fallback;
}

function cleanId(value: unknown, prefix: string): string {
  const supplied = cleanText(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return supplied || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function cleanObjectives(value: unknown): CompanyObjective[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyObjective>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    const status = item.status === "at-risk" || item.status === "complete" ? item.status : "on-track";
    return [{
      id: cleanId(item.id, "obj"),
      title,
      metric: cleanText(item.metric, 120),
      currentValue: cleanNumber(item.currentValue, 0, 0, 1_000_000_000),
      targetValue: cleanNumber(item.targetValue, 1, 1, 1_000_000_000),
      unit: cleanText(item.unit, 30),
      dueAt: item.dueAt ? cleanNumber(item.dueAt, 0, 0, Number.MAX_SAFE_INTEGER) : undefined,
      status,
    }];
  });
}

function cleanPlans(value: unknown): CompanyPlan[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyPlan>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    const horizon = item.horizon === "next" || item.horizon === "later" ? item.horizon : "now";
    const statuses: CompanyPlan["status"][] = ["idea", "planned", "active", "complete", "paused"];
    return [{
      id: cleanId(item.id, "plan"),
      title,
      horizon,
      status: statuses.includes(item.status as CompanyPlan["status"]) ? item.status as CompanyPlan["status"] : "idea",
      owner: cleanText(item.owner, 120) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanReviews(value: unknown): CompanyQuarterlyReview[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyQuarterlyReview>;
    const period = cleanText(item.period, 40);
    if (!period) return [];
    return [{
      id: cleanId(item.id, "review"),
      period,
      wins: cleanText(item.wins, 8_000),
      lessons: cleanText(item.lessons, 8_000),
      decisions: cleanText(item.decisions, 8_000),
      nextPriorities: cleanText(item.nextPriorities, 8_000),
      updatedAt: Date.now(),
    }];
  });
}
