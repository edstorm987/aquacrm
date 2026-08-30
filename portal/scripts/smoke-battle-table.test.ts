import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { buildPausedIntelligenceSnapshot } from "../src/app/portal/agency/commandPerformance";
import {
  createBattleNavigationState,
  reconcileBattleNavigationState,
} from "../src/app/portal/agency/battleNavigation";
import {
  changedCompanyFields,
  describeCompanyConflict,
  rebaseCompanyProfile,
} from "../src/app/portal/agency/companyProfileConflict";

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

test("Battle Table tolerates a paused or legacy scope-less intelligence snapshot", () => {
  const paused = buildPausedIntelligenceSnapshot("GBP", 123);
  assert.equal(paused.scopes[0]?.kind, "ecosystem", "new paused snapshots carry an aggregate scope");
  const intelligenceScope = read("src/app/portal/agency/commandIntelligenceScope.ts");
  const table = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  assert.match(intelligenceScope, /if \(!scope \|\| scope\.kind === "ecosystem"\) return snapshot/);
  assert.match(table, /intelligence\.scopes\[0\]\s*\n\s*\?\? fallbackIntelligenceScope\(selectedScope\)/);
});

test("a reused Battle subtree follows changed URL section/scope props without discarding plan drafts", () => {
  const scopeIds = ["ecosystem", "company:alpha", "company:beta"];
  let navigation = createBattleNavigationState<"warroom" | "capacity" | "systems">("warroom", "ecosystem", scopeIds);
  navigation = { ...navigation, section: "capacity", scopeId: "company:alpha" };
  const retainedProfiles = { "company:alpha": { unsavedPlan: "keep this draft" } };

  const unrelatedRerender = reconcileBattleNavigationState(navigation, "warroom", "ecosystem", scopeIds);
  assert.equal(unrelatedRerender, navigation, "unchanged query props preserve local Battle navigation");

  const sectionOnlyRerender = reconcileBattleNavigationState(unrelatedRerender, "systems", "ecosystem", scopeIds);
  assert.equal(sectionOnlyRerender.section, "systems");
  assert.equal(sectionOnlyRerender.scopeId, "ecosystem", "one changed URL value applies the complete URL section/scope pair");

  const locallyMovedAgain = { ...sectionOnlyRerender, section: "capacity" as const, scopeId: "company:alpha" };
  const queryRerender = reconcileBattleNavigationState(locallyMovedAgain, "systems", "company:beta", scopeIds);
  assert.deepEqual(queryRerender, {
    section: "systems",
    scopeId: "company:beta",
    requestedSection: "systems",
    requestedScopeId: "company:beta",
  });
  assert.equal(retainedProfiles["company:alpha"].unsavedPlan, "keep this draft", "navigation reconciliation does not remount or replace profile drafts");

  const removedScopeRerender = reconcileBattleNavigationState(queryRerender, "systems", "company:beta", ["ecosystem"]);
  assert.equal(removedScopeRerender.section, "systems");
  assert.equal(removedScopeRerender.scopeId, "ecosystem", "a payload that removes the active scope falls back safely");

  const table = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  assert.match(table, /reconcileBattleNavigationState\(navigation, initialSection, initialScopeId, availableScopeIds\)/);
  assert.match(table, /const \[profiles, setProfiles\] = useState/);
});

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

// ─── Concurrency and lock integrity (issues #66) ──────────────────────────────
// Ten Battle Table stations and the Company workspace all PUT one whole
// CompanyProfile. Before this, the last writer won silently and any edit of a
// completed review flipped it back to draft while overwriting its captured
// evidence. These pin both halves.

test("a company plan write that lost the race is refused with the current state, not merged over it", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Plan Concurrency", slug: "plan-concurrency" });
  const loaded = company.getCompanyProfile(agency.id);
  assert.equal(loaded.revision, 0, "an unwritten plan starts at revision 0");

  const first = company.updateCompanyProfile(agency.id, { ...loaded, mission: "Owner A mission" }, "owner_a", null, { expectedRevision: loaded.revision });
  assert.equal(first.revision, 1, "each accepted write advances the revision");
  assert.equal(first.mission, "Owner A mission");

  // The second tab still holds revision 0 and PUTs the whole profile.
  let refusal: unknown;
  try {
    company.updateCompanyProfile(agency.id, { ...loaded, vision: "Owner B vision" }, "owner_b", null, { expectedRevision: loaded.revision });
  } catch (error) {
    refusal = error;
  }
  assert.ok(refusal instanceof company.CompanyProfileConflictError, "a stale whole-profile write is refused");
  assert.equal((refusal as InstanceType<typeof company.CompanyProfileConflictError>).current.mission, "Owner A mission", "the refusal carries the live plan so the caller can rebase");
  assert.equal(company.getCompanyProfile(agency.id).mission, "Owner A mission", "the losing write did not land");
  assert.equal(company.getCompanyProfile(agency.id).vision, "", "the losing write did not land");
  assert.equal(company.getCompanyProfile(agency.id).revision, 1, "a refused write does not advance the revision");

  // Reload, reapply, retry: the retry carries the newer revision and succeeds
  // without discarding the first owner's mission.
  const latest = company.getCompanyProfile(agency.id);
  const retried = company.updateCompanyProfile(agency.id, { ...latest, vision: "Owner B vision" }, "owner_b", null, { expectedRevision: latest.revision });
  assert.equal(retried.revision, 2);
  assert.equal(retried.mission, "Owner A mission");
  assert.equal(retried.vision, "Owner B vision");
});

test("the company PUT demands the revision being edited and answers a stale one with a current-state 409", () => {
  const route = read("src/app/api/portal/company/route.ts");
  assert.match(route, /const expectedRevision = body\.revision/);
  assert.match(route, /status: 400/, "a versionless whole-profile PUT is rejected outright");
  assert.match(route, /CompanyProfileConflictError[\s\S]*conflict: "stale-revision", company: error\.current[\s\S]*status: 409/);
  assert.match(route, /CompanyReviewLockedError[\s\S]*conflict: "locked-review"[\s\S]*status: 409/);

  // Both versionless callers now send the profile they loaded and handle 409.
  for (const path of ["src/app/portal/agency/_BattleTableWorkspace.tsx", "src/app/portal/agency/company/_CompanyWorkspace.tsx"]) {
    const source = read(path);
    assert.match(source, /response\.status === 409 && result\?\.conflict === "stale-revision"/, `${path} recognises the conflict`);
    assert.match(source, /rebaseCompanyProfile\(conflict\)/, `${path} offers merge-and-retry rather than silent failure`);
    assert.match(source, /Reapply my changes/, `${path} exposes the retry as a control`);
  }
});

test("a locked quarterly cycle cannot be edited, unlocked or dropped in place", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Locked Cycle", slug: "locked-cycle" });
  const seeded = company.getCompanyProfile(agency.id);
  const locked = company.updateCompanyProfile(agency.id, { ...seeded, reviews: [completeReview()] }, "executive_test", null, { expectedRevision: seeded.revision });
  const retained = locked.reviews[0]!;
  assert.equal(retained.status, "complete");
  assert.equal(retained.version, 1, "an original cycle is version 1");

  // An unrelated station saving the whole profile carries the locked cycle
  // through untouched — that must stay a normal, accepted save.
  const carried = company.updateCompanyProfile(agency.id, { ...locked, monthlyRevenueTargetCents: 777_000 }, "executive_test", null, { expectedRevision: locked.revision });
  assert.equal(carried.monthlyRevenueTargetCents, 777_000);
  assert.deepEqual(carried.reviews[0], retained, "an untouched locked cycle survives a neighbouring station's save");

  const attempt = (reviews: unknown, label: string) => {
    let refusal: unknown;
    try {
      company.updateCompanyProfile(agency.id, { ...carried, reviews: reviews as never }, "executive_test", null, { expectedRevision: carried.revision });
    } catch (error) {
      refusal = error;
    }
    assert.ok(refusal instanceof company.CompanyReviewLockedError, label);
  };

  attempt([{ ...retained, decisions: "Rewritten after the fact." }], "an in-place edit of a locked cycle is refused");
  attempt([{ ...retained, status: "draft", completedAt: undefined }], "silently reverting a locked cycle to draft is refused");
  attempt([{ ...retained, evidenceSnapshot: { ...retained.evidenceSnapshot!, revenueCents: 9_999_999 } }], "overwriting the captured evidence of a locked cycle is refused");
  attempt([], "dropping a locked cycle from the decision record is refused");

  const stored = company.getCompanyProfile(agency.id);
  assert.deepEqual(stored.reviews[0], retained, "no refused attempt changed the retained record");
  assert.equal(stored.revision, carried.revision, "a refused review write does not advance the revision");
});

test("a locked cycle is corrected by a numbered amendment that leaves the original evidence intact", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Cycle Amendment", slug: "cycle-amendment" });
  const seeded = company.getCompanyProfile(agency.id);
  const locked = company.updateCompanyProfile(agency.id, { ...seeded, reviews: [completeReview()] }, "executive_test", null, { expectedRevision: seeded.revision });
  const original = locked.reviews[0]!;

  const amendment = {
    ...original,
    id: "review-q3-2026-amendment",
    amendsReviewId: original.id,
    version: 97, // a client cannot claim a version; the server assigns lineage
    status: "draft" as const,
    completedAt: undefined,
    decisions: "Corrected: the commercial block moves to Tuesday and Thursday.",
    evidenceSnapshot: { ...original.evidenceSnapshot!, revenueCents: 250_000, capturedAt: 999_999 },
    updatedAt: 999_999,
  };
  const amended = company.updateCompanyProfile(agency.id, { ...locked, reviews: [amendment, original] }, "executive_test", null, { expectedRevision: locked.revision });

  const kept = amended.reviews.find(review => review.id === original.id);
  const published = amended.reviews.find(review => review.id === "review-q3-2026-amendment");
  assert.deepEqual(kept, original, "the amended-from cycle is retained exactly as it was locked");
  assert.equal(kept?.evidenceSnapshot?.revenueCents, 100_000, "the original evidence is not restated from the amendment");
  assert.equal(published?.amendsReviewId, original.id);
  assert.equal(published?.version, 2, "lineage is server-assigned, not claimed by the client");
  assert.equal(published?.status, "draft");
  assert.equal(published?.decisions, "Corrected: the commercial block moves to Tuesday and Thursday.");

  // Locking the amendment freezes it in turn; the original is still untouched.
  const sealed = company.updateCompanyProfile(agency.id, {
    ...amended,
    reviews: amended.reviews.map(review => review.id === published!.id ? { ...review, status: "complete" as const, completedAt: 1_000_000 } : review),
  }, "executive_test", null, { expectedRevision: amended.revision });
  assert.equal(sealed.reviews.find(review => review.id === published!.id)?.status, "complete");
  assert.deepEqual(sealed.reviews.find(review => review.id === original.id), original);

  // Reload round-trip: both cycles survive, and the workspace opens on the
  // newest one in the lineage rather than the superseded original.
  const reloaded = company.getCompanyProfile(agency.id);
  assert.equal(reloaded.reviews.length, 2);
  const { activeReviewForPeriod } = await import("../src/app/portal/agency/_QuarterlyStrategyReview");
  assert.equal(activeReviewForPeriod(reloaded.reviews, "Q3 2026")?.id, published!.id, "the superseded original is not what the review stage reopens");
});

test("the quarterly stage stops unlocking a completed cycle and stops restating its evidence", () => {
  const review = read("src/app/portal/agency/_QuarterlyStrategyReview.tsx");
  // The old change() forced status:"draft"/completedAt:undefined on every
  // keystroke, which is exactly how a locked cycle silently reopened.
  assert.doesNotMatch(review, /\.\.\.patch, status: "draft", completedAt: undefined/);
  assert.match(review, /function change\([\s\S]*if \(!editable\) return;/);
  assert.match(review, /const locked = draft\.status === "complete"/);
  assert.match(review, /const editable = canEdit && !locked/);
  assert.match(review, /if \(!editable \|\| \(status === "complete" && !completionReady\)\) return;/);
  assert.match(review, /Amend this cycle/, "a locked cycle offers an explicit amendment instead of a silent reopen");
  // A locked cycle shows the readings it was locked against, never today's.
  assert.match(review, /locked \? draft\.evidenceSnapshot \?\? evidence : evidence/);
});

test("a conflicted plan is rebased onto the newer version instead of overwriting it", () => {
  const base = baseProfileFixture();
  const attempted: import("../src/server/types").CompanyProfile = { ...base, mission: "My new mission", plans: [{ id: "plan-1", title: "My plan", horizon: "now", status: "active" }] };
  // Someone else saved a different section in the meantime.
  const latest: import("../src/server/types").CompanyProfile = { ...base, revision: 4, vision: "Their new vision", monthlyRevenueTargetCents: 2_000_000 };

  assert.deepEqual(changedCompanyFields(base, attempted), ["mission", "plans"], "only the sections this editor touched are resent");

  const rebased = rebaseCompanyProfile({ base, attempted, latest });
  assert.equal(rebased.mission, "My new mission", "my change is reapplied");
  assert.equal(rebased.plans[0]?.title, "My plan");
  assert.equal(rebased.vision, "Their new vision", "their change is kept, not clobbered");
  assert.equal(rebased.monthlyRevenueTargetCents, 2_000_000);
  assert.equal(rebased.revision, 4, "the retry compares against the newer revision");
  assert.match(describeCompanyConflict({ base, attempted, latest }), /2 changed sections/);
});

test("the Company workspace rebases from the last server-confirmed plan, not from its own edit buffer", () => {
  // `company` in _CompanyWorkspace IS the direction form's edit buffer — the
  // mission/vision/values textareas setCompany() straight into it and the form
  // then submits with a bare save(). If the conflict base were read from that
  // same buffer, base and attempted would be one object: the diff would be
  // empty, "Reapply my changes" would resend the winner's plan verbatim and
  // report success, and the banner would tell the owner nothing of theirs was
  // lost while the reload had just thrown their typing away.
  const buffer = { ...baseProfileFixture(), mission: "Typed but never saved" };
  assert.deepEqual(changedCompanyFields(buffer, buffer), [], "diffing the edit buffer against itself reports no change");
  assert.match(
    describeCompanyConflict({ base: buffer, attempted: buffer, latest: { ...buffer, revision: 3 } }),
    /nothing of yours was lost/,
    "which is the false reassurance a self-diff would produce",
  );

  const source = read("src/app/portal/agency/company/_CompanyWorkspace.tsx");
  assert.match(source, /const base = baseline;/, "the conflict base is the last profile the server confirmed");
  assert.doesNotMatch(source, /const base = company;/, "the live edit buffer is never the conflict base");
  assert.equal((source.match(/setBaseline\(/g) ?? []).length, 2, "the baseline moves only on a server answer: the 409 reload and the accepted write");
});

function baseProfileFixture(): import("../src/server/types").CompanyProfile {
  return company.getCompanyProfile("agency-fixture", null);
}

function completeReview() {
  return {
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
    strategicBets: "Productise onboarding",
    risks: "Added demand could weaken delivery quality.",
    stopDoing: "Unscoped reactive work.",
    decisions: "Protect two commercial blocks each week.",
    nextPriorities: "1. Prove acquisition",
    successMeasures: "Five qualified leads monthly.",
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
}

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
  // Battle Table stays the third of three always-on stations; the nav only
  // widens to four columns when the founder-gated Dev Team station is rendered.
  assert.match(nav, /showDevTeam \? "sm:grid-cols-4" : "sm:grid-cols-3"/);
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

test("Phase 5 — drill-in sections wear the war-room chrome, not a settings page", () => {
  const table = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  // The drill-in strip is a command rail: back route + a numbered station chip
  // derived from the sections list + the scope + the live-feed reminder.
  assert.match(table, /Back to the war room/);
  assert.match(table, /const stationCode = activeStationIndex >= 0 \? `ST-\$\{String\(activeStationIndex \+ 1\)\.padStart\(2, "0"\)\}` : ""/);
  assert.match(table, /\{stationCode\} · \{activeStation\.label\}/);
  assert.match(table, /Planning station · \{selectedScope\.label\}/);
  assert.match(table, /Feeds the war room live/);
  // Every BattleSection header carries the gold accent signature the war-room
  // zones speak in, so a planning body reads as a station of the same surface.
  assert.match(table, /<header className="mb-5 border-l-2 border-\[#d7b56d\]\/45 pl-4">/);
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// ─── War room (Battle Table overhaul, phases 1–4) ─────────────────────────────
// The war room is the Battle Table's front door: the battlefield, the decisions
// queue and the live pulse. These exercise the real model against real company
// profiles built by the server, not the shape of the JSX.

type WarRoom = typeof import("../src/app/portal/agency/_battleWarRoom");

// 15 August 2026 — 15 of 31 days elapsed, so the month-to-date corridor expects
// 48.4% of a monthly target by now.
const WAR_ROOM_NOW = new Date(2026, 7, 15, 12, 0, 0).getTime();

async function warRoom(): Promise<WarRoom> {
  return import("../src/app/portal/agency/_battleWarRoom");
}

function warRoomActuals(overrides: Partial<import("../src/app/portal/agency/_battleWarRoom").WarRoomActuals> = {}): import("../src/app/portal/agency/_battleWarRoom").WarRoomActuals {
  return {
    monthRevenueCents: 0,
    monthlyRevenueGrowthPercent: null,
    currency: "gbp",
    financeConnected: true,
    activeClients: 0,
    clientsNeedingAttention: 0,
    leadCount: 0,
    meetingsThisMonth: 0,
    openTasks: 0,
    overdueTasks: 0,
    ...overrides,
  };
}

async function warRoomScope(input: {
  id?: string;
  companyId?: string | null;
  label?: string;
  kind?: "aggregate" | "company";
  profile: import("../src/server/types").CompanyProfile;
  actuals?: Partial<import("../src/app/portal/agency/_battleWarRoom").WarRoomActuals>;
  healthScore?: number;
}): Promise<import("../src/app/portal/agency/_battleWarRoom").WarRoomScopeInput> {
  return {
    id: input.id ?? "ecosystem",
    companyId: input.companyId ?? null,
    label: input.label ?? "Whole Aqua ecosystem",
    kind: input.kind ?? "aggregate",
    profile: input.profile,
    actuals: warRoomActuals(input.actuals),
    healthScore: input.healthScore ?? 72,
    productCount: 3,
    legalCount: 2,
  };
}

async function seedProfile(slug: string, patch: Partial<import("../src/server/types").CompanyProfile> = {}) {
  await storage.reset();
  const agency = tenants.createAgency({ name: slug, slug });
  const initial = company.getCompanyProfile(agency.id);
  return Object.keys(patch).length ? company.updateCompanyProfile(agency.id, { ...initial, ...patch }, "executive_test") : initial;
}

test("War room reads revenue against the month-to-date corridor, not the whole month", async () => {
  const { buildBattlefield, monthPaceFraction } = await warRoom();
  const profile = await seedProfile("war-room-pace", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const pace = monthPaceFraction(WAR_ROOM_NOW);
  assert.ok(Math.abs(pace - 15 / 31) < 1e-9, "15 August is 15 of 31 days into the month");

  const [onPace] = buildBattlefield({
    scopes: [await warRoomScope({ profile, actuals: { monthRevenueCents: 480_000 } })],
    now: WAR_ROOM_NOW,
  });
  // Half the month gone, 48% of the month's target banked: that is ON TRACK.
  // A whole-month progress read would have called this a 48% failure.
  assert.equal(onPace?.revenue.progressPercent, 48);
  assert.equal(onPace?.revenue.state, "on-track");
  assert.ok((onPace?.revenue.deviationPercent ?? -99) > -5);
  assert.equal(onPace?.revenue.forecastCents, Math.round(480_000 / pace));

  const [offPace] = buildBattlefield({
    scopes: [await warRoomScope({ profile, actuals: { monthRevenueCents: 100_000 } })],
    now: WAR_ROOM_NOW,
  });
  assert.equal(offPace?.revenue.state, "critical");
  assert.ok((offPace?.revenue.deviationPercent ?? 0) < -50);
  // An off-track revenue position adds exactly one critical alert on top of
  // whatever the capacity guardrails are already reporting.
  assert.equal(offPace?.criticalAlertCount, (offPace?.hireNowCount ?? 0) + 1);
  assert.equal(onPace?.criticalAlertCount, onPace?.hireNowCount);
});

test("War room stays honest: no finance evidence is Learning, no target is No target — never a pass", async () => {
  const { buildBattlefield, summariseBattlefield } = await warRoom();
  const profile = await seedProfile("war-room-honesty", { monthlyRevenueTargetCents: 1_000_000 });
  const [blind] = buildBattlefield({
    scopes: [await warRoomScope({ profile, actuals: { monthRevenueCents: 0, financeConnected: false } })],
    now: WAR_ROOM_NOW,
  });
  assert.equal(blind?.revenue.state, "learning");
  assert.equal(blind?.revenue.deviationPercent, null);
  assert.equal(blind?.revenue.forecastCents, null);
  assert.equal(blind?.criticalAlertCount, blind?.hireNowCount, "a blind spot is never reported as an off-track call");
  assert.ok(blind?.evidence.some(item => /not connected/i.test(item)));

  const untargeted = await seedProfile("war-room-untargeted", { monthlyRevenueTargetCents: 0 });
  const rows = buildBattlefield({
    scopes: [await warRoomScope({ profile: untargeted, actuals: { monthRevenueCents: 250_000 } })],
    now: WAR_ROOM_NOW,
  });
  assert.equal(rows[0]?.revenue.state, "no-target");
  assert.equal(rows[0]?.revenue.deviationPercent, null);
  assert.equal(summariseBattlefield(rows).behind, 0, "an unset target is not a scope behind pace");
});

test("War room battlefield keeps one row per scope with Radar attributed to the ecosystem only", async () => {
  const { buildBattlefield } = await warRoom();
  const profile = await seedProfile("war-room-scopes", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const rows = buildBattlefield({
    scopes: [
      await warRoomScope({ profile, actuals: { monthRevenueCents: 480_000 } }),
      await warRoomScope({ id: "company:brand-a", companyId: "brand-a", label: "Brand Alpha", kind: "company", profile, actuals: { monthRevenueCents: 480_000 } }),
    ],
    incidents: [
      { id: "radar-1", severity: "critical", title: "Finance evidence stalled", detail: "No paid invoice in 21 days.", evidence: ["Last payment 21 days ago"], href: "/portal/agency/radar" },
      { id: "radar-2", severity: "warning", title: "Lead follow-up slipping", detail: "Three leads untouched.", evidence: ["3 leads older than 7 days"], href: "/portal/agency/radar" },
    ],
    now: WAR_ROOM_NOW,
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.scopeId), ["ecosystem", "company:brand-a"]);
  assert.equal(rows[0]?.radarCriticalCount, 1, "critical Radar incidents land on the aggregate row");
  assert.equal(rows[1]?.radarCriticalCount, 0, "incidents are never split onto brands they were not scoped to");
  assert.ok(rows[0]!.criticalAlertCount > rows[1]!.criticalAlertCount);
});

test("War room decisions queue ranks critical Radar first and carries evidence + a drill-in for every call", async () => {
  const { buildWarRoomDecisions } = await warRoom();
  const base = await seedProfile("war-room-queue", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const profile = {
    ...base,
    objectives: [
      { id: "obj-1", title: "Land three retainers", metric: "Retainers", currentValue: 1, targetValue: 3, unit: "", status: "at-risk" as const },
      { id: "obj-2", title: "Publish the offer", metric: "Offers", currentValue: 1, targetValue: 1, unit: "", status: "on-track" as const },
    ],
  };
  const decisions = buildWarRoomDecisions({
    scopes: [await warRoomScope({ profile, actuals: { monthRevenueCents: 100_000, leadCount: 2 } })],
    incidents: [{ id: "radar-1", severity: "critical", title: "Finance evidence stalled", detail: "No paid invoice in 21 days.", evidence: ["Last payment 21 days ago"], href: "/portal/agency/radar" }],
    now: WAR_ROOM_NOW,
  });

  assert.equal(decisions[0]?.kind, "radar-critical", "a critical incident outranks every planning call");
  assert.equal(decisions[0]?.href, "/portal/agency/radar");
  const kinds = decisions.map(item => item.kind);
  assert.ok(kinds.indexOf("revenue-gap") < kinds.indexOf("objective-risk"), "an off-track target outranks an at-risk objective");
  assert.ok(decisions.every(item => item.evidence.length > 0), "every decision shows its evidence");
  assert.ok(decisions.every(item => item.actionLabel.length > 0));

  const revenue = decisions.find(item => item.kind === "revenue-gap")!;
  assert.equal(revenue.severity, "critical");
  assert.equal(revenue.section, "projections");
  assert.equal(revenue.scopeId, "ecosystem");
  assert.ok(revenue.evidence.some(item => /deal/.test(item)), "the revenue call states what closes the gap");
  assert.ok(revenue.evidence.some(item => /run rate/i.test(item)));

  const objective = decisions.find(item => item.kind === "objective-risk")!;
  assert.equal(objective.section, "objectives");
  assert.ok(objective.evidence.some(item => item.includes("Land three retainers")));
  assert.ok(!objective.evidence.some(item => item.includes("Publish the offer")), "only flagged objectives are raised");
});

test("War room decisions raise hire-now capacity as a critical call on the capacity section", async () => {
  const { buildWarRoomDecisions, buildBattlefield, scopeHiringAnalysis } = await warRoom();
  const base = await seedProfile("war-room-capacity", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const profile = { ...base, capacity: { ...base.capacity, weeklyAvailableHours: 5 } };
  const scope = await warRoomScope({ profile, actuals: { monthRevenueCents: 480_000, activeClients: 40, clientsNeedingAttention: 6, leadCount: 12 } });

  const hiring = scopeHiringAnalysis(scope);
  assert.ok(hiring.hireNowCount > 0, "40 active clients against 5 weekly hours crosses the guardrail");

  const [row] = buildBattlefield({ scopes: [scope], now: WAR_ROOM_NOW });
  assert.equal(row?.hireNowCount, hiring.hireNowCount);
  assert.ok((row?.criticalAlertCount ?? 0) >= hiring.hireNowCount);

  const decisions = buildWarRoomDecisions({ scopes: [scope], now: WAR_ROOM_NOW });
  const hire = decisions.find(item => item.kind === "hire-now");
  assert.ok(hire, "a crossed hiring guardrail becomes a decision");
  assert.equal(hire?.severity, "critical");
  assert.equal(hire?.section, "capacity");
  assert.ok(hire!.evidence.length > 0);
  assert.ok(decisions.filter(item => item.kind === "hire-now").length <= 2, "the queue names the top constraints, not every area");
});

test("War room decisions stay quiet when the plan is holding", async () => {
  const { buildWarRoomDecisions } = await warRoom();
  const base = await seedProfile("war-room-quiet", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const decisions = buildWarRoomDecisions({
    scopes: [await warRoomScope({ profile: base, actuals: { monthRevenueCents: 600_000 } })],
    now: WAR_ROOM_NOW,
  });
  assert.equal(decisions.filter(item => item.kind === "revenue-gap").length, 0);
  assert.equal(decisions.filter(item => item.kind === "objective-risk").length, 0);
  assert.equal(decisions.filter(item => item.kind === "doctrine-gap").length, 0);
});

test("War room raises a doctrine gap when a scope has no recorded direction", async () => {
  const { buildWarRoomDecisions } = await warRoom();
  const base = await seedProfile("war-room-doctrine", { monthlyRevenueTargetCents: 1_000_000, mission: "", vision: "" });
  const decisions = buildWarRoomDecisions({
    scopes: [await warRoomScope({ profile: base, actuals: { monthRevenueCents: 600_000 } })],
    now: WAR_ROOM_NOW,
  });
  const doctrine = decisions.find(item => item.kind === "doctrine-gap")!;
  assert.equal(doctrine.severity, "watch");
  assert.equal(doctrine.section, "strategy");
  assert.equal(decisions.at(-1)?.kind, "doctrine-gap", "a set-up nudge never outranks a live call");
});

test("War room pulse reports five readings against their own targets with honest fallbacks", async () => {
  const { buildWarRoomPulse } = await warRoom();
  const base = await seedProfile("war-room-pulse", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const pulse = buildWarRoomPulse({
    scope: await warRoomScope({ profile: base, actuals: { monthRevenueCents: 100_000, leadCount: 2, monthlyRevenueGrowthPercent: null } }),
    now: WAR_ROOM_NOW,
  });
  assert.deepEqual(pulse.map(item => item.id), ["revenue", "growth", "pipeline", "capacity", "health"]);

  const revenue = pulse.find(item => item.id === "revenue")!;
  assert.equal(revenue.state, "critical");
  assert.ok(revenue.target.includes("target"));
  assert.ok(/run rate/i.test(revenue.detail));

  const growth = pulse.find(item => item.id === "growth")!;
  assert.equal(growth.state, "learning", "no month-on-month history is Learning, not a pass");
  assert.equal(growth.value, "—");
  assert.equal(growth.deviationPercent, null);

  const pipeline = pulse.find(item => item.id === "pipeline")!;
  const gapCents = base.monthlyRevenueTargetCents - 100_000;
  const dealsNeeded = Math.ceil(gapCents / base.averageDealValueCents);
  const callsNeeded = Math.ceil(dealsNeeded / (base.salesCallCloseRatePercent / 100));
  assert.equal(pipeline.target, `${callsNeeded} needed`, "pipeline cover is measured against the calls the gap needs");
  assert.equal(pipeline.value, "2 open");
  assert.equal(pipeline.state, "critical");

  const blind = buildWarRoomPulse({
    scope: await warRoomScope({ profile: base, actuals: { monthRevenueCents: 0, financeConnected: false } }),
    now: WAR_ROOM_NOW,
  });
  assert.equal(blind.find(item => item.id === "revenue")?.state, "learning");
  assert.equal(blind.find(item => item.id === "revenue")?.value, "—");
});

test("War room pulse reads growth and capacity against their retained assumptions", async () => {
  const { buildWarRoomPulse } = await warRoom();
  const base = await seedProfile("war-room-pulse-growth", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const profile = {
    ...base,
    projection: { ...base.projection, targetMonthlyGrowthPercent: 10 },
    capacity: { ...base.capacity, weeklyAvailableHours: 5, hiringTriggerPercent: 85 },
  };
  const pulse = buildWarRoomPulse({
    scope: await warRoomScope({ profile, actuals: { monthRevenueCents: 600_000, monthlyRevenueGrowthPercent: 14, activeClients: 40 } }),
    now: WAR_ROOM_NOW,
  });
  const growth = pulse.find(item => item.id === "growth")!;
  assert.equal(growth.state, "ahead");
  assert.equal(growth.deviationPercent, 4, "deviation is measured against the retained target-case assumption");
  assert.equal(growth.target, "+10% target");

  const capacity = pulse.find(item => item.id === "capacity")!;
  assert.equal(capacity.state, "critical");
  assert.equal(capacity.target, "85% guardrail");
  assert.ok((capacity.deviationPercent ?? 0) > 0);
});

test("War room capital watch matches the retained register and opens the capital section", async () => {
  const { capitalWatchCount, buildWarRoomDecisions } = await warRoom();
  const base = await seedProfile("war-room-capital", { monthlyRevenueTargetCents: 1_000_000, mission: "Trade", vision: "Grow" });
  const clean = {
    ...base,
    capital: {
      ...base.capital,
      shareClasses: [{ id: "ordinary", name: "Ordinary", authorisedShares: 100, nominalValueCents: 100, votingRightsPerShare: 1, dividendEligible: true }],
      shareholders: [{ id: "holder-ed", name: "Ed Hallam", kind: "founder" as const, shareClassId: "ordinary", shares: 100, investedCents: 10_000, status: "active" as const, director: true, boardSeat: true }],
      transactions: [],
      investments: [],
      dividends: [],
      decisions: [],
    },
  };
  assert.equal(capitalWatchCount(clean, WAR_ROOM_NOW), 0);
  assert.equal(buildWarRoomDecisions({ scopes: [await warRoomScope({ profile: clean, actuals: { monthRevenueCents: 600_000 } })], now: WAR_ROOM_NOW }).filter(item => item.kind === "capital-watch").length, 0);

  const exposed = {
    ...clean,
    capital: {
      ...clean.capital,
      transactions: [{ id: "capital-1", kind: "capital-contribution" as const, title: "Founder capital", shareholderId: "holder-ed", amountCents: 10_000, currency: "GBP", shares: 100, occurredAt: WAR_ROOM_NOW, status: "completed" as const }],
      decisions: [{ id: "decision-1", title: "Approve reserve policy", kind: "board" as const, status: "draft" as const, summary: "Pending.", votesForPercent: 0, votesAgainstPercent: 0, relatedRecordIds: [] }],
    },
  };
  assert.equal(capitalWatchCount(exposed, WAR_ROOM_NOW), 2, "an unapproved transaction and a draft decision each need a call");
  const capital = buildWarRoomDecisions({ scopes: [await warRoomScope({ profile: exposed, actuals: { monthRevenueCents: 600_000 } })], now: WAR_ROOM_NOW }).find(item => item.kind === "capital-watch")!;
  assert.equal(capital.section, "capital");
  assert.equal(capital.severity, "warning");
});

test("The war room is the Battle Table front door and the 10 planning sections are demoted, not deleted", () => {
  const table = read("src/app/portal/agency/_BattleTableWorkspace.tsx");
  const dashboard = read("src/app/portal/agency/_DashboardCommandCenter.tsx");

  assert.match(table, /initialSection = "warroom"/);
  assert.match(table, /section === "warroom" \? <WarRoom/);
  assert.match(table, /Back to the war room/);
  assert.match(table, /Zone 1 · The battlefield/);
  assert.match(table, /Zone 2 · Decisions needing you/);
  assert.match(table, /Zone 3 · Live pulse/);
  assert.match(table, /Every company at a glance/);
  assert.match(table, /What needs your call right now/);
  assert.match(table, /Set-up and planning · drill in below/);
  assert.match(table, /buildBattlefield|buildWarRoomDecisions|buildWarRoomPulse/);

  // Demoted, not deleted: every planning section is still reachable.
  for (const station of ["Strategic plot", "KPI intelligence", "Direction", "Projections", "Objectives", "Capacity", "Plans", "Capital & ownership", "Reviews", "Executive systems"]) {
    assert.match(table, new RegExp(station));
  }

  // Deep links into a planning section keep working; anything else lands on the
  // war room rather than a form.
  assert.match(dashboard, /"warroom", "overview", "intelligence", "strategy", "projections", "objectives", "capacity", "plans", "capital", "reviews", "systems"/);
  assert.match(dashboard, /: "warroom";/);
  assert.match(dashboard, /radarIncidents=\{warRoomIncidents\}/);
});
