import type { CompanyCapacityAreaId, CompanyCapacityAreaPlan, CompanyCapacityPlan } from "@/server/types";

export type HiringCapacityState = "hire-now" | "prepare" | "watch" | "balanced";
export type HiringCapacityConfidence = "high" | "medium" | "low";

export interface HiringCapacitySignals {
  taskHoursByArea: Record<CompanyCapacityAreaId, number>;
  overdueTasksByArea: Record<CompanyCapacityAreaId, number>;
  peopleHoursByArea: Record<CompanyCapacityAreaId, number>;
  peopleCountByArea: Record<CompanyCapacityAreaId, number>;
  openTaskCount: number;
  overdueTaskCount: number;
  peopleCount: number;
}

export interface HiringCapacityActuals {
  monthlyRevenueTargetCents: number;
  monthRevenueCents: number;
  averageDealValueCents: number;
  salesCallCloseRatePercent: number;
  activeClients: number;
  clientsNeedingAttention: number;
  leadCount: number;
  meetingsThisMonth: number;
  productCount: number;
  legalCount: number;
  financeConnected: boolean;
}

export interface HiringCapacityAreaAnalysis {
  id: CompanyCapacityAreaId;
  label: string;
  roleTitle: string;
  preferredEngagement: CompanyCapacityAreaPlan["preferredEngagement"];
  hiringStatus: CompanyCapacityAreaPlan["hiringStatus"];
  state: HiringCapacityState;
  confidence: HiringCapacityConfidence;
  allocationPercent: number;
  availableHours: number;
  demandHours: number;
  gapHours: number;
  utilisationPercent: number;
  targetUtilisationPercent: number;
  recommendedWeeklyHours: number;
  estimatedMonthlyCostCents: number;
  estimatedMonthlyCapacityValueCents: number;
  netMonthlyImpactCents: number;
  roiMultiple: number | null;
  impactScore: number;
  peopleHours: number;
  peopleCount: number;
  openTaskHours: number;
  overdueTasks: number;
  evidence: string[];
}

export interface HiringCapacityAnalysis {
  areas: HiringCapacityAreaAnalysis[];
  ranked: HiringCapacityAreaAnalysis[];
  primary: HiringCapacityAreaAnalysis | null;
  hireNowCount: number;
  prepareCount: number;
  totalGapHours: number;
  estimatedMonthlyCostCents: number;
  estimatedMonthlyCapacityValueCents: number;
}

export const HIRING_CAPACITY_AREA_META: ReadonlyArray<{ id: CompanyCapacityAreaId; label: string; demandBasis: string }> = [
  { id: "growth", label: "Growth & marketing", demandBasis: "Demand generation, campaigns and offer development" },
  { id: "sales", label: "Sales & acquisition", demandBasis: "Lead qualification, outreach, meetings and follow-up" },
  { id: "client-success", label: "Client success", demandBasis: "Relationship health, support and retention work" },
  { id: "delivery", label: "Delivery", demandBasis: "Committed product and client fulfilment" },
  { id: "operations", label: "Operations", demandBasis: "Planning, coordination, administration and quality control" },
  { id: "finance", label: "Finance & compliance", demandBasis: "Books, cash, contracts, reporting and obligations" },
  { id: "systems", label: "Systems & development", demandBasis: "Websites, automation, infrastructure and technical maintenance" },
] as const;

export function defaultCapacityAreas(): CompanyCapacityAreaPlan[] {
  return [
    area("growth", 10, "Growth marketer", "contractor", 3_000),
    area("sales", 16, "Business development specialist", "part-time", 2_400),
    area("client-success", 12, "Client success manager", "part-time", 2_400),
    area("delivery", 34, "Delivery specialist", "freelancer", 3_200),
    area("operations", 12, "Operations coordinator", "part-time", 2_200),
    area("finance", 7, "Finance and compliance specialist", "contractor", 3_800),
    area("systems", 9, "Systems engineer", "contractor", 4_500),
  ];
}

export function emptyHiringCapacitySignals(): HiringCapacitySignals {
  return {
    taskHoursByArea: areaRecord(),
    overdueTasksByArea: areaRecord(),
    peopleHoursByArea: areaRecord(),
    peopleCountByArea: areaRecord(),
    openTaskCount: 0,
    overdueTaskCount: 0,
    peopleCount: 0,
  };
}

export function buildHiringCapacitySignals(input: {
  tasks?: Array<{ title: string; notes?: string; sourceHref?: string; status?: string; priority?: string; dueAt?: number }>;
  people?: Array<{ title: string; department?: string; weeklyHours?: number; status?: string }>;
  now?: number;
}): HiringCapacitySignals {
  const now = input.now ?? Date.now();
  const result = emptyHiringCapacitySignals();
  for (const task of input.tasks ?? []) {
    if (task.status === "done") continue;
    const areaId = classifyCapacityArea(`${task.title} ${task.notes ?? ""} ${task.sourceHref ?? ""}`);
    const hours = task.priority === "urgent" ? 2 : task.priority === "high" ? 1.5 : 1;
    result.taskHoursByArea[areaId] = round(result.taskHoursByArea[areaId] + hours);
    result.openTaskCount += 1;
    if (task.dueAt && task.dueAt < now) {
      result.overdueTasksByArea[areaId] += 1;
      result.overdueTaskCount += 1;
    }
  }
  for (const person of input.people ?? []) {
    if (person.status === "alumni" || person.status === "suspended") continue;
    const areaId = classifyCapacityArea(`${person.department ?? ""} ${person.title}`);
    result.peopleHoursByArea[areaId] = round(result.peopleHoursByArea[areaId] + Math.max(0, person.weeklyHours ?? 0));
    result.peopleCountByArea[areaId] += 1;
    result.peopleCount += 1;
  }
  return result;
}

export function buildHiringCapacityAnalysis(input: {
  capacity: CompanyCapacityPlan;
  actuals: HiringCapacityActuals;
  signals?: HiringCapacitySignals;
}): HiringCapacityAnalysis {
  const signals = input.signals ?? emptyHiringCapacitySignals();
  const plans = normalizeAreaPlans(input.capacity.areas);
  const revenueGapCents = Math.max(0, input.actuals.monthlyRevenueTargetCents - input.actuals.monthRevenueCents);
  const dealsNeeded = revenueGapCents > 0 ? Math.ceil(revenueGapCents / Math.max(1, input.actuals.averageDealValueCents)) : 0;
  const callsNeeded = dealsNeeded > 0 ? Math.ceil(dealsNeeded / Math.max(0.01, input.actuals.salesCallCloseRatePercent / 100)) : 0;
  const deliveryDemand = input.actuals.activeClients * input.capacity.deliveryHoursPerActiveClient;
  const salesDemand = callsNeeded * input.capacity.salesHoursPerCall / 4.33 + input.actuals.leadCount * 0.2 + input.actuals.meetingsThisMonth * 0.25;
  const growthDemand = dealsNeeded * 0.75 + input.actuals.leadCount * 0.15 + Math.max(0, revenueGapCents ? 2 : 0);
  const clientSuccessDemand = input.actuals.activeClients * 0.6 + input.actuals.clientsNeedingAttention * 2;
  const operatingBase = deliveryDemand + salesDemand + growthDemand + clientSuccessDemand;
  const demandByArea: Record<CompanyCapacityAreaId, number> = {
    growth: growthDemand,
    sales: salesDemand,
    "client-success": clientSuccessDemand,
    delivery: deliveryDemand,
    operations: operatingBase * input.capacity.adminBufferPercent / 100,
    finance: Math.max(input.actuals.financeConnected ? 1 : 2, input.actuals.activeClients * 0.2 + input.actuals.legalCount * 0.25),
    systems: Math.max(1, input.actuals.productCount * 0.25 + input.actuals.activeClients * 0.15),
  };
  const observedPeopleHours = sumAreaRecord(signals.peopleHoursByArea);
  const sharedHours = Math.max(0, input.capacity.weeklyAvailableHours - observedPeopleHours);
  const allocationTotal = plans.reduce((sum, plan) => sum + plan.allocationPercent, 0);
  const allocationDenominator = Math.max(1, allocationTotal);
  const totalDemandBeforeTasks = Object.values(demandByArea).reduce((sum, value) => sum + value, 0);
  const monthlyCapacityValuePerHour = input.actuals.monthlyRevenueTargetCents > 0
    ? input.actuals.monthlyRevenueTargetCents / Math.max(1, totalDemandBeforeTasks * 4.33)
    : input.actuals.averageDealValueCents / Math.max(1, input.capacity.deliveryHoursPerActiveClient * 4.33);

  const areas = plans.map(plan => {
    const observedHours = signals.peopleHoursByArea[plan.id];
    const availableHours = round(observedHours + sharedHours * plan.allocationPercent / allocationDenominator);
    const openTaskHours = signals.taskHoursByArea[plan.id];
    const demandHours = round(Math.max(0, demandByArea[plan.id] + openTaskHours + plan.demandAdjustmentHours));
    const gapHours = round(Math.max(0, demandHours - availableHours * plan.targetUtilisationPercent / 100));
    const utilisationPercent = availableHours > 0 ? Math.round(demandHours / availableHours * 100) : demandHours > 0 ? 999 : 0;
    const state = capacityState(utilisationPercent, plan.targetUtilisationPercent, gapHours, plan.hiringStatus);
    const recommendedWeeklyHours = state === "balanced" ? 0 : roundRecommendedHours(gapHours || Math.max(2, demandHours - availableHours * 0.7));
    const estimatedMonthlyCostCents = Math.round(recommendedWeeklyHours * 4.33 * plan.hourlyCostCents);
    const impactMultiplier = plan.id === "growth" || plan.id === "sales" ? 1.2 : plan.id === "delivery" || plan.id === "client-success" ? 1.05 : 0.82;
    const estimatedMonthlyCapacityValueCents = Math.round(recommendedWeeklyHours * 4.33 * monthlyCapacityValuePerHour * impactMultiplier);
    const netMonthlyImpactCents = estimatedMonthlyCapacityValueCents - estimatedMonthlyCostCents;
    const roiMultiple = estimatedMonthlyCostCents > 0 ? round(estimatedMonthlyCapacityValueCents / estimatedMonthlyCostCents, 2) : null;
    const overdueTasks = signals.overdueTasksByArea[plan.id];
    const impactScore = Math.round(
      stateWeight(state)
      + Math.min(180, gapHours * 12)
      + Math.min(80, overdueTasks * 16)
      + Math.min(120, Math.max(0, netMonthlyImpactCents) / 10_000)
      + (plan.id === "growth" || plan.id === "sales" ? 25 : 0),
    );
    const meta = HIRING_CAPACITY_AREA_META.find(item => item.id === plan.id)!;
    const confidence = capacityConfidence(input.actuals, signals, plan);
    return {
      id: plan.id,
      label: meta.label,
      roleTitle: plan.roleTitle,
      preferredEngagement: plan.preferredEngagement,
      hiringStatus: plan.hiringStatus,
      state,
      confidence,
      allocationPercent: plan.allocationPercent,
      availableHours,
      demandHours,
      gapHours,
      utilisationPercent,
      targetUtilisationPercent: plan.targetUtilisationPercent,
      recommendedWeeklyHours,
      estimatedMonthlyCostCents,
      estimatedMonthlyCapacityValueCents,
      netMonthlyImpactCents,
      roiMultiple,
      impactScore,
      peopleHours: observedHours,
      peopleCount: signals.peopleCountByArea[plan.id],
      openTaskHours,
      overdueTasks,
      evidence: [
        `${demandHours}h estimated weekly demand against ${availableHours}h allocated capacity`,
        `${utilisationPercent}% utilisation against a ${plan.targetUtilisationPercent}% area guardrail`,
        `${openTaskHours}h of retained task pressure${overdueTasks ? ` including ${overdueTasks} overdue` : ""}`,
        observedHours ? `${observedHours}h recorded across ${signals.peopleCountByArea[plan.id]} People record${signals.peopleCountByArea[plan.id] === 1 ? "" : "s"}` : "No area-specific People hours are recorded; shared capacity allocation is being used",
        allocationTotal > 0 ? `${plan.allocationPercent}% configured allocation, normalised across ${allocationTotal}% total area allocation` : "No shared-capacity allocation is configured for any area",
        `${meta.demandBasis}; ${confidence} decision confidence`,
      ],
    } satisfies HiringCapacityAreaAnalysis;
  });
  const ranked = [...areas].sort((left, right) => right.impactScore - left.impactScore || right.gapHours - left.gapHours || left.label.localeCompare(right.label));
  const actionable = ranked.filter(area => area.state === "hire-now" || area.state === "prepare");
  return {
    areas,
    ranked,
    primary: actionable[0] ?? ranked.find(area => area.state === "watch") ?? null,
    hireNowCount: areas.filter(area => area.state === "hire-now").length,
    prepareCount: areas.filter(area => area.state === "prepare").length,
    totalGapHours: round(areas.reduce((sum, area) => sum + area.gapHours, 0)),
    estimatedMonthlyCostCents: actionable.reduce((sum, area) => sum + area.estimatedMonthlyCostCents, 0),
    estimatedMonthlyCapacityValueCents: actionable.reduce((sum, area) => sum + area.estimatedMonthlyCapacityValueCents, 0),
  };
}

export function classifyCapacityArea(value: string): CompanyCapacityAreaId {
  const text = value.toLowerCase();
  if (/finance|account|bookkeep|tax|vat|hmrc|legal|compliance|invoice|payroll|cash/.test(text)) return "finance";
  if (/develop|engineer|technical|system|website|software|automation|infrastructure|design/.test(text)) return "systems";
  if (/client success|account manage|support|retention|relationship|customer care/.test(text)) return "client-success";
  if (/delivery|fulfil|project|production|photograph|content|service/.test(text)) return "delivery";
  if (/sales|business development|lead|outreach|scout|pipeline|meeting/.test(text)) return "sales";
  if (/market|growth|campaign|social|advert|brand|content strategy/.test(text)) return "growth";
  return "operations";
}

function area(id: CompanyCapacityAreaId, allocationPercent: number, roleTitle: string, preferredEngagement: CompanyCapacityAreaPlan["preferredEngagement"], hourlyCostCents: number): CompanyCapacityAreaPlan {
  return { id, allocationPercent, demandAdjustmentHours: 0, targetUtilisationPercent: 80, roleTitle, preferredEngagement, hourlyCostCents, hiringStatus: "monitoring" };
}

function normalizeAreaPlans(value: CompanyCapacityAreaPlan[] | undefined): CompanyCapacityAreaPlan[] {
  const defaults = defaultCapacityAreas();
  const byId = new Map((value ?? []).map(item => [item.id, item]));
  return defaults.map(fallback => ({ ...fallback, ...byId.get(fallback.id), id: fallback.id }));
}

function capacityState(utilisation: number, target: number, gap: number, hiringStatus: CompanyCapacityAreaPlan["hiringStatus"]): HiringCapacityState {
  if (hiringStatus === "recruiting" || hiringStatus === "approved" || utilisation >= target + 20 || gap >= 8) return "hire-now";
  if (utilisation >= target || gap >= 3) return "prepare";
  if (utilisation >= target - 15 || gap > 0) return "watch";
  return "balanced";
}

function capacityConfidence(actuals: HiringCapacityActuals, signals: HiringCapacitySignals, plan: CompanyCapacityAreaPlan): HiringCapacityConfidence {
  const evidence = Number(actuals.financeConnected) + Number(actuals.activeClients > 0 || actuals.leadCount > 0) + Number(signals.openTaskCount > 0) + Number(signals.peopleCount > 0) + Number(Boolean(plan.notes));
  return evidence >= 4 ? "high" : evidence >= 2 ? "medium" : "low";
}

function stateWeight(state: HiringCapacityState): number {
  return state === "hire-now" ? 500 : state === "prepare" ? 320 : state === "watch" ? 150 : 20;
}

function roundRecommendedHours(value: number): number {
  if (value <= 0) return 0;
  return Math.min(40, Math.max(5, Math.ceil(value / 5) * 5));
}

function areaRecord(): Record<CompanyCapacityAreaId, number> {
  return { growth: 0, sales: 0, "client-success": 0, delivery: 0, operations: 0, finance: 0, systems: 0 };
}

function sumAreaRecord(value: Record<CompanyCapacityAreaId, number>): number {
  return Object.values(value).reduce((sum, item) => sum + item, 0);
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
