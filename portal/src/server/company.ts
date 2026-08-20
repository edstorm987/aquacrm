import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import { defaultCapacityAreas } from "@/lib/performance/hiringCapacity";
import type { CompanyCapacityAreaId, CompanyCapacityAreaPlan, CompanyCapacityPlan, CompanyCapitalPlan, CompanyCapitalTransaction, CompanyDividendDistribution, CompanyGovernanceDecision, CompanyInvestmentHolding, CompanyObjective, CompanyPlan, CompanyProfile, CompanyProjectionPlan, CompanyQuarterlyReview, CompanyShareClass, CompanyShareholder } from "./types";

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
    areas: defaultCapacityAreas(),
    notes: "",
  },
  projection: {
    horizonMonths: 12,
    baseMonthlyGrowthPercent: 5,
    targetMonthlyGrowthPercent: 10,
    grossMarginTargetPercent: 65,
    monthlyOperatingCostCents: 0,
    cashReserveTargetCents: 0,
  },
  capital: {
    currency: "GBP",
    shareClasses: [{
      id: "ordinary",
      name: "Ordinary",
      authorisedShares: 100,
      nominalValueCents: 100,
      votingRightsPerShare: 1,
      dividendEligible: true,
    }],
    shareholders: [],
    transactions: [],
    investments: [],
    dividends: [],
    decisions: [],
    notes: "",
  },
  objectives: [],
  plans: [],
  reviews: [],
  updatedAt: 0,
});

export function getCompanyProfile(agencyId: string, companyId?: string | null): CompanyProfile {
  const key = profileKey(agencyId, companyId);
  const fallback = defaults(agencyId, companyId);
  const stored = getState().companyProfiles[key];
  return {
    ...fallback,
    ...stored,
    capacity: cleanCapacity(stored?.capacity ?? fallback.capacity, fallback.capacity),
    agencyId,
    companyId: companyId || undefined,
  };
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
    projection: cleanProjection(input.projection ?? current.projection, current.projection),
    capital: cleanCapital(input.capital ?? current.capital, current.capital),
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

function cleanCapital(value: unknown, fallback: CompanyCapitalPlan): CompanyCapitalPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyCapitalPlan> : {};
  const currency = cleanCurrency(item.currency, fallback.currency);
  return {
    currency,
    shareClasses: cleanShareClasses(item.shareClasses ?? fallback.shareClasses),
    shareholders: cleanShareholders(item.shareholders ?? fallback.shareholders),
    transactions: cleanCapitalTransactions(item.transactions ?? fallback.transactions, currency),
    investments: cleanInvestments(item.investments ?? fallback.investments, currency),
    dividends: cleanDividends(item.dividends ?? fallback.dividends, currency),
    decisions: cleanGovernanceDecisions(item.decisions ?? fallback.decisions),
    notes: cleanText(item.notes, 8_000) || undefined,
  };
}

function cleanShareClasses(value: unknown): CompanyShareClass[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyShareClass>;
    const name = cleanText(item.name, 100);
    if (!name) return [];
    return [{
      id: cleanId(item.id, "class"),
      name,
      authorisedShares: cleanNumber(item.authorisedShares, 0, 0, 1_000_000_000_000),
      nominalValueCents: cleanMoney(item.nominalValueCents, 0),
      votingRightsPerShare: cleanDecimal(item.votingRightsPerShare, 1, 0, 1_000, 4),
      dividendEligible: item.dividendEligible !== false,
      notes: cleanText(item.notes, 2_000) || undefined,
    }];
  });
}

function cleanShareholders(value: unknown): CompanyShareholder[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyShareholder["kind"][] = ["founder", "individual", "employee", "investor", "company", "trust", "other"];
  return value.slice(0, 500).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyShareholder>;
    const name = cleanText(item.name, 180);
    const shareClassId = cleanText(item.shareClassId, 80);
    if (!name || !shareClassId) return [];
    return [{
      id: cleanId(item.id, "holder"),
      name,
      kind: kinds.includes(item.kind as CompanyShareholder["kind"]) ? item.kind as CompanyShareholder["kind"] : "individual",
      shareClassId,
      shares: cleanNumber(item.shares, 0, 0, 1_000_000_000_000),
      investedCents: cleanMoney(item.investedCents, 0),
      status: item.status === "former" ? "former" : "active",
      director: item.director === true,
      boardSeat: item.boardSeat === true,
      joinedAt: item.joinedAt ? cleanTimestamp(item.joinedAt) : undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanCapitalTransactions(value: unknown, fallbackCurrency: string): CompanyCapitalTransaction[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyCapitalTransaction["kind"][] = ["share-issue", "capital-contribution", "director-loan-in", "director-loan-repayment", "share-transfer", "buyback", "grant", "other"];
  const statuses: CompanyCapitalTransaction["status"][] = ["planned", "approved", "completed", "cancelled"];
  return value.slice(0, 2_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyCapitalTransaction>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    return [{
      id: cleanId(item.id, "capital"),
      kind: kinds.includes(item.kind as CompanyCapitalTransaction["kind"]) ? item.kind as CompanyCapitalTransaction["kind"] : "other",
      title,
      shareholderId: cleanText(item.shareholderId, 80) || undefined,
      shareClassId: cleanText(item.shareClassId, 80) || undefined,
      counterparty: cleanText(item.counterparty, 180) || undefined,
      amountCents: cleanMoney(item.amountCents, 0),
      currency: cleanCurrency(item.currency, fallbackCurrency),
      shares: cleanNumber(item.shares, 0, 0, 1_000_000_000_000),
      occurredAt: cleanTimestamp(item.occurredAt),
      status: statuses.includes(item.status as CompanyCapitalTransaction["status"]) ? item.status as CompanyCapitalTransaction["status"] : "planned",
      approvalId: cleanText(item.approvalId, 80) || undefined,
      reference: cleanText(item.reference, 180) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanInvestments(value: unknown, fallbackCurrency: string): CompanyInvestmentHolding[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyInvestmentHolding["kind"][] = ["cash-equivalent", "fund", "equity", "bond", "crypto", "property", "equipment", "subsidiary", "other"];
  const statuses: CompanyInvestmentHolding["status"][] = ["planned", "active", "sold", "written-off"];
  return value.slice(0, 1_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyInvestmentHolding>;
    const name = cleanText(item.name, 180);
    if (!name) return [];
    return [{
      id: cleanId(item.id, "investment"),
      name,
      kind: kinds.includes(item.kind as CompanyInvestmentHolding["kind"]) ? item.kind as CompanyInvestmentHolding["kind"] : "other",
      platform: cleanText(item.platform, 180) || undefined,
      currency: cleanCurrency(item.currency, fallbackCurrency),
      costBasisCents: cleanMoney(item.costBasisCents, 0),
      currentValueCents: cleanMoney(item.currentValueCents, 0),
      incomeReceivedCents: cleanMoney(item.incomeReceivedCents, 0),
      acquiredAt: item.acquiredAt ? cleanTimestamp(item.acquiredAt) : undefined,
      valuedAt: item.valuedAt ? cleanTimestamp(item.valuedAt) : undefined,
      status: statuses.includes(item.status as CompanyInvestmentHolding["status"]) ? item.status as CompanyInvestmentHolding["status"] : "planned",
      risk: item.risk === "high" || item.risk === "medium" ? item.risk : "low",
      owner: cleanText(item.owner, 120) || undefined,
      reference: cleanText(item.reference, 180) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanDividends(value: unknown, fallbackCurrency: string): CompanyDividendDistribution[] {
  if (!Array.isArray(value)) return [];
  const statuses: CompanyDividendDistribution["status"][] = ["draft", "approved", "part-paid", "paid", "cancelled"];
  return value.slice(0, 1_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyDividendDistribution>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    return [{
      id: cleanId(item.id, "dividend"),
      title,
      period: cleanText(item.period, 80),
      currency: cleanCurrency(item.currency, fallbackCurrency),
      declaredCents: cleanMoney(item.declaredCents, 0),
      paidCents: cleanMoney(item.paidCents, 0),
      declaredAt: item.declaredAt ? cleanTimestamp(item.declaredAt) : undefined,
      paymentDueAt: item.paymentDueAt ? cleanTimestamp(item.paymentDueAt) : undefined,
      paidAt: item.paidAt ? cleanTimestamp(item.paidAt) : undefined,
      status: statuses.includes(item.status as CompanyDividendDistribution["status"]) ? item.status as CompanyDividendDistribution["status"] : "draft",
      allocations: Array.isArray(item.allocations) ? item.allocations.slice(0, 500).flatMap(rawAllocation => {
        if (!rawAllocation || typeof rawAllocation !== "object") return [];
        const allocation = rawAllocation as { shareholderId?: unknown; amountCents?: unknown };
        const shareholderId = cleanText(allocation.shareholderId, 80);
        return shareholderId ? [{ shareholderId, amountCents: cleanMoney(allocation.amountCents, 0) }] : [];
      }) : [],
      approvalId: cleanText(item.approvalId, 80) || undefined,
      reference: cleanText(item.reference, 180) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanGovernanceDecisions(value: unknown): CompanyGovernanceDecision[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyGovernanceDecision["kind"][] = ["board", "shareholder", "written", "ordinary", "special"];
  const statuses: CompanyGovernanceDecision["status"][] = ["draft", "approved", "rejected", "superseded"];
  return value.slice(0, 2_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyGovernanceDecision>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    return [{
      id: cleanId(item.id, "decision"),
      title,
      kind: kinds.includes(item.kind as CompanyGovernanceDecision["kind"]) ? item.kind as CompanyGovernanceDecision["kind"] : "board",
      status: statuses.includes(item.status as CompanyGovernanceDecision["status"]) ? item.status as CompanyGovernanceDecision["status"] : "draft",
      summary: cleanText(item.summary, 8_000),
      proposedBy: cleanText(item.proposedBy, 120) || undefined,
      meetingAt: item.meetingAt ? cleanTimestamp(item.meetingAt) : undefined,
      effectiveAt: item.effectiveAt ? cleanTimestamp(item.effectiveAt) : undefined,
      approvedAt: item.approvedAt ? cleanTimestamp(item.approvedAt) : undefined,
      votesForPercent: typeof item.votesForPercent === "number" ? cleanDecimal(item.votesForPercent, 0, 0, 100, 2) : undefined,
      votesAgainstPercent: typeof item.votesAgainstPercent === "number" ? cleanDecimal(item.votesAgainstPercent, 0, 0, 100, 2) : undefined,
      documentId: cleanText(item.documentId, 120) || undefined,
      relatedRecordIds: cleanList(item.relatedRecordIds, 200, 80),
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanProjection(value: unknown, fallback: CompanyProjectionPlan): CompanyProjectionPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyProjectionPlan> : {};
  return {
    horizonMonths: cleanNumber(item.horizonMonths, fallback.horizonMonths, 3, 60),
    baseMonthlyGrowthPercent: cleanNumber(item.baseMonthlyGrowthPercent, fallback.baseMonthlyGrowthPercent, -100, 500),
    targetMonthlyGrowthPercent: cleanNumber(item.targetMonthlyGrowthPercent, fallback.targetMonthlyGrowthPercent, -100, 500),
    grossMarginTargetPercent: cleanNumber(item.grossMarginTargetPercent, fallback.grossMarginTargetPercent, 0, 100),
    monthlyOperatingCostCents: cleanMoney(item.monthlyOperatingCostCents, fallback.monthlyOperatingCostCents),
    cashReserveTargetCents: cleanMoney(item.cashReserveTargetCents, fallback.cashReserveTargetCents),
  };
}

function cleanCapacity(value: unknown, fallback: CompanyCapacityPlan): CompanyCapacityPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyCapacityPlan> : {};
  return {
    weeklyAvailableHours: cleanNumber(item.weeklyAvailableHours, fallback.weeklyAvailableHours, 1, 500),
    deliveryHoursPerActiveClient: cleanNumber(item.deliveryHoursPerActiveClient, fallback.deliveryHoursPerActiveClient, 0, 200),
    salesHoursPerCall: cleanNumber(item.salesHoursPerCall, fallback.salesHoursPerCall, 0, 24),
    adminBufferPercent: cleanNumber(item.adminBufferPercent, fallback.adminBufferPercent, 0, 80),
    hiringTriggerPercent: cleanNumber(item.hiringTriggerPercent, fallback.hiringTriggerPercent, 1, 100),
    areas: cleanCapacityAreas(item.areas, fallback.areas),
    notes: cleanText(item.notes, 2_000) || undefined,
  };
}

function cleanCapacityAreas(value: unknown, fallback: CompanyCapacityAreaPlan[]): CompanyCapacityAreaPlan[] {
  const allowedIds: CompanyCapacityAreaId[] = ["growth", "sales", "client-success", "delivery", "operations", "finance", "systems"];
  const engagements: CompanyCapacityAreaPlan["preferredEngagement"][] = ["full-time", "part-time", "contractor", "freelancer", "automation"];
  const statuses: CompanyCapacityAreaPlan["hiringStatus"][] = ["monitoring", "approved", "recruiting", "filled", "paused"];
  const source = Array.isArray(value) ? value : [];
  const byId = new Map<CompanyCapacityAreaId, Partial<CompanyCapacityAreaPlan>>();
  for (const raw of source) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<CompanyCapacityAreaPlan>;
    if (allowedIds.includes(item.id as CompanyCapacityAreaId)) byId.set(item.id as CompanyCapacityAreaId, item);
  }
  return fallback.map(area => {
    const item = byId.get(area.id) ?? {};
    return {
      id: area.id,
      allocationPercent: cleanNumber(item.allocationPercent, area.allocationPercent, 0, 100),
      demandAdjustmentHours: cleanNumber(item.demandAdjustmentHours, area.demandAdjustmentHours, -200, 500),
      targetUtilisationPercent: cleanNumber(item.targetUtilisationPercent, area.targetUtilisationPercent, 20, 100),
      roleTitle: cleanText(item.roleTitle, 160) || area.roleTitle,
      preferredEngagement: engagements.includes(item.preferredEngagement as CompanyCapacityAreaPlan["preferredEngagement"]) ? item.preferredEngagement as CompanyCapacityAreaPlan["preferredEngagement"] : area.preferredEngagement,
      hourlyCostCents: cleanNumber(item.hourlyCostCents, area.hourlyCostCents, 0, 1_000_000),
      hiringStatus: statuses.includes(item.hiringStatus as CompanyCapacityAreaPlan["hiringStatus"]) ? item.hiringStatus as CompanyCapacityAreaPlan["hiringStatus"] : area.hiringStatus,
      notes: cleanText(item.notes, 2_000) || undefined,
    };
  });
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

function cleanDecimal(value: unknown, fallback: number, min: number, max: number, places: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const factor = 10 ** places;
  return Math.round(Math.min(max, Math.max(min, numeric)) * factor) / factor;
}

function cleanTimestamp(value: unknown): number {
  return cleanNumber(value, Date.now(), 0, Number.MAX_SAFE_INTEGER);
}

function cleanCurrency(value: unknown, fallback = "GBP"): string {
  const currency = cleanText(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback.toUpperCase();
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
    const score = (candidate: unknown): 1 | 2 | 3 | 4 | 5 => Math.min(5, Math.max(1, Math.round(cleanNumber(candidate, 3, 1, 5)))) as 1 | 2 | 3 | 4 | 5;
    const rawScorecard = item.scorecard && typeof item.scorecard === "object" ? item.scorecard : undefined;
    const rawEvidence = item.evidenceSnapshot && typeof item.evidenceSnapshot === "object" ? item.evidenceSnapshot : undefined;
    return [{
      id: cleanId(item.id, "review"),
      period,
      status: item.status === "complete" ? "complete" : "draft",
      executiveSummary: cleanText(item.executiveSummary, 8_000) || undefined,
      wins: cleanText(item.wins, 8_000),
      misses: cleanText(item.misses, 8_000) || undefined,
      lessons: cleanText(item.lessons, 8_000),
      marketSignals: cleanText(item.marketSignals, 8_000) || undefined,
      customerSignals: cleanText(item.customerSignals, 8_000) || undefined,
      financialDiagnosis: cleanText(item.financialDiagnosis, 8_000) || undefined,
      operatingDiagnosis: cleanText(item.operatingDiagnosis, 8_000) || undefined,
      strategicBets: cleanText(item.strategicBets, 8_000) || undefined,
      risks: cleanText(item.risks, 8_000) || undefined,
      stopDoing: cleanText(item.stopDoing, 8_000) || undefined,
      decisions: cleanText(item.decisions, 8_000),
      nextPriorities: cleanText(item.nextPriorities, 8_000),
      successMeasures: cleanText(item.successMeasures, 8_000) || undefined,
      ownerCommitment: cleanText(item.ownerCommitment, 8_000) || undefined,
      implementationHandover: cleanText(item.implementationHandover, 8_000) || undefined,
      scorecard: rawScorecard ? {
        growth: score(rawScorecard.growth),
        finance: score(rawScorecard.finance),
        customer: score(rawScorecard.customer),
        operations: score(rawScorecard.operations),
        capability: score(rawScorecard.capability),
      } : undefined,
      evidenceSnapshot: rawEvidence ? {
        revenueCents: cleanNumber(rawEvidence.revenueCents, 0, 0, 1_000_000_000_000),
        revenueTargetCents: cleanNumber(rawEvidence.revenueTargetCents, 0, 0, 1_000_000_000_000),
        revenueProgressPercent: cleanNumber(rawEvidence.revenueProgressPercent, 0, 0, 100_000),
        monthlyGrowthPercent: typeof rawEvidence.monthlyGrowthPercent === "number" ? cleanNumber(rawEvidence.monthlyGrowthPercent, 0, -100, 100_000) : undefined,
        activeClients: cleanNumber(rawEvidence.activeClients, 0, 0, 1_000_000),
        clientsNeedingAttention: cleanNumber(rawEvidence.clientsNeedingAttention, 0, 0, 1_000_000),
        openLeads: cleanNumber(rawEvidence.openLeads, 0, 0, 1_000_000),
        openTasks: cleanNumber(rawEvidence.openTasks, 0, 0, 1_000_000),
        overdueTasks: cleanNumber(rawEvidence.overdueTasks, 0, 0, 1_000_000),
        healthScore: cleanNumber(rawEvidence.healthScore, 0, 0, 100),
        objectiveProgressPercent: cleanNumber(rawEvidence.objectiveProgressPercent, 0, 0, 100),
        objectivesAtRisk: cleanNumber(rawEvidence.objectivesAtRisk, 0, 0, 1_000_000),
        capacityUtilisationPercent: cleanNumber(rawEvidence.capacityUtilisationPercent, 0, 0, 100_000),
        connectedSources: cleanNumber(rawEvidence.connectedSources, 0, 0, 100_000),
        totalSources: cleanNumber(rawEvidence.totalSources, 0, 0, 100_000),
        capturedAt: cleanNumber(rawEvidence.capturedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      } : undefined,
      completedAt: item.completedAt ? cleanNumber(item.completedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER) : undefined,
      updatedAt: cleanNumber(item.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    }];
  });
}
