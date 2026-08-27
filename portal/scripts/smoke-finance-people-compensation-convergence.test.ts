import assert from "node:assert/strict";
import { before, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

let agencyId = "";
let actor = "";
let employeeId = "";
let profileId = "";
let install: { id: string; agencyId: string; pluginId: string; enabled: boolean; config: Record<string, unknown>; features: Record<string, boolean> };
let storage: ReturnType<typeof import("../src/lib/server/pluginStorage").makePluginStorage>;

before(async () => {
  const state = await import("../src/server/storage");
  const tenants = await import("../src/server/tenants");
  const users = await import("../src/server/users");
  const installs = await import("../src/server/pluginInstalls");
  const pluginStorage = await import("../src/lib/server/pluginStorage");
  const people = await import("../src/server/people");
  await state.ensureHydrated();
  await state.reset();
  const agency = tenants.createAgency({ name: "Compensation convergence" });
  agencyId = agency.id;
  actor = users.createUser({
    email: "owner@compensation-convergence.test",
    name: "Owner",
    role: "agency-owner",
    agencyId,
    password: "compensation-convergence-password",
  }).id;
  install = installs.upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId },
    enabled: true,
    config: { defaultCurrency: "gbp" },
    features: {},
    installedBy: actor,
  });
  storage = pluginStorage.makePluginStorage(install.id);
  const employee = people.createPeopleEmployee({
    agencyId,
    actorUserId: actor,
    name: "Taylor Morgan",
    email: "taylor@compensation-convergence.test",
    title: "Operations Lead",
    department: "Operations",
    employmentType: "full-time",
    startDate: Date.parse("2026-01-05T12:00:00Z"),
    weeklyHours: 37.5,
  });
  employeeId = employee.id;
  people.updatePeopleEmployee(agencyId, employeeId, {
    payBasis: "salary",
    basePayMinor: 5_000_000,
    currency: "GBP",
    commissionRules: [
      { id: "commission_fixed", label: "Monthly performance", basis: "fixed-bonus", fixedAmountMinor: 10_000, cadence: "monthly", status: "active" },
      { id: "commission_variable", label: "Growth", basis: "revenue", ratePercent: 5, cadence: "quarterly", status: "active" },
    ],
  }, actor);

  const finance = await import("../src/built-ins/modules/agency-finance/src/server");
  const ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const compensation = await import("../src/built-ins/runtime/foundation-adapters/agencyFinanceCompensation");
  finance.registerAgencyFinanceFoundation({
    tenant: ports.tenantPort as never,
    user: ports.userPort as never,
    activity: ports.activityPort as never,
    events: ports.eventBusPort,
    pluginInstalls: ports.pluginInstallStorePort as never,
    compensation: compensation.agencyFinanceCompensationTermsPort,
  });
});

function ctx() {
  return { agencyId, actor, install, storage, services: {} } as never;
}

function request(method: "GET" | "POST" | "PATCH", body?: unknown, id?: string): Request {
  const url = new URL("http://localhost/api/portal/agency-finance/operations/profiles");
  if (id) url.searchParams.set("id", id);
  return new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("mounted Finance creates one linked profile from canonical People terms", async () => {
  const handlers = await import("../src/built-ins/modules/agency-finance/src/api/handlers-operations");
  const people = await import("../src/server/people");
  const response = await handlers.compensationProfilesHandler(request("POST", {
    staffId: employeeId,
    name: "Stale Finance Name",
    email: "stale@finance.test",
    payeeType: "employee",
    departmentName: "Finance override",
    currency: "eur",
    rateBasis: "hourly",
    baseRateCents: 3_600_000,
    unitsPerWeek: 10,
    employerCostPercent: 15,
    annualBonusTargetCents: 999_999,
    payFrequency: "monthly",
  }), ctx());
  assert.equal(response.status, 201);
  const body = await response.json() as { profile: {
    id: string; name: string; email?: string; currency: string; rateBasis: string; baseRateCents: number;
    annualBonusTargetCents: number; activeCommissionRuleCount?: number; hasVariableCommission?: boolean;
    canonicalTermsSource?: string;
  } };
  profileId = body.profile.id;
  assert.equal(body.profile.name, "Taylor Morgan");
  assert.equal(body.profile.email, "taylor@compensation-convergence.test");
  assert.equal(body.profile.currency, "gbp");
  assert.equal(body.profile.rateBasis, "annual");
  assert.equal(body.profile.baseRateCents, 5_000_000);
  assert.equal(body.profile.annualBonusTargetCents, 120_000);
  assert.equal(body.profile.activeCommissionRuleCount, 2);
  assert.equal(body.profile.hasVariableCommission, true);
  assert.equal(body.profile.canonicalTermsSource, "people");
  assert.equal(people.getPeopleEmployee(agencyId, employeeId)?.compensationProfileId, profileId);

  const duplicate = await handlers.compensationProfilesHandler(request("POST", {
    staffId: employeeId,
    name: "Duplicate",
    payeeType: "employee",
    currency: "gbp",
    rateBasis: "annual",
    baseRateCents: 1,
  }), ctx());
  assert.equal(duplicate.status, 422);
  assert.match((await duplicate.json() as { error: string }).error, /already linked/i);
});

test("People edits immediately drive Finance projections while Finance-only controls survive", async () => {
  const handlers = await import("../src/built-ins/modules/agency-finance/src/api/handlers-operations");
  const people = await import("../src/server/people");
  people.updatePeopleEmployee(agencyId, employeeId, {
    payBasis: "hourly",
    basePayMinor: 3_200,
    currency: "EUR",
    weeklyHours: 30,
    commissionRules: [
      { id: "commission_quarterly", label: "Quarterly quality", basis: "fixed-bonus", fixedAmountMinor: 25_000, cadence: "quarterly", status: "active" },
    ],
  }, actor);

  const listed = await handlers.compensationProfilesHandler(request("GET"), ctx());
  const profile = (await listed.json() as { profiles: Array<Record<string, unknown>> }).profiles.find(row => row.id === profileId);
  assert.ok(profile);
  assert.equal(profile.currency, "eur");
  assert.equal(profile.rateBasis, "hourly");
  assert.equal(profile.baseRateCents, 3_200);
  assert.equal(profile.unitsPerWeek, 30);
  assert.equal(profile.annualBonusTargetCents, 100_000);

  const patched = await handlers.compensationProfilesHandler(request("PATCH", {
    currency: "usd",
    rateBasis: "annual",
    baseRateCents: 4_200_000,
    unitsPerWeek: 5,
    annualBonusTargetCents: 777_777,
    employerCostPercent: 18,
    payFrequency: "fortnightly",
  }, profileId), ctx());
  assert.equal(patched.status, 200);
  const updated = (await patched.json() as { profile: Record<string, unknown> }).profile;
  assert.equal(updated.currency, "eur");
  assert.equal(updated.rateBasis, "hourly");
  assert.equal(updated.baseRateCents, 3_200);
  assert.equal(updated.unitsPerWeek, 30);
  assert.equal(updated.annualBonusTargetCents, 100_000);
  assert.equal(updated.employerCostPercent, 18);
  assert.equal(updated.payFrequency, "fortnightly");
  const canonical = people.getPeopleEmployee(agencyId, employeeId);
  assert.equal(canonical?.basePayMinor, 3_200);
  assert.equal(canonical?.currency, "EUR");
  assert.equal(canonical?.commissionRules[0]?.fixedAmountMinor, 25_000);
});

test("Finance projection and payment draft use the same canonical People terms", async () => {
  const finance = await import("../src/built-ins/modules/agency-finance/src/server");
  const costs = await import("../src/built-ins/modules/agency-finance/src/lib/workforceCosts");
  const handlers = await import("../src/built-ins/modules/agency-finance/src/api/handlers-operations");
  const container = finance.containerFor({ agencyId, storage, install: install as never });
  const profile = await container.operations.getCompensationProfile(profileId);
  assert.ok(profile);
  const projection = costs.compensationCostProjection(profile);
  assert.equal(projection.monthlyBaseCents, 416_000);
  assert.equal(projection.monthlyBonusTargetCents, 8_333);
  assert.equal(projection.monthlyEmployerCostCents, 74_880);
  const draft = costs.compensationPaymentDraftAmounts(profile);
  assert.deepEqual(draft, { grossCents: 424_333, employerCostCents: 74_880 });

  const wrongCurrency = await handlers.compensationPaymentsHandler(new Request("http://localhost/api/portal/agency-finance/operations/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId, kind: "wages", currency: "gbp", ...draft }),
  }), ctx());
  assert.equal(wrongCurrency.status, 422);

  const payment = await handlers.compensationPaymentsHandler(new Request("http://localhost/api/portal/agency-finance/operations/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId, kind: "wages", currency: "eur", ...draft, idempotencyKey: "canonical-monthly-draft" }),
  }), ctx());
  assert.equal(payment.status, 201);
  const created = (await payment.json() as { payment: { currency: string; grossCents: number; employerCostCents: number } }).payment;
  assert.equal(created.currency, "eur");
  assert.equal(created.grossCents, 424_333);
  assert.equal(created.employerCostCents, 74_880);
});
