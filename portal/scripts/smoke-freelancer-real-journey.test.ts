process.env.PORTAL_BACKEND = "memory";

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

import { POST as messagePOST } from "../src/app/api/portal/freelancer/message/route";
import { POST as submitPOST } from "../src/app/api/portal/freelancer/submit/route";
import { GET as workContentGET } from "../src/app/api/portal/freelancer/work/content/route";
import { POST as workPOST } from "../src/app/api/portal/freelancer/work/route";
import { issueSession, SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import { createFreelancer, inviteFreelancer } from "../src/server/freelancerAdmin";
import {
  freelancerWorkspace,
  saveFreelancerAccessConfig,
} from "../src/server/freelancerWorkspace";
import {
  addPeopleFreelancerDeliverable,
  listPeopleChannels,
  listPeopleMessages,
  savePeopleFreelancerJob,
} from "../src/server/people";
import { createPortalStaffProvisioningRuntime } from "../src/server/staffProvisioning";
import { ensureHydrated, getState, reset } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser, getUser, getUserById } from "../src/server/users";

const originalCwd = process.cwd();
const uploadCwd = mkdtempSync(join(tmpdir(), "aquacrm-freelancer-journey-"));
const ROOT = originalCwd;
type InviteDependencies = NonNullable<Parameters<typeof inviteFreelancer>[3]>;
type SendEmailInput = Parameters<NonNullable<InviteDependencies["sendEmail"]>>[0];

function request(path: string, token: string, init: RequestInit): NextRequest {
  const headers = new Headers(init.headers);
  headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  return new NextRequest(`http://localhost${path}`, { ...init, headers });
}

function sessionToken(user: { id: string; email: string; role: "agency-owner" | "freelancer"; agencyId: string; sessionRev?: number }): string {
  return issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: user.agencyId,
    agencyIds: [user.agencyId],
    activeAgencyId: user.agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
}

beforeEach(async () => {
  await ensureHydrated();
  await reset();
});

after(() => {
  process.chdir(originalCwd);
  rmSync(uploadCwd, { recursive: true, force: true });
});

test("real freelancer journey provisions once, invites, shares work, messages, uploads and submits", async () => {
  const agency = createAgency({ name: "Freelancer Journey", slug: "freelancer-journey" });
  const owner = createUser({
    email: "owner@freelancer-journey.test",
    password: "owner-password",
    name: "Agency Owner",
    role: "agency-owner",
    agencyId: agency.id,
  });

  const providerInputs: Array<{ email: string; profileRole: string }> = [];
  const deliveredEmails: Array<{ to: string; bodyText: string; externalRef: string }> = [];
  const runtime = createPortalStaffProvisioningRuntime({
    provisionProvider: async input => {
      providerInputs.push({ email: input.email, profileRole: input.profileRole });
      return { id: "provider_freelancer_1" };
    },
  });
  const sendEmail = async (input: SendEmailInput) => {
    deliveredEmails.push({ to: input.to, bodyText: input.bodyText, externalRef: input.externalRef });
    return { delivered: true, via: "resend" as const };
  };

  const invite = await inviteFreelancer(agency.id, owner.id, {
    name: "Fran Creator",
    email: "FRAN@example.test",
    title: "Motion Designer",
    origin: "http://localhost:3032/",
  }, { runtime, sendEmail, now: () => 1234 });

  assert.equal(invite.ok, true);
  assert.equal(invite.inviteDelivered, true);
  assert.match(invite.setupUrl ?? "", /^http:\/\/localhost:3032\/login\/reset\?token=/);
  assert.equal(providerInputs.length, 1);
  assert.deepEqual(providerInputs[0], { email: "fran@example.test", profileRole: "client" });
  assert.equal(deliveredEmails.length, 1);
  assert.equal(deliveredEmails[0]?.to, "fran@example.test");
  assert.match(deliveredEmails[0]?.bodyText ?? "", /Set your password/);

  const freelancer = getUser("fran@example.test");
  assert.ok(freelancer);
  assert.equal(freelancer.role, "freelancer");
  assert.equal(freelancer.mustChangePassword, true);
  const employee = invite.employeeId ? getState().peopleEmployees[invite.employeeId] : undefined;
  assert.ok(employee);
  assert.equal(employee.userId, freelancer.id);
  assert.equal(employee.employmentType, "freelancer");

  const replay = await inviteFreelancer(agency.id, owner.id, {
    name: "Fran Creator",
    email: "fran@example.test",
    title: "Motion Designer",
    origin: "http://localhost:3032",
  }, { runtime, sendEmail, now: () => 1235 });
  assert.equal(replay.ok, true);
  assert.equal(replay.resumed, true);
  assert.equal(replay.userId, freelancer.id);
  assert.equal(replay.employeeId, employee.id);
  assert.equal(providerInputs.length, 1, "a completed replay must not create a second provider identity");
  assert.equal(Object.values(getState().users).filter(user => user.email === freelancer.email).length, 1);

  const savedNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const deliveryFallback = await inviteFreelancer(agency.id, owner.id, {
      name: "Fran Creator",
      email: "fran@example.test",
      title: "Motion Designer",
      origin: "https://portal.example.test",
    }, {
      runtime,
      sendEmail: async () => ({ delivered: false, via: "unconfigured" }),
      now: () => 1236,
    });
    assert.equal(deliveryFallback.ok, true);
    assert.equal(deliveryFallback.inviteDelivered, false);
    assert.match(deliveryFallback.setupUrl ?? "", /^https:\/\/portal\.example\.test\/login\/reset\?token=/,
      "a production mail outage must still leave the authorised operator one usable setup path");
  } finally {
    if (savedNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnvironment;
  }

  const job = savePeopleFreelancerJob({
    agencyId: agency.id,
    actorUserId: owner.id,
    employeeId: employee.id,
    title: "Launch animation",
    brief: "Create the final product animation.",
    feeMinor: 125_000,
    currency: "GBP",
    dueOn: "2026-09-15",
    status: "active",
  });
  addPeopleFreelancerDeliverable({
    agencyId: agency.id,
    actorUserId: owner.id,
    jobId: job.id,
    name: "Storyboard",
    url: "https://files.example.test/storyboard",
  });
  assert.throws(() => addPeopleFreelancerDeliverable({
    agencyId: agency.id,
    actorUserId: owner.id,
    jobId: job.id,
    name: "Unsafe",
    url: "javascript:alert(1)",
  }), /http or https/);
  saveFreelancerAccessConfig(agency.id, {
    showFee: true,
    clientIdentity: "anonymised",
    showBrief: true,
    showDates: true,
    showDeliverables: true,
    showNotes: false,
    actions: { markSubmitted: true, upload: true, message: true },
  });

  let workspace = freelancerWorkspace(agency.id, freelancer.id);
  assert.ok(workspace);
  assert.equal(workspace.jobs.length, 1);
  assert.equal(workspace.jobs[0]?.deliverables?.[0]?.name, "Storyboard");
  assert.deepEqual(workspace.jobs[0]?.can, { markSubmitted: true, upload: true, message: true });

  const freelancerToken = sessionToken({ ...freelancer, role: "freelancer", agencyId: agency.id });
  const ownerToken = sessionToken({ ...owner, role: "agency-owner", agencyId: agency.id });
  const messageResponse = await messagePOST(request("/api/portal/freelancer/message", freelancerToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: job.id, message: "The first cut is ready." }),
  }));
  assert.equal(messageResponse.status, 201);
  const direct = listPeopleChannels(agency.id, owner.id).find(channel => channel.kind === "direct" && channel.memberUserIds.includes(freelancer.id));
  assert.ok(direct, "the agency owner receives the freelancer conversation in Team Chat");
  assert.match(listPeopleMessages(agency.id, direct.id)[0]?.body ?? "", /Launch animation: The first cut is ready/);

  const savedEnvironment = Object.fromEntries([
    "NODE_ENV", "VERCEL", "VERCEL_ENV", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN",
    "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  ].map(key => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  for (const key of Object.keys(savedEnvironment).filter(key => key !== "NODE_ENV")) delete process.env[key];
  process.chdir(uploadCwd);
  try {
    const form = new FormData();
    form.set("jobId", job.id);
    form.set("file", new File(["final-animation"], "final.txt", { type: "text/plain" }));
    const uploadResponse = await workPOST(request("/api/portal/freelancer/work", freelancerToken, { method: "POST", body: form }));
    assert.equal(uploadResponse.status, 201, await uploadResponse.clone().text());
    const uploaded = await uploadResponse.json() as { submission: { id: string; url: string } };

    const freelancerDownload = await workContentGET(request(uploaded.submission.url, freelancerToken, { method: "GET" }));
    assert.equal(freelancerDownload.status, 200);
    assert.equal(await freelancerDownload.text(), "final-animation");
    const agencyDownload = await workContentGET(request(uploaded.submission.url, ownerToken, { method: "GET" }));
    assert.equal(agencyDownload.status, 200, "the same-agency owner can receive submitted work");
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  workspace = freelancerWorkspace(agency.id, freelancer.id);
  assert.equal(workspace?.jobs[0]?.submissions[0]?.name, "final.txt");
  assert.doesNotMatch(JSON.stringify(workspace), /storageKey|freelancer-work\//, "the workspace never leaks private storage coordinates");

  const submitResponse = await submitPOST(request("/api/portal/freelancer/submit", freelancerToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: job.id }),
  }));
  assert.equal(submitResponse.status, 200);
  assert.equal(getState().peopleFreelancerJobs[job.id]?.status, "delivered");
  assert.equal(getUserById(freelancer.id)?.mustChangePassword, true, "setup remains mandatory until the password-reset flow completes");
});

test("a legacy local-only freelancer is adopted without duplicating its user or People record", async () => {
  const agency = createAgency({ name: "Legacy Freelancer", slug: "legacy-freelancer" });
  const owner = createUser({
    email: "owner@legacy-freelancer.test",
    password: "owner-password",
    name: "Agency Owner",
    role: "agency-owner",
    agencyId: agency.id,
  });
  const legacy = createFreelancer(agency.id, owner.id, {
    name: "Legacy Artist",
    email: "legacy@example.test",
    title: "Illustrator",
  });
  assert.equal(legacy.ok, true);
  const localBefore = getUser("legacy@example.test");
  assert.ok(localBefore && legacy.employeeId);

  let providerCalls = 0;
  const runtime = createPortalStaffProvisioningRuntime({
    provisionProvider: async input => {
      providerCalls += 1;
      assert.equal(input.profileRole, "client");
      return { id: "provider_legacy_freelancer" };
    },
  });
  const dependencies = {
    runtime,
    sendEmail: async () => ({ delivered: true, via: "resend" as const }),
    now: () => 2_000,
  };
  const input = {
    name: "Legacy Artist",
    email: "legacy@example.test",
    title: "Illustrator",
    origin: "https://portal.example.test",
  };
  const adopted = await inviteFreelancer(agency.id, owner.id, input, dependencies);
  const replay = await inviteFreelancer(agency.id, owner.id, input, dependencies);

  assert.equal(adopted.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.resumed, true);
  assert.equal(adopted.userId, localBefore.id);
  assert.equal(adopted.employeeId, legacy.employeeId);
  assert.equal(replay.userId, localBefore.id);
  assert.equal(replay.employeeId, legacy.employeeId);
  assert.equal(getUserById(localBefore.id)?.mustChangePassword, true);
  assert.equal(providerCalls, 1);
  assert.equal(Object.values(getState().users).filter(user => user.email === localBefore.email).length, 1);
  assert.equal(Object.values(getState().peopleEmployees).filter(employee => employee.email === localBefore.email).length, 1);
});

test("the mounted freelancer surfaces use the real invitation and shared-work APIs", () => {
  const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
  assert.match(read("src/app/api/portal/freelancers/route.ts"), /inviteFreelancer/);
  assert.match(read("src/app/portal/agency/freelancers/_FreelancerManager.tsx"), /Set-up email sent|setup link/i);
  assert.match(read("src/app/portal/agency/people/_PeopleCommand.tsx"), /add-freelancer-deliverable/);
  assert.match(read("src/app/portal/freelancer/_FreelancerJobActions.tsx"), /Upload work/);
  assert.match(read("src/app/portal/freelancer/_FreelancerMessages.tsx"), /freelancer\/message/);
  assert.match(read("src/app/portal/freelancer/page.tsx"), /Deliverables shared with you/);
});
