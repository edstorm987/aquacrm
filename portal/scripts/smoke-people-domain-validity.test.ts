import assert from "node:assert/strict";
import { before, test } from "node:test";

import { withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "people-domain-validity-smoke-secret";

type PeopleRoute = typeof import("../src/app/api/portal/people/route");

let postPeople: PeopleRoute["POST"];
let NextRequestCtor: typeof import("next/server").NextRequest;
let agencyId = "";
let token = "";
let cookieName = "";
let ownerUserId = "";

before(async () => {
  ({ NextRequest: NextRequestCtor } = await import("next/server"));
  const storage = await import("../src/server/storage");
  const tenants = await import("../src/server/tenants");
  const auth = await import("../src/lib/server/auth/auth");
  await storage.ensureHydrated();
  await storage.reset();
  const users = await import("../src/server/users");
  const agency = tenants.createAgency({ name: "People validity proof" });
  agencyId = agency.id;
  // A REAL user, not a made-up id. `getSession()` re-resolves the session's user
  // on every call and refuses a cookie whose subject does not exist, whose role
  // has changed, or whose `sessionRev` is stale — the central fresh-session
  // boundary (issues #22). A hand-minted id used to sail through it; it now 401s,
  // correctly, so the fixture has to seed the people it claims to be.
  const owner = users.createUser({
    email: "owner@people-validity.test",
    name: "People Validity Owner",
    role: "agency-owner",
    agencyId,
    password: "people-validity-pass-phrase",
  });
  ownerUserId = owner.id;
  token = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: "agency-owner",
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: owner.sessionRev ?? 0,
  });
  cookieName = auth.SESSION_COOKIE_NAME;
  ({ POST: postPeople } = await import("../src/app/api/portal/people/route"));
});

async function action(body: Record<string, unknown>, sessionToken = token) {
  const response = await withSession(sessionToken, () => postPeople(new NextRequestCtor("http://localhost/api/portal/people", {
    method: "POST",
    headers: {
      cookie: `${cookieName}=${sessionToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })));
  return {
    status: response.status,
    body: await response.json() as Record<string, unknown>,
  };
}

async function createEmployee(email = "person@example.test") {
  const result = await action({
    action: "create-employee",
    name: "Example Person",
    email,
    title: "Designer",
    employmentType: "full-time",
    weeklyHours: 37.5,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.employee as { id: string; email: string; status: string };
}

test("real People route rejects invalid complete employee state without mutation", async () => {
  const { getState } = await import("../src/server/storage");
  const employee = await createEmployee();
  const invalidPatches: Array<[string, Record<string, unknown>, RegExp]> = [
    ["status", { status: "teleported" }, /status/i],
    ["employment type", { employmentType: "temporary-ish" }, /employment type/i],
    ["pay basis", { payBasis: "crypto-only" }, /pay basis/i],
    ["weekly hours below zero", { weeklyHours: -1 }, /weekly hours/i],
    ["weekly hours above the week", { weeklyHours: 169 }, /weekly hours/i],
    ["non-numeric weekly hours", { weeklyHours: "many" }, /weekly hours/i],
    ["holiday allowance", { holidayAllowanceDays: -2 }, /holiday allowance/i],
    ["negative pay", { basePayMinor: -1 }, /base pay/i],
    ["fractional minor units", { basePayMinor: 100.5 }, /base pay/i],
    ["unsupported currency", { currency: "ZZZ" }, /currency/i],
    ["negative start date", { startDate: -1 }, /start date/i],
    ["end before start", { startDate: 2_000, endDate: 1_000 }, /end date/i],
    ["probation after employment", { startDate: 1_000, endDate: 2_000, probationEndsAt: 3_000 }, /probation/i],
  ];

  for (const [label, patch, message] of invalidPatches) {
    const beforeRecord = structuredClone(getState().peopleEmployees[employee.id]);
    const result = await action({ action: "update-employee", employeeId: employee.id, ...patch });
    assert.equal(result.status, 400, `${label}: ${JSON.stringify(result.body)}`);
    assert.match(String(result.body.error), message, label);
    assert.deepEqual(getState().peopleEmployees[employee.id], beforeRecord, `${label} mutated the employee`);
  }

  const invalidCreate = await action({
    action: "create-employee",
    name: "Invalid Hire",
    email: "invalid-hire@example.test",
    title: "Tester",
    employmentType: "teleported",
  });
  assert.equal(invalidCreate.status, 400);
  assert.match(String(invalidCreate.body.error), /employment type/i);
  assert.equal(Object.values(getState().peopleEmployees).filter(item => item.email === "invalid-hire@example.test").length, 0);
});

test("partial employee updates preserve every omitted profile field", async () => {
  const { getState } = await import("../src/server/storage");
  const employee = await createEmployee("partial-update@example.test");
  const seed = await action({
    action: "update-employee",
    employeeId: employee.id,
    phone: "+44 20 7946 0958",
    department: "Design",
    employmentType: "part-time",
    status: "active",
    startDate: 1_000,
    probationEndsAt: 1_500,
    endDate: 2_000,
    weeklyHours: 24,
    holidayAllowanceDays: 18,
    payBasis: "hourly",
    basePayMinor: 4_500,
    currency: "EUR",
    targetRole: "Senior Designer",
    growthPathNote: "Own the design system.",
  });
  assert.equal(seed.status, 200, JSON.stringify(seed.body));
  const before = structuredClone(getState().peopleEmployees[employee.id]);

  const partial = await action({ action: "update-employee", employeeId: employee.id, title: "Product Designer" });
  assert.equal(partial.status, 200, JSON.stringify(partial.body));
  const after = getState().peopleEmployees[employee.id];
  assert.equal(after.title, "Product Designer");
  for (const key of [
    "phone",
    "department",
    "employmentType",
    "status",
    "startDate",
    "probationEndsAt",
    "endDate",
    "weeklyHours",
    "holidayAllowanceDays",
    "payBasis",
    "basePayMinor",
    "currency",
    "targetRole",
    "growthPathNote",
  ] as const) {
    assert.deepEqual(after[key], before[key], `${key} was cleared by an unrelated patch`);
  }
});

test("commission and onboarding payloads validate complete nested records", async () => {
  const { getState } = await import("../src/server/storage");
  const employee = await createEmployee("nested@example.test");
  const beforeRecord = structuredClone(getState().peopleEmployees[employee.id]);

  const badCommission = await action({
    action: "update-commission",
    employeeId: employee.id,
    commissionRules: [{
      id: "bad-rule",
      label: "Impossible",
      basis: "moonshots",
      ratePercent: -5,
      cadence: "sometimes",
      status: "active-ish",
    }],
  });
  assert.equal(badCommission.status, 400);
  assert.match(String(badCommission.body.error), /commission rule 1/i);
  assert.deepEqual(getState().peopleEmployees[employee.id], beforeRecord);

  const nonArrayCommission = await action({
    action: "update-commission",
    employeeId: employee.id,
    commissionRules: { id: "not-an-array" },
  });
  assert.equal(nonArrayCommission.status, 400);
  assert.match(String(nonArrayCommission.body.error), /commission rules must be an array/i);
  assert.deepEqual(getState().peopleEmployees[employee.id], beforeRecord);

  const badOnboarding = await action({
    action: "update-onboarding",
    employeeId: employee.id,
    onboardingItems: [{
      id: "bad-item",
      label: "Impossible",
      status: "vanished",
      owner: "nobody",
      dueAt: -1,
    }],
  });
  assert.equal(badOnboarding.status, 400);
  assert.match(String(badOnboarding.body.error), /onboarding item 1/i);
  assert.deepEqual(getState().peopleEmployees[employee.id], beforeRecord);

  const nonArrayOnboarding = await action({
    action: "update-onboarding",
    employeeId: employee.id,
    onboardingItems: "not-an-array",
  });
  assert.equal(nonArrayOnboarding.status, 400);
  assert.match(String(nonArrayOnboarding.body.error), /onboarding items must be an array/i);
  assert.deepEqual(getState().peopleEmployees[employee.id], beforeRecord);

  getState().peopleEmployees[employee.id].commissionRules = [{ id: "legacy-bad-rule" }] as never;
  const malformedLegacy = structuredClone(getState().peopleEmployees[employee.id]);
  const unrelatedPatch = await action({ action: "update-employee", employeeId: employee.id, title: "Still blocked" });
  assert.equal(unrelatedPatch.status, 400);
  assert.match(String(unrelatedPatch.body.error), /commission rule 1/i);
  assert.deepEqual(getState().peopleEmployees[employee.id], malformedLegacy, "complete post-patch validation must not mutate legacy-invalid state");

  const validCommission = await action({
    action: "update-commission",
    employeeId: employee.id,
    commissionRules: [{
      id: "revenue-rule",
      label: "Revenue share",
      basis: "revenue",
      ratePercent: 12.5,
      cadence: "monthly",
      status: "active",
      thresholdMinor: 50_000,
    }],
  });
  assert.equal(validCommission.status, 200, JSON.stringify(validCommission.body));

  const validOnboarding = await action({
    action: "update-onboarding",
    employeeId: employee.id,
    onboardingItems: [{
      id: "signed-handbook",
      label: "Read the handbook",
      status: "done",
      owner: "employee",
      completedAt: 1_000,
      evidence: "Acknowledged",
    }],
  });
  assert.equal(validOnboarding.status, 200, JSON.stringify(validOnboarding.body));
  assert.equal(getState().peopleEmployees[employee.id].commissionRules[0]?.ratePercent, 12.5);
  assert.equal(getState().peopleEmployees[employee.id].onboardingItems[0]?.status, "done");
});

test("leave, shift and training enums and dates fail closed through the real route", async () => {
  const { getState } = await import("../src/server/storage");
  const employee = await createEmployee("schedule@example.test");
  const people = await import("../src/server/people");
  const auth = await import("../src/lib/server/auth/auth");
  const users = await import("../src/server/users");
  const staff = users.createUser({
    email: employee.email,
    name: "People Validity Staff",
    role: "agency-staff",
    agencyId,
    password: "people-validity-pass-phrase",
  });
  people.updatePeopleEmployee(agencyId, employee.id, { userId: staff.id, status: "active" }, ownerUserId);
  const staffToken = auth.issueSession({
    userId: staff.id,
    email: staff.email,
    role: "agency-staff",
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: staff.sessionRev ?? 0,
  });
  const badLeave = await action({ action: "request-leave", type: "space-leave", startsOn: "2026-09-01", endsOn: "2026-09-02" }, staffToken);
  assert.equal(badLeave.status, 400);
  assert.match(String(badLeave.body.error), /leave type/i);
  assert.equal(Object.keys(getState().peopleLeaveRequests).length, 0);

  const badLeaveDate = await action({ action: "request-leave", type: "annual", startsOn: "2026-02-31", endsOn: "2026-03-02" }, staffToken);
  assert.equal(badLeaveDate.status, 400);
  assert.match(String(badLeaveDate.body.error), /real calendar dates/i);
  assert.equal(Object.keys(getState().peopleLeaveRequests).length, 0);

  const leave = people.createPeopleLeaveRequest({ agencyId, employeeId: employee.id, type: "annual", startsOn: "2026-09-01", endsOn: "2026-09-02" });
  const beforeLeave = structuredClone(getState().peopleLeaveRequests[leave.id]);
  const badDecision = await action({ action: "decide-leave", requestId: leave.id, status: "maybe" });
  assert.equal(badDecision.status, 400);
  assert.match(String(badDecision.body.error), /leave decision status/i);
  assert.deepEqual(getState().peopleLeaveRequests[leave.id], beforeLeave);

  const badShift = await action({ action: "save-shift", employeeId: employee.id, title: "Invalid shift", startsAt: "tomorrow", endsAt: 2_000, status: "published" });
  assert.equal(badShift.status, 400);
  assert.match(String(badShift.body.error), /shift start/i);
  assert.equal(Object.keys(getState().peopleShifts).length, 0);

  const badShiftStatus = await action({ action: "save-shift", employeeId: employee.id, title: "Invalid shift", startsAt: 1_000, endsAt: 2_000, status: "teleported" });
  assert.equal(badShiftStatus.status, 400);
  assert.match(String(badShiftStatus.body.error), /shift status/i);
  assert.equal(Object.keys(getState().peopleShifts).length, 0);

  const badTraining = await action({ action: "save-training", employeeId: employee.id, title: "Invalid training", dueAt: "later", status: "assigned" });
  assert.equal(badTraining.status, 400);
  assert.match(String(badTraining.body.error), /training due date/i);
  assert.equal(Object.keys(getState().peopleTrainingAssignments).length, 0);

  const badTrainingStatus = await action({ action: "save-training", employeeId: employee.id, title: "Invalid training", dueAt: 3_000, status: "invented" });
  assert.equal(badTrainingStatus.status, 400);
  assert.match(String(badTrainingStatus.body.error), /training status/i);
  assert.equal(Object.keys(getState().peopleTrainingAssignments).length, 0);

  const validShift = await action({ action: "save-shift", employeeId: employee.id, title: "Studio", startsAt: 1_000, endsAt: 2_000, status: "published" });
  const validTraining = await action({ action: "save-training", employeeId: employee.id, title: "Data handling", dueAt: 3_000, status: "assigned" });
  assert.equal(validShift.status, 200, JSON.stringify(validShift.body));
  assert.equal(validTraining.status, 200, JSON.stringify(validTraining.body));
});

test("canonical employee email has one live owner and can be reused only after alumni", async () => {
  const { getState } = await import("../src/server/storage");
  const first = await createEmployee("  Duplicate@Example.Test  ");
  assert.equal(first.email, "duplicate@example.test");

  const duplicate = await action({
    action: "create-employee",
    name: "Duplicate Person",
    email: "DUPLICATE@example.test",
    title: "Writer",
    employmentType: "part-time",
  });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
  assert.match(String(duplicate.body.error), /already belongs/i);
  assert.equal(Object.values(getState().peopleEmployees).filter(item => item.email === "duplicate@example.test").length, 1);

  const retire = await action({ action: "update-employee", employeeId: first.id, status: "alumni" });
  assert.equal(retire.status, 200, JSON.stringify(retire.body));
  const replacement = await action({
    action: "create-employee",
    name: "Replacement Person",
    email: " duplicate@example.test ",
    title: "Writer",
    employmentType: "part-time",
  });
  assert.equal(replacement.status, 201, JSON.stringify(replacement.body));
  const owners = Object.values(getState().peopleEmployees).filter(item => item.email === "duplicate@example.test");
  assert.equal(owners.filter(item => item.status !== "alumni").length, 1);
  assert.equal(owners.filter(item => item.status === "alumni").length, 1);
});
