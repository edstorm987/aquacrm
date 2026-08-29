// "Give a dev staffer one folder" — through the real access kernel.
//
// Ed, 2026-08-27: *"I'd love to just give a dev staff access to one folder, or
// maybe even one file, or even multiple files in folders."*
//
// The matcher is proven in `smoke-dev-path-scope` and the route wiring in
// `smoke-dev-path-scope-routes`. This is the composition: a real project with a
// surface, a real person with real grants, and the effective answer that
// `requireDevProjectAccess` hands every file boundary.
//
// ── The rule this file exists to protect ──────────────────────────────────
//
// A person's own grants UNION with each other — two grants, two folders. That
// union then INTERSECTS the project's surface, so a grant can only ever narrow.
// Getting those two operations the same way round would either give somebody one
// of their two folders, or let a grant reach past what the project exposes.

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

import { createAccessGrant, revokeAccessGrant, listAccessGrants } from "../src/server/accessControl";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import { requireDevProjectAccess } from "../src/lib/server/dev/devProjectAccess";
import { isUnrestricted, scopeAllows } from "../src/lib/server/dev/devPathScope";

let agencyId = "";
let ownerId = "";
let devId = "";
let devSession = "";
let ownerSession = "";
let projectId = "";

const PROJECT_SURFACE = ["portal/src/app/portal", "portal/src/lib/portal"];

before(async () => {
  await ensureHydrated();
  const stamp = `${Date.now()}-${Math.round(performance.now())}`;
  const agency = createAgency({ name: "Scoped repo", slug: `scoped-${stamp}` });
  agencyId = agency.id;

  const person = (name: string, role: "agency-owner" | "agency-staff") => createUser({
    email: `${name}-${stamp}@scoped.test`, name, role, agencyId, password: "scoped-repo-pass-phrase",
  });
  const owner = person("owner", "agency-owner");
  const dev = person("dev", "agency-staff");
  ownerId = owner.id;
  devId = dev.id;

  const session = (user: { id: string; email: string; sessionRev?: number }, role: "agency-owner" | "agency-staff") =>
    issueSession({
      userId: user.id, email: user.email, role,
      agencyId, agencyIds: [agencyId], activeAgencyId: agencyId,
      sessionRev: user.sessionRev ?? 0,
    });
  ownerSession = await session(owner, "agency-owner");
  devSession = await session(dev, "agency-staff");

  projectId = saveDevProject({
    agencyId, name: "AquaCRM (portal files only)",
    allowedPaths: PROJECT_SURFACE,
    actorUserId: ownerId,
  }).id;
});

/** The effective surface this person gets, straight from the access call. */
async function surfaceFor(session: string) {
  return withSession(session, async () => {
    const access = await requireDevProjectAccess({
      projectId, capability: "project.view", elementCapability: "element.development.code.view",
    });
    return access.pathScope;
  });
}

async function grantDev(paths: string[] | undefined, capabilities = ["project.view", "element.development.code.view"] as never) {
  return createAccessGrant({
    agencyId, actorUserId: ownerId, userId: devId,
    scope: { kind: "project", id: projectId }, environment: "live",
    capabilities, allowedPaths: paths,
  });
}

async function clearDevGrants() {
  for (const grant of listAccessGrants(agencyId, devId)) {
    if (!grant.revokedAt) await revokeAccessGrant({ agencyId, actorUserId: ownerId, grantId: grant.id });
  }
}

describe("the project's surface applies to everyone, including the owner", () => {
  it("the owner gets the project's files and NOT the rest of the repo", async () => {
    const scope = await surfaceFor(ownerSession);
    assert.equal(isUnrestricted(scope), false, "the owner sees the whole repository again");
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false,
      "the project's surface did not apply to the owner — 'this project is the portal files' is a "
      + "statement about the project, not about who is asking");
  });
});

describe("an UNSCOPED grant gives the project's whole surface", () => {
  it("the dev gets everything the project exposes, and nothing beyond", async () => {
    await clearDevGrants();
    await grantDev(undefined);
    const scope = await surfaceFor(devSession);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/lib/portal/helpers.ts"), true);
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false);
  });
});

describe("ONE folder", () => {
  it("narrows the dev to it, inside the project's surface", async () => {
    await clearDevGrants();
    await grantDev(["portal/src/app/portal/blocks"]);
    const scope = await surfaceFor(devSession);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/blocks/hero.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), false,
      "the grant did not narrow — the dev has the project's whole surface");
    assert.equal(scopeAllows(scope, "portal/src/lib/portal/helpers.ts"), false);
  });
});

describe("ONE file", () => {
  it("narrows to exactly that file", async () => {
    await clearDevGrants();
    await grantDev(["portal/src/app/portal/page.tsx"]);
    const scope = await surfaceFor(devSession);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/other.tsx"), false);
    assert.equal(scopeAllows(scope, "portal/src/app/portal"), false);
  });
});

describe("SEVERAL grants union — two folders, both reachable", () => {
  it("a second grant adds to the first rather than replacing it", async () => {
    await clearDevGrants();
    await grantDev(["portal/src/app/portal/blocks"]);
    await grantDev(["portal/src/lib/portal"]);
    const scope = await surfaceFor(devSession);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/blocks/hero.tsx"), true,
      "the first grant was lost when a second was added");
    assert.equal(scopeAllows(scope, "portal/src/lib/portal/helpers.ts"), true,
      "the second grant did not take effect");
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), false);
  });

  it("two narrowed grants are NOT deduplicated into one", async () => {
    // They differ only by their paths. If the duplicate fingerprint ignored
    // that, the second would silently return the first and granting a second
    // folder would appear to work while changing nothing.
    await clearDevGrants();
    const first = await grantDev(["portal/src/app/portal/blocks"]);
    const second = await grantDev(["portal/src/lib/portal"]);
    assert.notEqual(second.id, first.id, "the second grant was treated as a duplicate of the first");
  });
});

describe("a grant can NEVER widen past the project", () => {
  it("naming a path outside the surface does not expose it", async () => {
    await clearDevGrants();
    await grantDev(["portal/src/server"]);
    const scope = await surfaceFor(devSession);
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false,
      "a grant reached past the project's surface — widening must mean touching the project");
    // …and with no overlap at all, the dev gets nothing rather than everything.
    assert.equal(isUnrestricted(scope), false, "a non-overlapping grant became unrestricted access");
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), false);
  });

  it("a grant for the repo ROOT still only yields the project's surface", async () => {
    await clearDevGrants();
    await grantDev(["portal"]);
    const scope = await surfaceFor(devSession);
    assert.equal(scopeAllows(scope, "portal/src/app/portal/page.tsx"), true);
    assert.equal(scopeAllows(scope, "portal/src/server/secrets.ts"), false,
      "a broad grant widened the project's surface");
  });
});

describe("revoking the narrowing", () => {
  it("removing the grants removes the dev's access to the files", async () => {
    await clearDevGrants();
    await grantDev(["portal/src/app/portal/blocks"]);
    assert.equal(scopeAllows(await surfaceFor(devSession), "portal/src/app/portal/blocks/hero.tsx"), true);

    await clearDevGrants();
    // With no project grant at all the access call itself refuses, which is the
    // stronger answer: there is no file surface to ask about.
    await assert.rejects(() => surfaceFor(devSession),
      "a dev with no grants still resolved a file surface for the project");
  });
});
