import assert from "node:assert/strict";
import { before, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

let agencyId = "";
let actor = "";
let install: { id: string; agencyId: string; pluginId: string; enabled: boolean; config: Record<string, unknown>; features: Record<string, boolean> };
let storage: ReturnType<typeof import("../src/lib/server/pluginStorage").makePluginStorage>;
let container: ReturnType<typeof import("../src/built-ins/modules/agency-hr/src/server").containerFor>;

before(async () => {
  const state = await import("../src/server/storage");
  const tenants = await import("../src/server/tenants");
  const users = await import("../src/server/users");
  const installs = await import("../src/server/pluginInstalls");
  const pluginStorage = await import("../src/lib/server/pluginStorage");
  await state.ensureHydrated();
  await state.reset();
  const agency = tenants.createAgency({ name: "Agency HR convergence" });
  agencyId = agency.id;
  actor = users.createUser({
    email: "owner@hr-convergence.test",
    name: "Owner",
    role: "agency-owner",
    agencyId,
    password: "people-convergence-password",
  }).id;
  install = installs.upsertInstall({
    pluginId: "agency-hr",
    scope: { agencyId },
    enabled: true,
    config: {},
    features: {},
    installedBy: actor,
  });
  storage = pluginStorage.makePluginStorage(install.id);
  const hr = await import("../src/built-ins/modules/agency-hr/src/server");
  const ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const workforce = await import("../src/built-ins/runtime/foundation-adapters/agencyHrWorkforce");
  hr.registerAgencyHrFoundation({
    tenant: ports.tenantPort,
    activity: ports.activityPort as never,
    events: ports.eventBusPort,
    pluginInstalls: ports.pluginInstallStorePort as never,
    workforce: workforce.agencyHrWorkforcePort,
  });
  container = hr.containerFor({ agencyId, storage });
  await container.departments.seedDefaults(actor);
  await container.roles.seedDefaults(actor);
});

function ctx() {
  return {
    agencyId,
    actor,
    install,
    storage,
    services: {},
  } as never;
}

test("mounted Agency HR staff handlers create and update the canonical People employee", async () => {
  const handlers = await import("../src/built-ins/modules/agency-hr/src/api/handlers");
  const people = await import("../src/server/people");
  const engineering = (await container.departments.list()).find(row => row.name === "Engineering");
  assert.ok(engineering);

  const createdResponse = await handlers.createStaffHandler(new Request("http://localhost/api/portal/agency-hr/staff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Riley Chen",
      email: "RILEY@hr-convergence.test",
      role: "agency-staff",
      title: "Staff Engineer",
      joinedAt: "2026-04-01",
      departmentId: engineering.id,
      agencyEmployee: true,
    }),
  }), ctx());
  assert.equal(createdResponse.status, 201);
  const createdBody = await createdResponse.json() as { staff: { id: string; email: string; departmentId?: string } };
  const employee = people.getPeopleEmployee(agencyId, createdBody.staff.id);
  assert.ok(employee, "the HR id must resolve directly in canonical People");
  assert.equal(employee.email, "riley@hr-convergence.test");
  assert.equal(employee.department, "Engineering");
  assert.equal(createdBody.staff.departmentId, engineering.id);
  assert.equal(await storage.get("staff/index"), undefined, "mounted HR must not create its legacy staff index");

  people.updatePeopleEmployee(agencyId, employee.id, { title: "Principal Engineer", status: "suspended" }, actor);
  const readFromHr = await container.staff.get(employee.id);
  assert.equal(readFromHr?.title, "Principal Engineer");
  assert.equal(readFromHr?.status, "suspended");

  const updated = await container.staff.update(employee.id, { title: "Engineering Lead", status: "active" }, actor);
  assert.equal(updated?.id, employee.id);
  assert.equal(people.getPeopleEmployee(agencyId, employee.id)?.title, "Engineering Lead");
  assert.equal(people.getPeopleEmployee(agencyId, employee.id)?.status, "active");
});

test("People and Agency HR leave share one id, status and decision in both directions", async () => {
  const people = await import("../src/server/people");
  const employee = people.listPeopleEmployees(agencyId).find(row => row.email === "riley@hr-convergence.test");
  assert.ok(employee);

  const requested = await container.leave.request({
    staffId: employee.id,
    type: "pto",
    startDate: "2026-09-01",
    endDate: "2026-09-03",
    reason: "A short break",
  }, actor);
  const canonical = people.listPeopleLeaveRequests(agencyId).find(row => row.id === requested.id);
  assert.ok(canonical);
  assert.equal(canonical.employeeId, employee.id);
  assert.equal(canonical.type, "annual");
  assert.equal(await storage.get("leave/index"), undefined, "mounted HR must not create its legacy leave index");

  people.decidePeopleLeaveRequest({ agencyId, requestId: requested.id, status: "rejected", actorUserId: actor, note: "Coverage" });
  assert.equal((await container.leave.get(requested.id))?.status, "rejected");
  assert.equal((await container.leave.get(requested.id))?.decisionNote, "Coverage");

  const second = people.createPeopleLeaveRequest({
    agencyId,
    employeeId: employee.id,
    type: "sick",
    startsOn: "2026-10-05",
    endsOn: "2026-10-05",
  });
  assert.equal((await container.leave.get(second.id))?.staffId, employee.id);
  const approved = await container.leave.decide(second.id, { status: "approved", approvedBy: actor });
  assert.equal(approved?.id, second.id);
  assert.equal(people.listPeopleLeaveRequests(agencyId).find(row => row.id === second.id)?.status, "approved");
  assert.equal(people.getPeopleEmployee(agencyId, employee.id)?.status, "leave");
});

test("legacy HR metadata maps onto People ids while Finance excludes every legacy staff row", async () => {
  const people = await import("../src/server/people");
  const finance = await import("../src/lib/server/finance/financeWorkforce");
  const design = (await container.departments.list()).find(row => row.name === "Design");
  const role = (await container.roles.list()).find(row => row.label === "Designer");
  assert.ok(design);
  assert.ok(role);

  const canonical = people.createPeopleEmployee({
    agencyId,
    actorUserId: actor,
    name: "Morgan Lee",
    email: "morgan@hr-convergence.test",
    title: "Designer",
    employmentType: "full-time",
  });
  const legacyId = "stf_legacy_morgan";
  const unmatchedId = "stf_legacy_only";
  await storage.set("staff/index", [legacyId, unmatchedId]);
  await storage.set(`staff:${legacyId}`, {
    id: legacyId,
    agencyId,
    name: "Morgan Lee",
    email: "MORGAN@hr-convergence.test",
    role: "agency-staff",
    title: "Old title",
    joinedAt: "2026-01-01",
    status: "active",
    departmentId: design.id,
    customRoleId: role.id,
    agencyEmployee: true,
    assignments: [{ clientId: "client_legacy", roleId: role.id, scope: "view" }],
    createdAt: 1,
    updatedAt: 1,
  });
  await storage.set(`staff:${unmatchedId}`, {
    id: unmatchedId,
    agencyId,
    name: "Legacy Only",
    email: "legacy-only@hr-convergence.test",
    role: "agency-staff",
    title: "Should not survive",
    joinedAt: "2026-01-01",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  });

  const projected = await container.staff.get(canonical.id);
  assert.equal(projected?.id, canonical.id, "metadata must attach to the People id, never the legacy id");
  assert.equal(projected?.departmentId, design.id);
  assert.equal(projected?.customRoleId, role.id);
  assert.equal(projected?.assignments?.[0]?.clientId, "client_legacy");
  assert.equal((await container.staff.list()).some(row => row.id === legacyId || row.id === unmatchedId), false);

  const options = await finance.listFinanceWorkforceOptions(agencyId);
  assert.ok(options.staff.some(row => row.id === canonical.id));
  assert.equal(options.staff.some(row => row.id === legacyId || row.id === unmatchedId), false);
  assert.ok(options.departments.some(row => row.id === design.id), "Agency HR department metadata should remain available to Finance");
});
