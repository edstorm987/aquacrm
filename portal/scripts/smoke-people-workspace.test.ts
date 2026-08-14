import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

process.env.PORTAL_BACKEND = "memory";

describe("People lifecycle and employee workspace", () => {
  before(async () => {
    const { ensureHydrated, reset } = await import("../src/server/storage");
    await ensureHydrated();
    await reset();
  });

  it("retains one identity from application into employee onboarding", async () => {
    const people = await import("../src/server/people");
    const { getState } = await import("../src/server/storage");
    const created = people.createPeopleApplication({
      agencyId: "agency_people",
      name: "Alex Example",
      email: "alex@example.test",
      roleInterest: "Photographer",
      employmentPreference: "freelancer",
      cv: { fileName: "alex.pdf", contentType: "application/pdf", size: 1200, storageProvider: "local", storageKey: "alex.pdf" },
    });
    assert.equal(people.getPeopleApplicationByToken(created.statusToken)?.id, created.application.id);
    const employee = people.createPeopleEmployee({
      agencyId: "agency_people",
      actorUserId: "owner_1",
      applicationId: created.application.id,
      name: created.application.name,
      email: created.application.email,
      title: "Photographer",
      employmentType: "freelancer",
    });
    assert.equal(getState().peopleApplications[created.application.id].employeeId, employee.id);
    assert.equal(getState().peopleApplications[created.application.id].stage, "onboarding");
    assert.equal(employee.workspaceAccess[0].stationId, "my-day");
    assert.ok(employee.onboardingItems.length >= 7);
  });

  it("normalises station access and never allows My Day to disappear", async () => {
    const people = await import("../src/server/people");
    const access = people.normalizePeopleAccess([
      { stationId: "pay", mode: "view", order: 9 },
      { stationId: "actions", mode: "edit", order: 8 },
      { stationId: "actions", mode: "view", order: 7 },
    ]);
    assert.deepEqual(access.map(item => item.stationId), ["my-day", "pay", "actions"]);
    assert.equal(access[2].mode, "edit");
  });

  it("calculates weekday leave and scopes employee snapshots", async () => {
    const people = await import("../src/server/people");
    const employee = people.listPeopleEmployees("agency_people")[0];
    people.updatePeopleEmployee("agency_people", employee.id, { userId: "user_alex", status: "active" }, "owner_1");
    const leave = people.createPeopleLeaveRequest({ agencyId: "agency_people", employeeId: employee.id, type: "annual", startsOn: "2026-08-14", endsOn: "2026-08-17" });
    assert.equal(leave.days, 2);
    const snapshot = people.employeePeopleSnapshot("agency_people", "user_alex");
    assert.equal(snapshot?.employee.id, employee.id);
    assert.equal(snapshot?.leaveRequests.length, 1);
    assert.equal(people.canUsePeopleStation("agency_people", "user_alex", "pay", true), false);
    assert.equal(people.canUsePeopleStation("agency_people", "user_alex", "actions", true), true);
  });
});
