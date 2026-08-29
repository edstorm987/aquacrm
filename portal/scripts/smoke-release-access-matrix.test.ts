// THE RELEASE ACCESS MATRIX.
//
// The last unstarted item in the continuation order: *"Two people, two projects
// and two environments for create role → grant → request → narrow/approve/deny/
// cancel/revoke. Prove Hidden/View/Use/Manage positive and negative reads and
// writes, exact-client isolation, and immediate Live/Sandbox revocation."*
//
// Everything below is driven through the real kernel — `createAccessRoleTemplate`,
// `createAccessGrant`, `createAccessRequest`, `approveAccessRequest`,
// `denyAccessRequest`, `cancelAccessRequest`, `revokeAccessGrant` — and every
// assertion is answered by `resolveAccess`, the same function every gate in the
// application consults. No test-only shortcut computes an expected answer.
//
// ── Why the NEGATIVES carry the weight ─────────────────────────────────────
//
// A matrix that only proves "granted access works" proves almost nothing: a
// kernel that returned `true` for everything would pass it. So every positive
// here is paired with the negative that would be true if the kernel were simply
// permissive — the OTHER person, the OTHER project, the OTHER environment, the
// OTHER client, and the same person after revocation.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import {
  approveAccessRequest,
  cancelAccessRequest,
  createAccessGrant,
  createAccessRequest,
  createAccessRoleTemplate,
  denyAccessRequest,
  hasAccessCapability,
  listAccessGrants,
  listAccessRequests,
  resolveAccess,
  revokeAccessGrant,
  AccessControlError,
} from "../src/server/accessControl";
import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { issueSession } from "../src/lib/server/auth/auth";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import type { AccessCapability, AccessEnvironment, AccessScope } from "../src/server/types";

// ─── The world: two people, two projects, two clients, two environments ────

let agencyId = "";
let owner = "";
let ana = "";
let ben = "";
let projectOne = "";
let projectTwo = "";
let clientOne = "";
let clientTwo = "";
let benSession = "";

before(async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "Matrix", slug: `matrix-${Date.now()}` });
  agencyId = agency.id;

  const person = (name: string, role: "agency-owner" | "agency-staff") => createUser({
    email: `${name}-${Date.now()}@matrix.test`,
    name,
    role,
    agencyId,
    password: "release-matrix-pass-phrase",
  }).id;

  owner = person("owner", "agency-owner");
  // Ana and Ben are STAFF, not owners: an owner carries `ownerBaseline` and
  // would pass every check regardless, which would make the whole matrix
  // vacuous. The people under test must be identities the kernel actually has
  // to reason about.
  ana = person("ana", "agency-staff");
  ben = person("ben", "agency-staff");

  clientOne = createClient(agencyId, { name: "Client One", slug: "client-one" }).id;
  clientTwo = createClient(agencyId, { name: "Client Two", slug: "client-two" }).id;

  projectOne = saveDevProject({ agencyId, name: "Project One", actorUserId: owner }).id;
  projectTwo = saveDevProject({ agencyId, name: "Project Two", actorUserId: owner }).id;

  const benUser = getState().users[Object.keys(getState().users).find(key => getState().users[key].id === ben)!];
  benSession = await issueSession({
    userId: ben, email: benUser.email, role: "agency-staff",
    agencyId, agencyIds: [agencyId], activeAgencyId: agencyId,
    sessionRev: benUser.sessionRev ?? 0,
  });
});

// ─── The one question every assertion below asks ───────────────────────────

function can(userId: string, capability: AccessCapability, scope: AccessScope, environment: AccessEnvironment = "live"): boolean {
  return hasAccessCapability(getState(), { userId, agencyId, scope, environment, capability });
}

const projectScope = (id: string): AccessScope => ({ kind: "project", id });
const clientScope = (id: string): AccessScope => ({ kind: "client", id });

describe("create role → grant: the positive, and every negative beside it", () => {
  let templateId = "";

  before(async () => {
    const template = await createAccessRoleTemplate({
      agencyId,
      actorUserId: owner,
      name: "Editor (project)",
      capabilities: ["project.view", "project.edit"],
      allowedScopeKinds: ["project"],
      allowedEnvironments: ["live", "sandbox"],
    });
    templateId = template.id;
    await createAccessGrant({
      agencyId,
      actorUserId: owner,
      userId: ana,
      scope: projectScope(projectOne),
      environment: "live",
      templateId,
    });
  });

  it("Ana has exactly what the template named on the project it named", () => {
    assert.equal(can(ana, "project.view", projectScope(projectOne)), true);
    assert.equal(can(ana, "project.edit", projectScope(projectOne)), true);
  });

  it("…and NOT a capability the template withheld", () => {
    // The grant is the template's capability set, not "everything about a
    // project". If this passes, the level distinction means nothing.
    assert.equal(can(ana, "project.publish", projectScope(projectOne)), false);
    assert.equal(can(ana, "project.manage", projectScope(projectOne)), false);
  });

  it("…and NOT on the OTHER project", () => {
    assert.equal(can(ana, "project.view", projectScope(projectTwo)), false);
    assert.equal(can(ana, "project.edit", projectScope(projectTwo)), false);
  });

  it("…and NOT in the OTHER environment", () => {
    // The grant named `live`. Sandbox is a different authority, not a view of
    // the same one.
    assert.equal(can(ana, "project.view", projectScope(projectOne), "sandbox"), false);
    assert.equal(can(ana, "project.edit", projectScope(projectOne), "sandbox"), false);
  });

  it("…and Ben has none of it", () => {
    // The second person is what separates "Ana was granted access" from "the
    // kernel says yes to staff".
    for (const capability of ["project.view", "project.edit", "project.publish"] as const) {
      assert.equal(can(ben, capability, projectScope(projectOne)), false, `Ben holds ${capability}`);
    }
  });
});

describe("request → narrow/approve: a reviewer may approve LESS than was asked", () => {
  it("approving with a narrowed set grants the narrowed set, not the request", async () => {
    const request = await createAccessRequest({
      agencyId,
      requesterUserId: ben,
      scope: projectScope(projectTwo),
      environment: "live",
      capabilities: ["project.view", "project.edit", "project.publish"],
      reason: "Ben asks for edit and publish on project two",
    });
    assert.equal(request.status, "pending");

    // The reviewer narrows: view only.
    const { request: decided, grant } = await approveAccessRequest({
      agencyId,
      actorUserId: owner,
      requestId: request.id,
      capabilities: ["project.view"],
    });
    assert.equal(decided.status, "approved");
    assert.equal(grant.userId, ben);

    assert.equal(can(ben, "project.view", projectScope(projectTwo)), true, "the narrowed capability was not granted");
    // The two he asked for and did NOT get. A kernel that granted the REQUEST
    // rather than the DECISION would fail here, and this is the whole point of
    // letting a reviewer narrow.
    assert.equal(can(ben, "project.edit", projectScope(projectTwo)), false, "the narrowing was ignored — Ben got edit");
    assert.equal(can(ben, "project.publish", projectScope(projectTwo)), false, "the narrowing was ignored — Ben got publish");
  });

  it("a second approval of the same request is idempotent, not a second grant", async () => {
    const request = await createAccessRequest({
      agencyId, requesterUserId: ana, scope: projectScope(projectTwo),
      environment: "live", capabilities: ["project.view"], reason: "Ana asks for project two",
    });
    const first = await approveAccessRequest({ agencyId, actorUserId: owner, requestId: request.id });
    const second = await approveAccessRequest({ agencyId, actorUserId: owner, requestId: request.id });
    assert.equal(second.grant.id, first.grant.id, "approving twice minted a second grant");
  });
});

describe("deny and cancel end a request WITHOUT granting anything", () => {
  it("a denied request grants nothing", async () => {
    const request = await createAccessRequest({
      agencyId, requesterUserId: ben, scope: projectScope(projectOne),
      environment: "live", capabilities: ["project.manage"], reason: "Ben asks to manage project one",
    });
    const denied = await denyAccessRequest({ agencyId, actorUserId: owner, requestId: request.id, reason: "no" });
    assert.equal(denied.status, "denied");
    assert.equal(can(ben, "project.manage", projectScope(projectOne)), false,
      "a DENIED request produced access — the decision is not being applied");
  });

  it("a cancelled request grants nothing, and cannot then be approved", async () => {
    const request = await createAccessRequest({
      agencyId, requesterUserId: ben, scope: projectScope(projectOne),
      environment: "live", capabilities: ["project.edit"], reason: "Ben asks then withdraws",
    });
    const cancelled = await cancelAccessRequest({ agencyId, actorUserId: ben, requestId: request.id });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(can(ben, "project.edit", projectScope(projectOne)), false);

    // Approving a withdrawn request would resurrect access the requester
    // deliberately gave up.
    await assert.rejects(
      () => approveAccessRequest({ agencyId, actorUserId: owner, requestId: request.id }),
      (error: unknown) => error instanceof AccessControlError && error.status === 409,
      "a cancelled request could still be approved",
    );
  });
});

describe("revocation is IMMEDIATE, and per environment", () => {
  it("revoking removes the capability on the next resolve — no cache, no delay", async () => {
    const grant = await createAccessGrant({
      agencyId, actorUserId: owner, userId: ben,
      scope: projectScope(projectOne), environment: "live",
      capabilities: ["project.view", "project.edit"],
    });
    assert.equal(can(ben, "project.edit", projectScope(projectOne)), true, "the grant did not take effect");

    await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: grant.id });

    // The next question, not the next request, not the next minute.
    assert.equal(can(ben, "project.edit", projectScope(projectOne)), false, "revocation did not take effect immediately");
    assert.equal(can(ben, "project.view", projectScope(projectOne)), false);
  });

  it("Live and Sandbox revoke independently — one does not silently take the other", async () => {
    const live = await createAccessGrant({
      agencyId, actorUserId: owner, userId: ana,
      scope: projectScope(projectTwo), environment: "live", capabilities: ["project.view"],
    });
    const sandbox = await createAccessGrant({
      agencyId, actorUserId: owner, userId: ana,
      scope: projectScope(projectTwo), environment: "sandbox", capabilities: ["project.view"],
    });
    assert.equal(can(ana, "project.view", projectScope(projectTwo), "live"), true);
    assert.equal(can(ana, "project.view", projectScope(projectTwo), "sandbox"), true);

    await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: sandbox.id });

    assert.equal(can(ana, "project.view", projectScope(projectTwo), "sandbox"), false,
      "the sandbox grant survived its own revocation");
    assert.equal(can(ana, "project.view", projectScope(projectTwo), "live"), true,
      "revoking SANDBOX also removed LIVE — the two environments are not separate authorities");

    await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: live.id });
    assert.equal(can(ana, "project.view", projectScope(projectTwo), "live"), false);
  });
});

describe("Hidden / View / Use / Manage are four distinct answers", () => {
  const ELEMENT = "element.client.commercial" as const;

  it("each level grants ITSELF and nothing above it", async () => {
    // Four people would be tidier, but the point is the LEVELS, so one person
    // is re-granted and the previous grant revoked between rounds — which also
    // exercises revoke → re-grant on the same scope.
    const levels = [
      { level: "view", capability: `${ELEMENT}.view` as AccessCapability },
      { level: "use", capability: `${ELEMENT}.use` as AccessCapability },
      { level: "manage", capability: `${ELEMENT}.manage` as AccessCapability },
    ];

    for (const { level, capability } of levels) {
      // `AccessGrant` records revocation as `revokedAt` — there is no `status`
      // field, so an earlier `status === "active"` filter here was silently
      // always false and this loop revoked nothing.
      for (const existing of listAccessGrants(agencyId, ben)) {
        if (!existing.revokedAt) {
          await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: existing.id });
        }
      }
      const grant = await createAccessGrant({
        agencyId, actorUserId: owner, userId: ben,
        scope: clientScope(clientOne), environment: "live",
        capabilities: [capability],
      });

      assert.equal(can(ben, capability, clientScope(clientOne)), true, `${level} did not grant itself`);

      // Nothing ABOVE it. A kernel that treated manage as implying everything —
      // or view as implying use — would fail here.
      const above = levels.slice(levels.findIndex(entry => entry.level === level) + 1);
      for (const higher of above) {
        assert.equal(can(ben, higher.capability, clientScope(clientOne)), false,
          `${level} granted ${higher.level} as well`);
      }

      // HIDDEN is the absence of all three, and it is what the OTHER client is.
      for (const entry of levels) {
        assert.equal(can(ben, entry.capability, clientScope(clientTwo)), false,
          `${level} on client one leaked ${entry.level} onto client two`);
      }
      await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: grant.id });
    }
  });
});

describe("exact-client isolation", () => {
  it("a client grant does not reach the sibling client, in either direction", async () => {
    const onGrant = await createAccessGrant({
      agencyId, actorUserId: owner, userId: ana,
      scope: clientScope(clientOne), environment: "live",
      capabilities: ["element.client.files.view", "element.client.files.use"],
    });
    assert.equal(can(ana, "element.client.files.use", clientScope(clientOne)), true);
    assert.equal(can(ana, "element.client.files.use", clientScope(clientTwo)), false,
      "a grant on one client reached the other");
    assert.equal(can(ana, "element.client.files.view", clientScope(clientTwo)), false);
    await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: onGrant.id });
  });

  it("a client of ANOTHER agency is refused by the ceiling, not by an empty grant set", async () => {
    // The distinction matters: "no capabilities" and "you cannot reach this at
    // all" are different answers, and only the second is safe to rely on.
    const other = createAgency({ name: "Other", slug: `other-${Date.now()}` });
    const theirClient = createClient(other.id, { name: "Theirs", slug: "theirs" }).id;
    const resolution = resolveAccess(getState(), {
      userId: ana, agencyId, scope: clientScope(theirClient), environment: "live",
    });
    assert.equal(resolution.ceilingFailure, "resource_ownership",
      "a cross-tenant client no longer fails the ceiling — it would fall through to whatever comes next");
    assert.deepEqual(resolution.capabilities, []);
  });
});

describe("the record of what happened is queryable", () => {
  it("every decision left a request row in a terminal state", () => {
    const requests = listAccessRequests(agencyId);
    const byStatus = requests.reduce<Record<string, number>>((acc, request) => {
      acc[request.status] = (acc[request.status] ?? 0) + 1;
      return acc;
    }, {});
    // The matrix above drove one of each, and each must be recorded — an audit
    // that only keeps approvals cannot answer "who asked and was refused".
    for (const status of ["approved", "denied", "cancelled"]) {
      assert.ok((byStatus[status] ?? 0) >= 1, `no ${status} request was recorded: ${JSON.stringify(byStatus)}`);
    }
    assert.equal(byStatus.pending ?? 0, 0, "a request was left pending — the matrix did not decide it");
  });
});

describe("a real gated WRITE honours the level — not just the capability resolver", () => {
  // Everything above proves the kernel's ANSWER. This proves a route ACTS on it:
  // a perfectly correct resolver is worth nothing if the surfaces ignore it, and
  // that gap is invisible to every assertion above.
  //
  // `POST /api/tenants/client-notes` requires `client.record` at USE, so it
  // separates the levels cleanly.
  //
  // ── The migration rule, which this section had to be rewritten around ──────
  //
  // The naive version of this test asserted that a staffer with NO grants is
  // refused. They are not, and that is deliberate: canonical client access is
  // opt-in per identity, so an identity holding no agency/workspace/client grant
  // is treated as UN-MIGRATED and keeps its legacy behaviour
  // (`legacyLevels` → manage for any agency role). Governance begins at the
  // first such grant, after which absence becomes meaningful.
  //
  // That is documented and intended. Its sharp edge is asserted at the end.
  async function writeNote(clientId: string, note: string): Promise<number> {
    const { POST } = await import("../src/app/api/tenants/client-notes/route");
    const response = await withSession(benSession, () => POST(new Request("http://localhost/api/tenants/client-notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `notes` is one of the route's four accepted keys; anything else is
      // silently dropped, which would make a "200 means it wrote" assertion lie.
      body: JSON.stringify({ clientId, notes: { notes: note } }),
    })));
    return response.status;
  }

  async function clearBensGrants(): Promise<void> {
    // `revokedAt`, not `status`: there is no `status` field on AccessGrant, and
    // filtering on one made this a no-op that left every earlier grant standing.
    for (const grant of listAccessGrants(agencyId, ben)) {
      if (!grant.revokedAt) await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: grant.id });
    }
  }

  /** Make Ben governed WITHOUT giving him anything on `clientOne`. */
  async function governBenElsewhere(): Promise<string> {
    const grant = await createAccessGrant({
      agencyId, actorUserId: owner, userId: ben,
      scope: clientScope(clientTwo), environment: "live",
      capabilities: ["element.client.overview.view"],
    });
    return grant.id;
  }

  it("UN-MIGRATED — no grant at all keeps legacy access, by design", async () => {
    await clearBensGrants();
    assert.equal(await writeNote(clientOne, "legacy"), 200,
      "the migration fallback is gone — every un-migrated agency identity has just lost its client workspace");
  });

  it("HIDDEN — governed, but with no policy for THIS client: refused", async () => {
    await clearBensGrants();
    await governBenElsewhere();
    assert.equal(await writeNote(clientOne, "hidden"), 403,
      "a governed staffer with no policy for this client still wrote its internal notes");
  });

  it("VIEW — the read level does NOT buy the write", async () => {
    await clearBensGrants();
    await governBenElsewhere();
    await createAccessGrant({
      agencyId, actorUserId: owner, userId: ben,
      scope: clientScope(clientOne), environment: "live",
      capabilities: ["element.client.record.view"],
    });
    assert.equal(await writeNote(clientOne, "view"), 403, "view was enough to write — the levels collapse");
  });

  it("USE — the write succeeds, and the data actually changed", async () => {
    await clearBensGrants();
    await governBenElsewhere();
    await createAccessGrant({
      agencyId, actorUserId: owner, userId: ben,
      scope: clientScope(clientOne), environment: "live",
      capabilities: ["element.client.record.view", "element.client.record.use"],
    });
    assert.equal(await writeNote(clientOne, "written-at-use"), 200, "use did not permit the write");
    // A positive is only real if the store moved.
    assert.equal(getState().clients[clientOne]?.metadata?.notes, "written-at-use",
      "the route answered 200 without writing anything");
  });

  it("…and that USE grant does not reach the OTHER client", async () => {
    assert.equal(await writeNote(clientTwo, "leak"), 403, "a grant on client one wrote client two's notes");
    assert.notEqual(getState().clients[clientTwo]?.metadata?.notes, "leak");
  });

  it("REVOKED — losing the client grant refuses the very next write", async () => {
    // Revoke ONLY the clientOne grant; Ben stays governed by the other one.
    for (const grant of listAccessGrants(agencyId, ben)) {
      if (!grant.revokedAt && grant.scope.id === clientOne) {
        await revokeAccessGrant({ agencyId, actorUserId: owner, grantId: grant.id });
      }
    }
    assert.equal(await writeNote(clientOne, "after-revoke"), 403, "revocation did not reach the route");
    assert.equal(getState().clients[clientOne]?.metadata?.notes, "written-at-use",
      "a revoked staffer still changed the notes");
  });

  it("THE SHARP EDGE — revoking someone's LAST grant returns them to legacy access", async () => {
    // Stated as a test rather than left to be discovered. Because governance is
    // opt-in per identity, an identity with zero active grants is un-migrated
    // again — so revoking the last one WIDENS what they can reach instead of
    // narrowing it. Revoking Ben's remaining grant restores the legacy `manage`
    // the first test in this section asserts.
    //
    // This is the documented rule followed to its conclusion, not a defect, but
    // it is the opposite of what "revoke" suggests and an operator will not
    // expect it. Recorded for Ed as issues #174.
    await clearBensGrants();
    assert.equal(await writeNote(clientOne, "back-to-legacy"), 200,
      "revoking the last grant no longer restores legacy access — if this changed deliberately, "
      + "issues #174 has been decided and this test should record the new rule");
  });
});
