// "The client gets the project we attach to them — and nothing else."
//
// Ed's model for phase 18, in his words: the internal workspace comes with the
// client and is where WE edit their portal; attaching a website product (or
// toggling it on) gives the client access to a build workspace; "but they
// cannot edit our internal CRM portal, just the project we attach to them."
//
// `src/server/clientProjectAccess.ts` is the one place that implements it, so
// this is where the rule is pinned. The tests are mostly about what must NOT
// happen, because that is the half a client discovers on their own website.

import { withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { GET as devProjectsGet } from "../src/app/api/portal/dev/projects/route";
import {
  BUILDABLE_PORTAL_TEMPLATE_KEYS,
  CLIENT_PROJECT_EDITOR_CAPABILITIES,
  clientAttachedProjects,
  clientWorkspacePeople,
  grantClientProjectAccess,
  revokeClientProjectAccess,
} from "../src/server/clientProjectAccess";
import { resolveAccess } from "../src/server/accessControl";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { issueSession } from "../src/lib/server/auth/auth";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { flushPendingWrites, getState, reset } from "../src/server/storage";

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  await reset();
  const agency = createAgency({ name: "Client Access", slug: `client-access-${Date.now()}` });
  const owner = createUser({
    email: `owner-${agency.id}@client-access.test`,
    name: "Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "owner-test-password",
  });
  const client = createClient(agency.id, { name: "Bright Coffee", stage: "live" });
  const rival = createClient(agency.id, { name: "Rival Coffee", stage: "live" });

  const clientOwner = createUser({
    email: `owner-${agency.id}@bright.test`,
    name: "Bright Owner",
    role: "client-owner",
    agencyId: agency.id,
    clientId: client.id,
    password: "bright-owner-password",
  });
  const clientStaff = createUser({
    email: `staff-${agency.id}@bright.test`,
    name: "Bright Staff",
    role: "client-staff",
    agencyId: agency.id,
    clientId: client.id,
    password: "bright-staff-password",
  });
  // Their customer — a different audience entirely, and deliberately not part
  // of "the client's people".
  const endCustomer = createUser({
    email: `customer-${agency.id}@bright.test`,
    name: "A Bright customer",
    role: "end-customer",
    agencyId: agency.id,
    clientId: client.id,
    password: "bright-customer-password",
  });

  const theirSite = saveDevProject({
    agencyId: agency.id,
    name: "Bright Coffee website",
    repository: "acme/bright-coffee",
    ref: "main",
    clientId: client.id,
    actorUserId: owner.id,
  });
  const rivalSite = saveDevProject({
    agencyId: agency.id,
    name: "Rival Coffee website",
    repository: "acme/rival-coffee",
    ref: "main",
    clientId: rival.id,
    actorUserId: owner.id,
  });
  // AquaCRM's own internal project: attached to NO client. This is the thing
  // that must never become reachable.
  const internalCrm = saveDevProject({
    agencyId: agency.id,
    name: "AquaCRM itself",
    repository: "edstorm987/aquacrm",
    ref: "main",
    actorUserId: owner.id,
  });

  await flushPendingWrites();
  return { agencyId: agency.id, owner, client, rival, clientOwner, clientStaff, endCustomer, theirSite, rivalSite, internalCrm };
}

function capabilitiesFor(home: Fixture, userId: string, projectId: string): string[] {
  const state = getState();
  return resolveAccess(state, {
    userId,
    agencyId: home.agencyId,
    resourceAgencyId: home.agencyId,
    resourceClientId: state.users
      ? Object.values(state.users).find(user => user.id === userId)?.clientId
      : undefined,
    scope: { kind: "project", id: projectId },
    environment: "live",
  }, state).capabilities;
}

let home: Fixture;
beforeEach(async () => { home = await fixture(); });

describe("attaching a project hands the client exactly that project", () => {
  it("grants the client's OWN people — owner and staff, not their customers", async () => {
    const result = await grantClientProjectAccess({
      agencyId: home.agencyId,
      clientId: home.client.id,
      projectId: home.theirSite.id,
      actorUserId: home.owner.id,
    });

    const granted = new Set(result.grants.map(grant => grant.userId));
    assert.ok(granted.has(home.clientOwner.id), "the client owner works on their own site");
    assert.ok(granted.has(home.clientStaff.id), "so does their staff");
    assert.ok(!granted.has(home.endCustomer.id), "their CUSTOMER is a different audience entirely");
    assert.ok(!granted.has(home.owner.id), "the agency owner needs no grant — they have the baseline");

    assert.deepEqual(
      clientWorkspacePeople(home.client.id).map(person => person.role).sort(),
      ["client-owner", "client-staff"],
    );
  });

  it("gives them a working editor on their own site", async () => {
    await grantClientProjectAccess({
      agencyId: home.agencyId,
      clientId: home.client.id,
      projectId: home.theirSite.id,
      actorUserId: home.owner.id,
    });
    const capabilities = capabilitiesFor(home, home.clientOwner.id, home.theirSite.id);
    for (const capability of CLIENT_PROJECT_EDITOR_CAPABILITIES) {
      assert.ok(capabilities.includes(capability), `expected ${capability}`);
    }
  });

  it("does NOT hand over publishing, deploys, the AI or the local process", async () => {
    await grantClientProjectAccess({
      agencyId: home.agencyId,
      clientId: home.client.id,
      projectId: home.theirSite.id,
      actorUserId: home.owner.id,
    });
    const capabilities = capabilitiesFor(home, home.clientOwner.id, home.theirSite.id);
    for (const withheld of [
      "project.publish",
      "project.pull-request",
      "project.deploy",
      "project.ai",
      "project.manage",
      "project.connection.manage",
      "dev.project.run_local",
      "dev.project.logs",
      "element.development.explorer.view",
    ]) {
      assert.ok(
        !capabilities.includes(withheld),
        `${withheld} must be a deliberate extra, never part of "attach a website"`,
      );
    }
  });

  it("writes ONLY a project scope — never agency, client or workspace authority", async () => {
    const result = await grantClientProjectAccess({
      agencyId: home.agencyId,
      clientId: home.client.id,
      projectId: home.theirSite.id,
      actorUserId: home.owner.id,
    });
    for (const grant of result.grants) {
      assert.equal(grant.scope.kind, "project", "a client's authority is one project at a time");
      assert.equal(grant.scope.id, home.theirSite.id);
    }
  });

  it("is idempotent — attaching a second product does not multiply grants", async () => {
    const first = await grantClientProjectAccess({
      agencyId: home.agencyId, clientId: home.client.id, projectId: home.theirSite.id, actorUserId: home.owner.id,
    });
    const second = await grantClientProjectAccess({
      agencyId: home.agencyId, clientId: home.client.id, projectId: home.theirSite.id, actorUserId: home.owner.id,
    });
    assert.deepEqual(
      first.grants.map(grant => grant.id).sort(),
      second.grants.map(grant => grant.id).sort(),
      "the same grant comes back rather than a duplicate",
    );
  });
});

describe("what a client can never be given", () => {
  it("refuses to grant AquaCRM's own internal project — it is attached to nobody", async () => {
    await assert.rejects(
      () => grantClientProjectAccess({
        agencyId: home.agencyId,
        clientId: home.client.id,
        projectId: home.internalCrm.id,
        actorUserId: home.owner.id,
      }),
      (error: Error & { code?: string; status?: number }) => {
        assert.equal(error.code, "project_not_attached_to_client");
        assert.match(error.message, /Attach the project to this client/);
        return true;
      },
    );
    assert.deepEqual(
      Object.values(getState().accessGrants).filter(grant => grant.userId === home.clientOwner.id),
      [],
      "a refused attachment writes nothing at all",
    );
  });

  it("refuses to grant ANOTHER client's site", async () => {
    await assert.rejects(
      () => grantClientProjectAccess({
        agencyId: home.agencyId,
        clientId: home.client.id,
        projectId: home.rivalSite.id,
        actorUserId: home.owner.id,
      }),
      (error: Error & { code?: string }) => error.code === "project_not_attached_to_client",
    );
  });

  it("answers a foreign project id the same way as an invented one", async () => {
    const other = createAgency({ name: "Someone else", slug: `someone-else-${Date.now()}` });
    const foreign = saveDevProject({
      agencyId: other.id, name: "Their thing", actorUserId: home.owner.id,
    });
    await flushPendingWrites();

    const codes: string[] = [];
    for (const projectId of [foreign.id, "devproj_invented"]) {
      await grantClientProjectAccess({
        agencyId: home.agencyId, clientId: home.client.id, projectId, actorUserId: home.owner.id,
      }).catch((error: Error & { code?: string }) => { codes.push(error.code ?? "?"); });
    }
    assert.deepEqual(codes, ["dev_project_not_found", "dev_project_not_found"],
      "tenant first: a foreign project does not exist, exactly like an invented one");
  });

  it("even WITH their grant, the client's project list is only their own site", async () => {
    await grantClientProjectAccess({
      agencyId: home.agencyId, clientId: home.client.id, projectId: home.theirSite.id, actorUserId: home.owner.id,
    });
    const token = issueSession({
      userId: home.clientOwner.id,
      email: home.clientOwner.email,
      role: home.clientOwner.role,
      agencyId: home.agencyId,
      agencyIds: [home.agencyId],
      activeAgencyId: home.agencyId,
      clientId: home.client.id,
      sessionRev: home.clientOwner.sessionRev ?? 0,
    });
    const response = await withSession(token, () => devProjectsGet(
      new NextRequest("http://localhost/api/portal/dev/projects"),
    ));
    const body = await response.json() as { projects?: { id: string }[] };
    assert.deepEqual((body.projects ?? []).map(project => project.id), [home.theirSite.id]);
    const payload = JSON.stringify(body);
    assert.ok(!payload.includes("aquacrm"), "AquaCRM's own repository is not theirs to see");
    assert.ok(!payload.includes("rival-coffee"), "and neither is a rival's");
  });
});

describe("the toggle goes off again", () => {
  it("revokes the client's access and leaves the project attached", async () => {
    await grantClientProjectAccess({
      agencyId: home.agencyId, clientId: home.client.id, projectId: home.theirSite.id, actorUserId: home.owner.id,
    });
    assert.ok(capabilitiesFor(home, home.clientOwner.id, home.theirSite.id).length > 0);

    const revoked = await revokeClientProjectAccess({
      agencyId: home.agencyId, clientId: home.client.id, projectId: home.theirSite.id, actorUserId: home.owner.id,
    });
    assert.equal(revoked.length, 2, "both the client's people lose it");
    // Everything the grant conferred is gone immediately — no waiting for a
    // session to expire. What remains is `access.request` alone: asking grants
    // nothing, so the right to ask is never taken away. That is exactly the
    // "can request extra access" half of the client journey.
    assert.deepEqual(
      capabilitiesFor(home, home.clientOwner.id, home.theirSite.id),
      ["access.request"],
      "the editor is withdrawn, but they can still ask for it back",
    );
    assert.equal(
      getState().devProjects[home.theirSite.id]?.clientId,
      home.client.id,
      "the project stays attached — withdrawing access is not detaching the work",
    );
  });
});

describe("the attachment vocabulary", () => {
  it("knows which products mean there is something to build", () => {
    assert.deepEqual([...BUILDABLE_PORTAL_TEMPLATE_KEYS], ["website", "custom-software"]);
  });

  it("lists exactly the projects attached to a client", () => {
    assert.deepEqual(
      clientAttachedProjects(home.agencyId, home.client.id).map(project => project.id),
      [home.theirSite.id],
    );
    assert.deepEqual(
      clientAttachedProjects(home.agencyId, home.rival.id).map(project => project.id),
      [home.rivalSite.id],
    );
  });
});
