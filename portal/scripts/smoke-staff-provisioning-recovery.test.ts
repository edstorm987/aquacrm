process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createPortalStaffProvisioningRuntime,
  runStaffProvisioning,
  StaffProvisioningRecoveryError,
  type StaffProvisioningIntent,
  type StaffProvisioningRuntime,
} from "../src/server/staffProvisioning";
import type { ServerUser, StaffProvisioningOperation } from "../src/server/types";
import { ensureHydrated, getState, reset } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createPeopleApplication, createPeopleEmployee, getPeopleApplication } from "../src/server/people";
import { getUser } from "../src/server/users";

interface DurableWorld {
  operations: Record<string, StaffProvisioningOperation>;
  users: Record<string, ServerUser>;
  targetUserIds: Record<string, string>;
}

function emptyWorld(): DurableWorld {
  return { operations: {}, users: {}, targetUserIds: {} };
}

function canonical(email: string): string {
  return email.trim().toLowerCase();
}

class FakeProvider {
  readonly identities = new Map<string, { id: string; operationId: string; profileReady: boolean }>();
  creates = 0;
  adoptions = 0;
  failCreateOnce = false;
  failProfileOnce = false;

  async provision(input: { operationId: string; email: string }): Promise<{ id: string }> {
    const email = canonical(input.email);
    const existing = this.identities.get(email);
    if (existing) {
      if (existing.operationId !== input.operationId) throw new Error("unrelated provider identity");
      this.adoptions += 1;
      existing.profileReady = true;
      return { id: existing.id };
    }
    if (this.failCreateOnce) {
      this.failCreateOnce = false;
      throw new Error("provider create failed");
    }
    const identity = { id: `provider_${this.creates + 1}`, operationId: input.operationId, profileReady: true };
    this.creates += 1;
    this.identities.set(email, identity);
    if (this.failProfileOnce) {
      this.failProfileOnce = false;
      identity.profileReady = false;
      throw new Error("provider profile failed after identity create");
    }
    return { id: identity.id };
  }
}

interface AttemptOptions {
  failFlushAt?: number;
  failLocalCreate?: boolean;
  failTargetLink?: boolean;
}

function attemptRuntime(
  durable: DurableWorld,
  provider: FakeProvider,
  options: AttemptOptions = {},
): StaffProvisioningRuntime {
  let working = structuredClone(durable);
  let flushCount = 0;
  let flushWedged = false;
  let localCreateFailed = false;
  let targetLinkFailed = false;
  return {
    readOperation: key => working.operations[key],
    writeOperation: (key, operation) => { working.operations[key] = structuredClone(operation); },
    async flush() {
      flushCount += 1;
      if (flushWedged || options.failFlushAt === flushCount) {
        flushWedged = true;
        throw new Error(`durable flush ${flushCount} failed`);
      }
      durable.operations = structuredClone(working.operations);
      durable.users = structuredClone(working.users);
      durable.targetUserIds = structuredClone(working.targetUserIds);
    },
    provisionProvider: input => provider.provision(input),
    findLocalUser: email => working.users[canonical(email)] ?? null,
    createLocalUser(input) {
      if (options.failLocalCreate && !localCreateFailed) {
        localCreateFailed = true;
        throw new Error("local user create failed");
      }
      const user: ServerUser = {
        id: input.id,
        email: canonical(input.email),
        username: input.username,
        name: input.name,
        passwordHash: "test-only-hash",
        role: input.role,
        agencyIds: [input.agencyId],
        agencyId: input.agencyId,
        mustChangePassword: input.mustChangePassword,
        createdAt: 1,
        updatedAt: 1,
      };
      working.users[user.email] = user;
      return user;
    },
    finaliseTarget(intent, user) {
      if (options.failTargetLink && !targetLinkFailed) {
        targetLinkFailed = true;
        throw new Error("employee link failed");
      }
      const id = intent.target.kind === "candidate"
        ? intent.target.applicationId
        : intent.target.kind === "employee" ? intent.target.employeeId : canonical(intent.email);
      const existing = working.targetUserIds[id];
      if (existing && existing !== user.id) throw new Error("target linked elsewhere");
      working.targetUserIds[id] = user.id;
      return {};
    },
    resolveResult(operation) {
      return { user: working.users[operation.email] ?? null };
    },
    now: () => 1_000 + flushCount,
  };
}

function intent(): StaffProvisioningIntent {
  return {
    agencyId: "agency_recovery",
    actorUserId: "owner_recovery",
    email: "New.Staff@example.test",
    name: "New Staff",
    password: "temporary-password-123",
    localRole: "agency-staff",
    mustChangePassword: true,
    target: { kind: "employee", employeeId: "employee_recovery" },
  };
}

test("normal completion and a lost-response replay converge on one provider and local identity", async () => {
  const durable = emptyWorld();
  const provider = new FakeProvider();
  const first = await runStaffProvisioning(intent(), attemptRuntime(durable, provider));
  const replay = await runStaffProvisioning(intent(), attemptRuntime(durable, provider));
  assert.equal(first.operation.stage, "complete");
  assert.equal(replay.user.id, first.user.id);
  assert.equal(replay.resumed, true);
  assert.equal(provider.creates, 1);
  assert.equal(provider.adoptions, 0, "a completed replay must not touch the provider again");
  assert.equal(Object.keys(durable.users).length, 1);
  assert.equal(durable.targetUserIds.employee_recovery, first.user.id);
  assert.doesNotMatch(JSON.stringify(durable.operations), /temporary-password-123/);
});

test("provider create failure is retryable in the same process", async () => {
  const durable = emptyWorld();
  const provider = new FakeProvider();
  provider.failCreateOnce = true;
  const runtime = attemptRuntime(durable, provider);
  await assert.rejects(runStaffProvisioning(intent(), runtime), error => {
    assert.ok(error instanceof StaffProvisioningRecoveryError);
    assert.equal(error.retryable, true);
    assert.equal(error.stage, "intent-recorded");
    assert.match(error.message, /provider create failed/);
    return true;
  });
  const result = await runStaffProvisioning(intent(), runtime);
  assert.equal(result.operation.stage, "complete");
  assert.equal(result.operation.attempts, 2);
  assert.equal(provider.creates, 1);
});

test("a fresh process adopts the exact marked provider identity after profile failure", async () => {
  const durable = emptyWorld();
  const provider = new FakeProvider();
  provider.failProfileOnce = true;
  await assert.rejects(runStaffProvisioning(intent(), attemptRuntime(durable, provider)), /profile failed/);
  const result = await runStaffProvisioning(intent(), attemptRuntime(durable, provider));
  assert.equal(result.operation.stage, "complete");
  assert.equal(provider.creates, 1);
  assert.equal(provider.adoptions, 1);
  assert.equal(provider.identities.get(canonical(intent().email))?.profileReady, true);
});

test("fresh-process retries recover local-user and employee-link failures", async t => {
  for (const [label, options] of [
    ["local user", { failLocalCreate: true }],
    ["employee link", { failTargetLink: true }],
  ] as const) {
    await t.test(label, async () => {
      const durable = emptyWorld();
      const provider = new FakeProvider();
      await assert.rejects(runStaffProvisioning(intent(), attemptRuntime(durable, provider, options)));
      const result = await runStaffProvisioning(intent(), attemptRuntime(durable, provider));
      assert.equal(result.operation.stage, "complete");
      assert.equal(Object.keys(durable.users).length, 1);
      assert.equal(durable.targetUserIds.employee_recovery, result.user.id);
      assert.equal(provider.creates, 1);
    });
  }
});

test("every post-provider durable boundary resumes from its last acknowledged step in a fresh process", async t => {
  for (const failFlushAt of [2, 3, 4, 5]) {
    await t.test(`flush ${failFlushAt}`, async () => {
      const durable = emptyWorld();
      const provider = new FakeProvider();
      await assert.rejects(
        runStaffProvisioning(intent(), attemptRuntime(durable, provider, { failFlushAt })),
        /durable flush/,
      );
      const result = await runStaffProvisioning(intent(), attemptRuntime(durable, provider));
      assert.equal(result.operation.stage, "complete");
      assert.equal(provider.creates, 1, "retry created a second remote identity");
      assert.equal(Object.keys(durable.users).length, 1, "retry created a second local identity");
      assert.equal(durable.targetUserIds.employee_recovery, result.user.id);
    });
  }
});

test("different intent cannot take over the email-scoped operation", async () => {
  const durable = emptyWorld();
  const provider = new FakeProvider();
  await runStaffProvisioning(intent(), attemptRuntime(durable, provider));
  await assert.rejects(runStaffProvisioning({
    ...intent(),
    localRole: "agency-manager",
  }, attemptRuntime(durable, provider)), /different details/);
});

test("the real PortalState adapter converges Agency Users, candidate hire and employee activation", async () => {
  await ensureHydrated();
  await reset();
  const agency = createAgency({ name: "Provisioning recovery", ownerEmail: "owner@provisioning.test" });
  const provider = new FakeProvider();
  const runtime = createPortalStaffProvisioningRuntime({
    provisionProvider: input => provider.provision(input),
  });

  const agencyUser = await runStaffProvisioning({
    agencyId: agency.id,
    actorUserId: "owner",
    email: "manager@provisioning.test",
    name: "Recovery Manager",
    password: "manager-password-123",
    localRole: "agency-manager",
    target: { kind: "agency-user", companyIds: [] },
  }, runtime);
  assert.equal(getUser("manager@provisioning.test")?.id, agencyUser.user.id);

  const application = createPeopleApplication({
    agencyId: agency.id,
    name: "Candidate Recovery",
    email: "candidate@provisioning.test",
    roleInterest: "Developer",
    employmentPreference: "full-time",
    cv: { name: "cv.pdf", mimeType: "application/pdf", size: 10, dataUrl: "data:application/pdf;base64,AA==" },
  }).application;
  const hired = await runStaffProvisioning({
    agencyId: agency.id,
    actorUserId: "owner",
    email: application.email,
    name: application.name,
    password: "candidate-password-123",
    localRole: "agency-staff",
    mustChangePassword: true,
    target: {
      kind: "candidate",
      applicationId: application.id,
      title: "Developer",
      employmentType: "full-time",
    },
  }, runtime);
  assert.equal(getPeopleApplication(agency.id, application.id)?.employeeId, hired.employee?.id);
  assert.equal(hired.employee?.userId, hired.user.id);

  const employee = createPeopleEmployee({
    agencyId: agency.id,
    actorUserId: "owner",
    name: "Employee Recovery",
    email: "employee@provisioning.test",
    title: "Operator",
  });
  const activated = await runStaffProvisioning({
    agencyId: agency.id,
    actorUserId: "owner",
    email: employee.email,
    name: employee.name,
    password: "employee-password-123",
    localRole: "agency-staff",
    mustChangePassword: true,
    target: { kind: "employee", employeeId: employee.id },
  }, runtime);
  assert.equal(activated.employee?.userId, activated.user.id);
  assert.equal(Object.values(getState().staffProvisioningOperations).filter(row => row.stage === "complete").length, 3);
  assert.equal(provider.creates, 3);
});

test("all three mounted staff creation paths use the shared coordinator", () => {
  const peopleRoute = readFileSync("src/app/api/portal/people/route.ts", "utf8");
  const usersRoute = readFileSync("src/app/api/portal/agency/users/route.ts", "utf8");
  assert.equal((peopleRoute.match(/runStaffProvisioning\(/g) ?? []).length, 2);
  assert.match(peopleRoute, /kind: "candidate"/);
  assert.match(peopleRoute, /kind: "employee"/);
  assert.match(usersRoute, /runStaffProvisioning\(/);
  assert.doesNotMatch(usersRoute, /provisionSupabaseIdentity/);
  assert.doesNotMatch(peopleRoute, /provisionSupabaseIdentity/);
});
