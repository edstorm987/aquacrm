import "server-only";

import type { BusinessIssueRadar } from "@/engines/data/radar/businessRadar";
import { getRequestCompanyHealth } from "@/engines/data/server/kpi/companyHealthSnapshot";
import type { CompanyHealthActuals } from "@/engines/data/server/kpi/companyHealthSnapshot";
import type { BrandPortfolioRow } from "@/lib/brands/brandPortfolio";
import { calculateCompanyHealth } from "@/lib/performance/companyHealth";
import { buildHiringCapacitySignals } from "@/lib/performance/hiringCapacity";
import { buildBrandPortfolioSnapshot } from "@/lib/server/brandPortfolioService";
import { getCompanyProfile } from "@/server/company";
import { listLegalDocuments } from "@/server/legalDocuments";
import { listPeopleEmployees } from "@/server/people";
import type { AgencyTask } from "@/server/types";
import { listUsersForAgency } from "@/server/users";
import { listTradingCompanies } from "@/server/tradingCompanies";

import type { BattleTablePayload, BattleTableScopePayload } from "./_BattleTableWorkspace";

export async function buildBattleTablePayload(input: {
  agencyId: string;
  companyName: string;
  tasks: AgencyTask[];
  productCount: number;
  businessRadar: BusinessIssueRadar;
  canEdit: boolean;
  now: number;
}): Promise<BattleTablePayload> {
  const [companyHealth, brandPortfolio] = await Promise.all([
    getRequestCompanyHealth(input.agencyId),
    buildBrandPortfolioSnapshot(input.agencyId, input.now),
  ]);
  const staffUsers = listUsersForAgency(input.agencyId).filter(user => user.role.startsWith("agency-"));
  const peopleEmployees = listPeopleEmployees(input.agencyId);
  const legalDocuments = listLegalDocuments(input.agencyId);
  const serviceBrands = listTradingCompanies(input.agencyId).filter(company => company.status !== "archived");
  const aggregateCapacitySignals = buildHiringCapacitySignals({ tasks: input.tasks, people: peopleEmployees, now: input.now });
  const scopes = buildBattleTableScopes({
    aggregate: {
      companyName: input.companyName,
      initial: companyHealth.profile,
      actuals: companyHealth.actuals,
      healthScore: companyHealth.health.overall,
      staffCount: staffUsers.length,
      productCount: input.productCount,
      legalCount: legalDocuments.length,
      capacitySignals: aggregateCapacitySignals,
    },
    rows: brandPortfolio.rows,
    staffUsers,
    peopleEmployees,
    financeConnected: brandPortfolio.financeConnected,
    legalDocuments,
    now: input.now,
  });

  return {
    companyName: input.companyName,
    initial: companyHealth.profile,
    actuals: companyHealth.actuals,
    healthScore: companyHealth.health.overall,
    staffCount: staffUsers.length,
    brandCount: serviceBrands.length,
    productCount: input.productCount,
    legalCount: legalDocuments.length,
    connectedSources: input.businessRadar.summary.connectedSources,
    totalSources: input.businessRadar.summary.totalSources,
    canEdit: input.canEdit,
    capacitySignals: aggregateCapacitySignals,
    scopes,
  };
}

function buildBattleTableScopes(input: {
  aggregate: {
    companyName: string;
    initial: ReturnType<typeof getCompanyProfile>;
    actuals: CompanyHealthActuals;
    healthScore: number;
    staffCount: number;
    productCount: number;
    legalCount: number;
    capacitySignals: ReturnType<typeof buildHiringCapacitySignals>;
  };
  rows: BrandPortfolioRow[];
  staffUsers: ReturnType<typeof listUsersForAgency>;
  peopleEmployees: ReturnType<typeof listPeopleEmployees>;
  financeConnected: boolean;
  legalDocuments: ReturnType<typeof listLegalDocuments>;
  now: number;
}): BattleTableScopePayload[] {
  const aggregate: BattleTableScopePayload = {
    id: "ecosystem",
    companyId: null,
    label: input.aggregate.companyName,
    kind: "aggregate",
    detail: "All connected companies plus shared records combined. This view is an explicit Aqua-wide aggregate; switch scope to edit a brand's own targets and projections.",
    initial: input.aggregate.initial,
    actuals: input.aggregate.actuals,
    healthScore: input.aggregate.healthScore,
    staffCount: input.aggregate.staffCount,
    productCount: input.aggregate.productCount,
    legalCount: input.aggregate.legalCount,
    capacitySignals: input.aggregate.capacitySignals,
    coverage: ["all finance", "all clients", "all leads", "all tasks", "all people", "all offers"],
  };
  const date = new Date(input.now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const scopes = input.rows.filter(row => !row.unallocated).map(row => {
    const profile = getCompanyProfile(input.aggregate.initial.agencyId, row.id);
    const actuals: CompanyHealthActuals = {
      monthRevenueCents: row.monthRevenueCents,
      previousMonthRevenueCents: row.previousMonthRevenueCents,
      monthlyRevenueGrowthPercent: row.monthlyRevenueGrowthPercent,
      mrrCents: row.mrrCents,
      currency: row.currency,
      financeConnected: input.financeConnected,
      activeClients: row.activeClients,
      clientsNeedingAttention: row.clientsNeedingAttention,
      leadCount: row.leadCount,
      meetingsThisMonth: row.meetingsThisMonth,
      completedSalesCalls: row.completedSalesCalls,
      openTasks: 0,
      overdueTasks: 0,
    };
    const revenueGapCents = Math.max(0, profile.monthlyRevenueTargetCents - actuals.monthRevenueCents);
    const dealsNeeded = revenueGapCents ? Math.ceil(revenueGapCents / Math.max(1, profile.averageDealValueCents)) : 0;
    const callsNeeded = dealsNeeded ? Math.ceil(dealsNeeded / Math.max(0.01, profile.salesCallCloseRatePercent / 100)) : 0;
    const health = calculateCompanyHealth({
      monthRevenueCents: actuals.monthRevenueCents,
      monthlyRevenueTargetCents: profile.monthlyRevenueTargetCents,
      dayOfMonth: date.getDate(),
      daysInMonth,
      activeClients: actuals.activeClients,
      clientsNeedingAttention: actuals.clientsNeedingAttention,
      revenueGapCents,
      estimatedCallsNeeded: callsNeeded,
      meetingsThisMonth: actuals.meetingsThisMonth,
      openTasks: 0,
      overdueTasks: 0,
    });
    const companyUserIds = new Set(input.staffUsers.filter(user => user.companyIds?.includes(row.id)).map(user => user.id));
    const scopedPeople = input.peopleEmployees.filter(employee => Boolean(employee.userId && companyUserIds.has(employee.userId)));
    return {
      id: `company:${row.id}`,
      companyId: row.id,
      label: row.label,
      kind: "company" as const,
      detail: `Exact ${row.label} records only. Revenue, clients, leads, offers and assigned people are scoped; shared tasks stay outside this brand calculation until task-level company allocation exists.`,
      initial: profile,
      actuals,
      healthScore: health.overall,
      staffCount: row.staffCount,
      productCount: row.productCount,
      legalCount: input.legalDocuments.filter(document => document.companyIds?.includes(row.id)).length,
      capacitySignals: buildHiringCapacitySignals({ people: scopedPeople, now: input.now }),
      coverage: ["allocated finance", "allocated clients", "allocated leads", "allocated people", "allocated offers", "shared tasks excluded"],
    };
  });
  return [aggregate, ...scopes];
}
