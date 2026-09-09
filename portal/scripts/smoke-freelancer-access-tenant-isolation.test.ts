// Freelancer-access per-job override — tenant isolation (API authz audit, 2026-09-09).
//
// WHY THIS FILE EXISTS (confirmed by the per-route API authorization audit):
// POST /api/portal/freelancer-access accepts a `jobId` and writes/clears
// state.freelancerJobOverride[jobId] — a store keyed GLOBALLY by jobId. The
// handler gated with requireRole(["agency-owner","agency-manager"]) +
// requireCurrentWorkspaceElementAccess("staff","staff.people","manage"), which
// prove the caller is SOME agency owner/manager but NOT that the job belongs to
// their agency. So an owner/manager of Agency A could set or clear the freelancer-
// access policy governing Agency B's job — flip clientIdentity to "named"
// (leaking B's client identity to B's contractor), reveal the fee, or enable
// upload/message actions. resolveFreelancerAccess() lets a job override WIN over
// the agency default, so the tampering actually governs B's contractor's view.
//
// The fix is a per-route ownership guard: the job must be one THIS agency owns
// (the same set GET exposes via listFreelancerJobsForConfig) or the route 404s.
// This drives the REAL POST handler across a tenant boundary — it FAILS against
// the pre-fix route (which wrote any jobId) and passes with the guard.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "freelancer-access-tenant-secret";

import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { NextRequest } from "next/server";

import { POST } from "../src/app/api/portal/freelancer-access/route";
import { issueSession } from "../src/lib/server/auth/auth";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { createPeopleEmployee, savePeopleFreelancerJob } from "../src/server/people";
import { getFreelancerJobOverride, setFreelancerJobOverride } from "../src/server/freelancerWorkspace";
import { reset, flushPendingWrites } from "../src/server/storage";

function ownerToken(userId: string, email: string, agencyId: string): string {
  return issueSession({
    userId, email, role: "agency-owner",
    agencyId, agencyIds: [agencyId], activeAgencyId: agencyId, sessionRev: 0,
  });
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/portal/freelancer-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedAgency(tag: string) {
  const stamp = `${tag}-${Date.now()}-${Math.round(performance.now())}`;
  const agency = createAgency({ name: `Agency ${tag}`, slug: `agency-${stamp}` });
  const owner = createUser({
    email: `owner-${stamp}@example.test`, name: `Owner ${tag}`,
    role: "agency-owner", agencyId: agency.id, password: "owner-test-password-123",
  });
  const employee = createPeopleEmployee({
    agencyId: agency.id, actorUserId: owner.id,
    name: `Freelancer ${tag}`, email: `free-${stamp}@example.test`, title: "Contractor",
  });
  const job = savePeopleFreelancerJob({
    agencyId: agency.id, actorUserId: owner.id, employeeId: employee.id, title: `Job ${tag}`,
  });
  return { agency, owner, employee, job, token: ownerToken(owner.id, owner.email, agency.id) };
}

describe("freelancer-access per-job override is tenant-scoped", () => {
  let A: Awaited<ReturnType<typeof seedAgency>>;
  let B: Awaited<ReturnType<typeof seedAgency>>;

  before(async () => {
    await reset();
    A = await seedAgency("A");
    B = await seedAgency("B");
    await flushPendingWrites();
  });

  it("an owner CAN set an override for a job their OWN agency owns", async () => {
    const res = await withSession(A.token, () => POST(post({ jobId: A.job.id, config: { clientIdentity: "named", showFee: true } })));
    assert.equal(res.status, 200, "own-agency override must be allowed");
    assert.ok(getFreelancerJobOverride(A.job.id), "the override was written for A's own job");
  });

  it("an owner CANNOT set an override for ANOTHER agency's job (cross-tenant IDOR closed)", async () => {
    assert.equal(getFreelancerJobOverride(B.job.id), null, "precondition: B has no override");
    const res = await withSession(A.token, () => POST(post({
      jobId: B.job.id,
      config: { clientIdentity: "named", showFee: true, actions: { upload: true, message: true } },
    })));
    assert.equal(res.status, 404, "A must not be able to write B's freelancer-access policy");
    assert.equal(getFreelancerJobOverride(B.job.id), null, "B's freelancer policy must be untouched");
  });

  it("an owner CANNOT clear ANOTHER agency's existing override", async () => {
    // B legitimately holds its own override (set here directly at the data layer).
    setFreelancerJobOverride(B.job.id, { clientIdentity: "anonymous" });
    assert.ok(getFreelancerJobOverride(B.job.id), "precondition: B has an override");
    const res = await withSession(A.token, () => POST(post({ jobId: B.job.id, clear: true })));
    assert.equal(res.status, 404, "A must not be able to clear B's override");
    assert.ok(getFreelancerJobOverride(B.job.id), "B's override survives A's clear attempt");
  });
});
