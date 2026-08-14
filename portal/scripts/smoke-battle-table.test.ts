import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Company = typeof import("../src/server/company");
type TradingCompanies = typeof import("../src/server/tradingCompanies");

let storage: Storage;
let tenants: Tenants;
let company: Company;
let tradingCompanies: TradingCompanies;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  company = await import("../src/server/company");
  tradingCompanies = await import("../src/server/tradingCompanies");
  await storage.ensureHydrated();
});

test("Battle Table persists bounded executive projection assumptions", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Battle Table Test", slug: "battle-table-test" });
  const initial = company.getCompanyProfile(agency.id);
  assert.equal(initial.projection.horizonMonths, 12);

  const updated = company.updateCompanyProfile(agency.id, {
    monthlyRevenueTargetCents: 1_500_000,
    projection: {
      horizonMonths: 120,
      baseMonthlyGrowthPercent: -200,
      targetMonthlyGrowthPercent: 18,
      grossMarginTargetPercent: 130,
      monthlyOperatingCostCents: 320_000,
      cashReserveTargetCents: 2_400_000,
    },
  }, "executive_test");

  assert.equal(updated.projection.horizonMonths, 60);
  assert.equal(updated.projection.baseMonthlyGrowthPercent, -100);
  assert.equal(updated.projection.targetMonthlyGrowthPercent, 18);
  assert.equal(updated.projection.grossMarginTargetPercent, 100);
  assert.equal(updated.projection.monthlyOperatingCostCents, 320_000);
  assert.deepEqual(company.getCompanyProfile(agency.id).projection, updated.projection);
});

test("Battle Table keeps parent and trading-brand projections independent", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Scoped Battle Table", slug: "scoped-battle-table" });
  const brand = tradingCompanies.createTradingCompany(agency.id, { name: "Brand Alpha" }, "executive_test");
  const parentBefore = company.getCompanyProfile(agency.id, null);

  const brandPlan = company.updateCompanyProfile(agency.id, {
    monthlyRevenueTargetCents: 900_000,
    projection: { ...company.getCompanyProfile(agency.id, brand.id).projection, targetMonthlyGrowthPercent: 22 },
  }, "executive_test", brand.id);

  assert.equal(brandPlan.companyId, brand.id);
  assert.equal(company.getCompanyProfile(agency.id, brand.id).monthlyRevenueTargetCents, 900_000);
  assert.equal(company.getCompanyProfile(agency.id, brand.id).projection.targetMonthlyGrowthPercent, 22);
  assert.equal(company.getCompanyProfile(agency.id, null).monthlyRevenueTargetCents, parentBefore.monthlyRevenueTargetCents);
  assert.notEqual(company.getCompanyProfile(agency.id, null).projection.targetMonthlyGrowthPercent, 22);
});

test("Battle Table retains bounded area hiring assumptions for existing and new profiles", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Hiring Capacity Test", slug: "hiring-capacity-test" });
  const initial = company.getCompanyProfile(agency.id);
  assert.equal(initial.capacity.areas.length, 7);

  const updated = company.updateCompanyProfile(agency.id, {
    capacity: {
      ...initial.capacity,
      areas: initial.capacity.areas.map(area => area.id === "delivery" ? {
        ...area,
        allocationPercent: 140,
        demandAdjustmentHours: 900,
        targetUtilisationPercent: 5,
        roleTitle: "Senior delivery lead",
        preferredEngagement: "full-time",
        hourlyCostCents: 999_999_999,
        hiringStatus: "approved",
      } : area),
    },
  }, "executive_test");

  const delivery = updated.capacity.areas.find(area => area.id === "delivery");
  assert.equal(delivery?.allocationPercent, 100);
  assert.equal(delivery?.demandAdjustmentHours, 500);
  assert.equal(delivery?.targetUtilisationPercent, 20);
  assert.equal(delivery?.hourlyCostCents, 1_000_000);
  assert.equal(delivery?.roleTitle, "Senior delivery lead");
  assert.equal(delivery?.hiringStatus, "approved");
  assert.equal(company.getCompanyProfile(agency.id).capacity.areas.length, 7);
});

test("Battle Table retains a complete evidence-backed quarterly strategy cycle", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Quarterly Review Test", slug: "quarterly-review-test" });
  const initial = company.getCompanyProfile(agency.id);
  const review = {
    id: "review-q3-2026",
    period: "Q3 2026",
    status: "complete" as const,
    executiveSummary: "Demand exists, but conversion and delivery capacity constrain growth.",
    wins: "Retained every active client.",
    misses: "Revenue remained below target.",
    lessons: "Commercial activity needs a protected weekly allocation.",
    marketSignals: "Website enquiries remain the strongest source.",
    customerSignals: "Retention is strong while onboarding still creates friction.",
    financialDiagnosis: "Revenue concentration remains too high.",
    operatingDiagnosis: "Founder capacity is the principal constraint.",
    strategicBets: "Productise onboarding\nIncrease qualified traffic",
    risks: "Added demand could weaken delivery quality.",
    stopDoing: "Unscoped reactive work.",
    decisions: "Protect two commercial blocks each week.",
    nextPriorities: "1. Prove acquisition\n2. Reduce onboarding time",
    successMeasures: "Five qualified leads monthly and onboarding below seven days.",
    ownerCommitment: "Review the scorecard every Friday.",
    implementationHandover: "Create objectives and weekly actions from the strategy.",
    scorecard: { growth: 2 as const, finance: 2 as const, customer: 4 as const, operations: 3 as const, capability: 3 as const },
    evidenceSnapshot: {
      revenueCents: 100_000,
      revenueTargetCents: 500_000,
      revenueProgressPercent: 20,
      monthlyGrowthPercent: 5,
      activeClients: 2,
      clientsNeedingAttention: 1,
      openLeads: 3,
      openTasks: 8,
      overdueTasks: 2,
      healthScore: 31,
      objectiveProgressPercent: 40,
      objectivesAtRisk: 1,
      capacityUtilisationPercent: 88,
      connectedSources: 22,
      totalSources: 27,
      capturedAt: 123_456,
    },
    completedAt: 123_456,
    updatedAt: 123_456,
  };
  const updated = company.updateCompanyProfile(agency.id, { ...initial, reviews: [review] }, "executive_test");
  assert.equal(updated.reviews[0]?.status, "complete");
  assert.equal(updated.reviews[0]?.scorecard?.customer, 4);
  assert.equal(updated.reviews[0]?.evidenceSnapshot?.capacityUtilisationPercent, 88);
  assert.equal(updated.reviews[0]?.implementationHandover, "Create objectives and weekly actions from the strategy.");
  assert.equal(updated.reviews[0]?.updatedAt, 123_456);
});

test("Battle Table retains a bounded ownership, investment, dividend and authority register", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Capital Register Test", slug: "capital-register-test" });
  const initial = company.getCompanyProfile(agency.id);
  const updated = company.updateCompanyProfile(agency.id, {
    ...initial,
    capital: {
      currency: "gbp",
      shareClasses: [{ id: "ordinary", name: "Ordinary", authorisedShares: 100, nominalValueCents: 100, votingRightsPerShare: 1, dividendEligible: true }],
      shareholders: [{ id: "holder-ed", name: "Ed Hallam", kind: "founder", shareClassId: "ordinary", shares: 100, investedCents: 10_000, status: "active", director: true, boardSeat: true }],
      transactions: [{ id: "capital-1", kind: "capital-contribution", title: "Founder capital", shareholderId: "holder-ed", amountCents: 10_000, currency: "gbp", shares: 100, occurredAt: 123_456, status: "completed", approvalId: "decision-1" }],
      investments: [{ id: "investment-1", name: "Growth reserve", kind: "fund", currency: "usd", costBasisCents: 50_000, currentValueCents: 56_000, incomeReceivedCents: 1_000, valuedAt: 123_456, status: "active", risk: "medium" }],
      dividends: [{ id: "dividend-1", title: "2026 distribution", period: "FY 2026", currency: "gbp", declaredCents: 25_000, paidCents: 0, status: "approved", allocations: [{ shareholderId: "holder-ed", amountCents: 25_000 }], approvalId: "decision-1" }],
      decisions: [{ id: "decision-1", title: "Approve capital and distribution", kind: "board", status: "approved", summary: "Approved after reviewing cash and reserves.", votesForPercent: 150, votesAgainstPercent: -20, relatedRecordIds: ["capital-1", "dividend-1"] }],
    },
  }, "executive_test");

  assert.equal(updated.capital.currency, "GBP");
  assert.equal(updated.capital.shareholders[0]?.shares, 100);
  assert.equal(updated.capital.investments[0]?.currency, "USD");
  assert.equal(updated.capital.dividends[0]?.allocations[0]?.amountCents, 25_000);
  assert.equal(updated.capital.decisions[0]?.votesForPercent, 100);
  assert.equal(updated.capital.decisions[0]?.votesAgainstPercent, 0);
  assert.deepEqual(company.getCompanyProfile(agency.id).capital, updated.capital);
});

test("Battle Table is the third command station and owns every executive control", () => {
  const nav = read("src/app/portal/agency/_CommandStationNav.tsx");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");
  const table = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  const quarterlyReview = read("src/app/portal/agency/_QuarterlyStrategyReview.tsx");
  const companyPage = read("src/app/portal/agency/company/page.tsx");
  const sidebar = read("src/lib/chrome/sidebarLayout.ts");

  assert.match(nav, /"executive" \| "day" \| "battle"/);
  assert.match(nav, /label="Day command"/);
  assert.match(nav, /label="Command Centre"/);
  assert.match(nav, /label="Battle Table"/);
  assert.match(nav, /sm:grid-cols-3/);
  assert.match(dashboard, /initialStation === "battle"/);
  assert.match(dashboard, /<BattleTableWorkspace payload=\{battleTablePayload\}/);

  for (const station of ["Strategic plot", "KPI intelligence", "Direction", "Projections", "Objectives", "Capacity", "Plans", "Capital & ownership", "Reviews", "Executive systems"]) {
    assert.match(table, new RegExp(station));
  }
  for (const workingControl of ["Revenue trajectory and target corridor", "Run scenarios", "Objective command", "Capacity assumptions", "Hiring intelligence", "Where the next unit of capacity matters most", "Accept hiring action", "Area capacity map", "Every supporting system remains one move away"]) {
    assert.match(table, new RegExp(workingControl));
  }
  assert.match(table, /QuarterlyStrategyReview/);
  assert.match(table, /KpiComparisonWorkspace/);
  assert.match(table, /initialRange="quarter"/);
  assert.match(table, /Full KPI workspace/);
  assert.match(table, /Trends, projections and target gaps/);
  assert.match(table, /onOpenIntelligence/);
  assert.match(table, /CapitalOwnershipWorkspace/);
  const capital = read("src/app/portal/agency/_CapitalOwnershipWorkspace.tsx");
  for (const capitalControl of ["Capital picture", "Ownership", "Capital ledger", "Investments", "Dividends", "Decisions", "Authoritative cap table", "Company investment register", "Distribution register", "Governance and authority"]) assert.match(capital, new RegExp(capitalControl));
  for (const reviewControl of ["Executive strategy cycle", "Quarterly deep dive", "Aqua strategy partner", "Diagnosis room", "Strategic bets", "Success measures", "Lock review", "Retained quarterly cycles"]) assert.match(quarterlyReview, new RegExp(reviewControl));
  assert.match(table, /selectedScope\.companyId \? `\/api\/portal\/company\?companyId=/);
  assert.match(table, /"\/api\/portal\/company\?scope=parent"/);
  assert.match(table, /fetch\(endpoint/);
  assert.match(table, /Projection scope/);
  assert.match(table, /Trading brands/);
  assert.match(table, /Exact company plan/);
  assert.match(table, /strategicCalculations/);
  assert.match(table, /projectSeries/);
  assert.match(companyPage, /redirect\(`\/portal\/agency\?station=battle&battle=\$\{battle\}`\)/);
  assert.match(companyPage, /requestedView === "connections"/);
  assert.match(companyPage, /requestedView === "products"/);
  assert.match(companyPage, /requestedView === "legal"/);
  assert.doesNotMatch(sidebar, /id: "company"/);
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}
