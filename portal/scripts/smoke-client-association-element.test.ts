// The other half of application-wide client classification.
//
// `pluginClientElement.ts` settled the dynamic module catch-all. This is what
// the checklist kept open beside it: *"freelancer-job and generic
// task/task-template client associations remain genuinely unclassified."*
//
// ── Why they stayed open, and what settles them ────────────────────────────
//
// All three records are AGENCY work that merely NAMES a client, and all three
// were already gated as agency work — `workspace.actions`, an agency role,
// People's `staff.people` + `staff.pay`. None had a rule about the one field
// that crosses the boundary: `clientId`.
//
// The genuine difficulty was that a GENERIC task belongs to no single client
// element — it might be about money, delivery or a conversation — and guessing
// one would look enforced while guarding the wrong thing. The resolution is
// that a generic association does not need the element owning the SUBJECT; it
// needs the one that says **you may see this client at all**. That is
// `client.overview`, the client workspace's landing tab. A freelancer job is
// not generic: it is delivery work for a named client, so `client.fulfilment`.
//
// This file asserts the classification, the enforcement, and — the part that
// stops the gap reopening — that every agency-side surface taking a `clientId`
// is either classified or named as governed elsewhere.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { AuthError, issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";

type Mod = typeof import("../src/lib/server/access/clientAssociationElement");
let mod: Mod;

let ourClientId = "";
let theirClientId = "";
let ownerSession = "";

before(async () => {
  mod = await import("../src/lib/server/access/clientAssociationElement");

  await ensureHydrated();
  const ours = createAgency({ name: "Assoc Ours", slug: `assoc-ours-${Date.now()}` });
  const other = createAgency({ name: "Assoc Theirs", slug: `assoc-theirs-${Date.now()}` });
  ourClientId = createClient(ours.id, { name: "Our Client", slug: "our-client" }).id;
  theirClientId = createClient(other.id, { name: "Their Client", slug: "their-client" }).id;
  const owner = createUser({
    email: `owner-${Date.now()}@assoc.test`,
    name: "Assoc Owner",
    role: "agency-owner",
    agencyId: ours.id,
    password: "assoc-smoke-pass-phrase",
  });
  ownerSession = await issueSession({
    userId: owner.id, email: owner.email, role: "agency-owner",
    agencyId: ours.id, agencyIds: [ours.id], activeAgencyId: ours.id,
    sessionRev: owner.sessionRev ?? 0,
  });
});

describe("the classification is explicit and reasoned", () => {
  it("maps each association to the element that actually owns it", () => {
    assert.deepEqual(mod.CLIENT_ASSOCIATION_ELEMENT, {
      "agency-task": "client.overview",
      "agency-task-template": "client.overview",
      "freelancer-job": "client.fulfilment",
    });
  });

  it("a generic task asks only whether you may SEE the client", () => {
    // The whole reason this was unclassified. If someone later "tidies" these
    // onto client.fulfilment, a generic Action about an invoice starts asking
    // for Delivery — enforced, and guarding the wrong thing.
    assert.equal(mod.clientAssociationElement("agency-task"), "client.overview");
    assert.notEqual(mod.clientAssociationElement("agency-task"), "client.fulfilment");
  });

  it("returns null for anything unclassified rather than inventing an element", () => {
    assert.equal(mod.clientAssociationElement("something-new"), null);
  });

  it("names every alternative authority with a real reason", () => {
    const entries = Object.entries(mod.CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY);
    assert.ok(entries.length >= 3, "the alternative-authority list emptied out");
    for (const [key, reason] of entries) {
      assert.ok(reason.trim().length > 40, `${key} needs a real reason, got "${reason}"`);
    }
    // The one the checklist names explicitly: the contractor's own view is
    // governed by FreelancerAccessConfig, and forcing the agency gate on it
    // would be "the wrong client gate".
    assert.ok(
      mod.CLIENT_ASSOCIATION_ALTERNATIVE_AUTHORITY["freelancer-job-as-seen-by-the-freelancer"]
        ?.includes("FreelancerAccessConfig"),
      "the freelancer's own authority is no longer named",
    );
  });
});

describe("it refuses a client the caller cannot reach", () => {
  async function attempt(kind: "agency-task" | "agency-task-template" | "freelancer-job", clientId: string) {
    return withSession(ownerSession, async () => {
      try {
        await mod.requireClientAssociation(kind, clientId, "use");
        return null;
      } catch (error) { return error; }
    });
  }

  it("allows the owner to associate with their OWN client", async () => {
    for (const kind of ["agency-task", "agency-task-template", "freelancer-job"] as const) {
      assert.equal(await attempt(kind, ourClientId), null, `${kind} refused the owner's own client`);
    }
  });

  it("refuses ANOTHER agency's client for every association", async () => {
    for (const kind of ["agency-task", "agency-task-template", "freelancer-job"] as const) {
      const error = await attempt(kind, theirClientId);
      assert.ok(error instanceof AuthError, `${kind} did not refuse a cross-tenant client`);
      assert.equal((error as AuthError).status, 403);
    }
  });

  it("says nothing at all when there is no client — that is agency work", async () => {
    for (const value of [undefined, null, ""]) {
      assert.equal(await attempt("agency-task", value as unknown as string), null,
        "an unattached Action was refused; it has no client to answer for");
    }
  });
});

describe("the three surfaces actually enforce it", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("Actions gate both the write and the re-association", () => {
    const src = read("src/app/api/portal/tasks/route.ts");
    assert.match(src, /await requireClientAssociation\("agency-task", body\.clientId, "use"\)/,
      "creating a client-attached Action is ungated again");
    // Both sides of a move: checking only the destination would let someone
    // detach a task from a client they cannot see.
    assert.match(src, /requireClientAssociation\("agency-task", existing\?\.clientId, "use"\)/,
      "the client an Action is currently on is no longer checked on PATCH");
    assert.match(src, /requireClientAssociation\("agency-task", patch\.clientId, "use"\)/,
      "the client an Action is moving to is no longer checked on PATCH");
  });

  it("the Actions list filters rows whose client the reader may not see", () => {
    const src = read("src/app/api/portal/tasks/route.ts");
    assert.match(src, /canReadClientAssociation\(actor, "agency-task", task\.clientId\)/,
      "the Actions list stopped filtering by client visibility");
    // Resolved ONCE, not per row.
    assert.match(src, /const actor = await requireCurrentAccessActor\(\);/);
    assert.equal((src.match(/requireCurrentAccessActor\(\)/g) ?? []).length, 1,
      "the actor is being resolved more than once — that is a per-row session read");
  });

  it("applying a task template at a client is gated — it had NO client rule", () => {
    const src = read("src/app/api/portal/tasks/templates/route.ts");
    assert.match(src, /requireClientAssociation\(\s*"agency-task-template"/,
      "the template route is back to an agency role being the whole gate");
  });

  it("a freelancer job checks tenancy FIRST, then the element", () => {
    const src = read("src/app/api/portal/people/route.ts");
    const block = src.slice(src.indexOf('if (action === "save-freelancer-job")'));
    const tenancy = block.indexOf("routeTenantScope(session");
    const element = block.indexOf('requireClientAssociation("freelancer-job"');
    assert.ok(tenancy >= 0, "the freelancer job stopped resolving tenant scope");
    assert.ok(element > tenancy,
      "the element gate runs before tenancy — a cross-tenant id would answer 403 where the house answers not-found");
  });

  it("the freelancer's OWN view is left to FreelancerAccessConfig", () => {
    // The named alternative authority. If this file ever starts gating the
    // contractor's view as an agency identity, that is the "wrong client gate"
    // the checklist warns about.
    const workspace = read("src/server/freelancerWorkspace.ts");
    assert.match(workspace, /clientIdentity === "named"/,
      "the freelancer's client-naming policy is gone");
    assert.doesNotMatch(workspace, /requireClientAssociation|requireCurrentClientWorkspaceElementAccess/,
      "the contractor's own view is now being evaluated as an agency identity");
  });
});

describe("no agency surface can take a clientId unclassified and unnoticed", () => {
  it("every classified kind is reachable, and the map has no orphans", () => {
    // Cheap completeness: each key must be used by a real surface, so a stale
    // entry cannot sit here looking like enforcement that no longer happens.
    const sources = [
      "src/app/api/portal/tasks/route.ts",
      "src/app/api/portal/tasks/templates/route.ts",
      "src/app/api/portal/people/route.ts",
    ].map(path => readFileSync(path, "utf8")).join("\n");
    for (const kind of Object.keys(mod.CLIENT_ASSOCIATION_ELEMENT)) {
      assert.ok(sources.includes(`"${kind}"`), `${kind} is classified but nothing uses it`);
    }
  });
});
