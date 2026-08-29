// Erasure has to see a client NAMED ANY WAY, not just `clientId`.
//
// Item 6's residue names *"unresolved … references … including nested
// assignments … and parent deletion"*. This is that class, measured on the one
// operation where leaving a reference behind is a promise broken rather than
// untidiness: `eraseClientCompletely` tells the operator it *"Permanently
// erased a client and associated data"* and records an audit line that
// *"Names no personal data"*.
//
// ── What the probe found, 2026-08-27 ───────────────────────────────────────
//
// The generic sweep matched a TOP-LEVEL `clientId` field. An access GRANT and
// an access REQUEST do not have one: they name the client through
// `scope: { kind: "client", id }`. Both survived the erasure — and both carry a
// free-text `reason` written by a person, which is exactly where a client gets
// named:
//
//     grant.reason   = "Granted for Doomed Ltd onboarding"
//     request.reason = "I need access to Doomed Ltd's files for the March audit"
//
// A dangling id would have been untidy. Surviving prose naming the erased
// client is the audit line being untrue.
//
// The fix is one shared predicate (`recordNamesClient`) used by all three passes
// — arrays, records and the retained count — so they cannot drift apart. This
// file is what stops the next nested reference shape from slipping through.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { createAccessGrant, createAccessRequest } from "../src/server/accessControl";
import { eraseClientCompletely } from "../src/server/clientErasure";
import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";

const CLIENT_NAME = "Doomed Holdings Ltd";

async function worldWithNestedReferences() {
  await ensureHydrated();
  const agency = createAgency({ name: "Erasure", slug: `erasure-${Date.now()}-${Math.round(performance.now())}` });
  const client = createClient(agency.id, { name: CLIENT_NAME, slug: "doomed" });
  const owner = createUser({
    email: `owner-${Date.now()}-${Math.round(performance.now())}@erasure.test`,
    name: "Owner", role: "agency-owner", agencyId: agency.id, password: "erasure-smoke-pass-phrase",
  });
  const staff = createUser({
    email: `staff-${Date.now()}-${Math.round(performance.now())}@erasure.test`,
    name: "Staff", role: "agency-staff", agencyId: agency.id, password: "erasure-smoke-pass-phrase",
  });

  // Both reference the client ONLY through the nested scope, and both carry
  // free text that names them — the shape that survived.
  const grant = await createAccessGrant({
    agencyId: agency.id, actorUserId: owner.id, userId: staff.id,
    scope: { kind: "client", id: client.id }, environment: "live",
    capabilities: ["element.client.record.view"],
    reason: `Granted for ${CLIENT_NAME} onboarding`,
  });
  const request = await createAccessRequest({
    agencyId: agency.id, requesterUserId: staff.id,
    scope: { kind: "client", id: client.id }, environment: "live",
    capabilities: ["element.client.record.use"],
    reason: `I need access to ${CLIENT_NAME}'s files for the March audit`,
  });

  return { agencyId: agency.id, clientId: client.id, ownerId: owner.id, grantId: grant.id, requestId: request.id };
}

describe("erasing a client removes references that name it through a nested scope", () => {
  it("the access grant does not survive", async () => {
    const world = await worldWithNestedReferences();
    assert.ok(getState().accessGrants[world.grantId], "the fixture did not create a grant");

    const result = await eraseClientCompletely({
      agencyId: world.agencyId, clientId: world.clientId, actorUserId: world.ownerId,
    });
    assert.ok(result, "erasure did not run");
    assert.equal(getState().clients[world.clientId], undefined, "the client itself survived");
    assert.equal(getState().accessGrants[world.grantId], undefined,
      "an access grant scoped to the erased client survived — it names the client through `scope`, "
      + "which a top-level `clientId` match cannot see");
  });

  it("the access request does not survive", async () => {
    const world = await worldWithNestedReferences();
    await eraseClientCompletely({ agencyId: world.agencyId, clientId: world.clientId, actorUserId: world.ownerId });
    assert.equal(getState().accessRequests[world.requestId], undefined,
      "an access request scoped to the erased client survived");
  });

  it("NO free text anywhere in state still names the erased client", async () => {
    // The assertion that actually matters, and the one that would have caught
    // this without anybody guessing which collection to look in: after an
    // erasure, the client's NAME must not appear anywhere in the state.
    const world = await worldWithNestedReferences();
    await eraseClientCompletely({ agencyId: world.agencyId, clientId: world.clientId, actorUserId: world.ownerId });

    const serialised = JSON.stringify(getState());
    assert.equal(serialised.includes(CLIENT_NAME), false,
      `the erased client's name still appears in stored state — erasure's audit line claims it names `
      + `no personal data`);
  });

  it("…and no record still points at the erased client's id", async () => {
    const world = await worldWithNestedReferences();
    await eraseClientCompletely({ agencyId: world.agencyId, clientId: world.clientId, actorUserId: world.ownerId });

    // The id is a random token rather than personal data, so this is a
    // tidiness rule rather than a privacy one — but a grant pointing at a
    // client that no longer exists is exactly the "unresolved reference" class
    // item 6 names, and it shows up in "my access" surfaces.
    const dangling: string[] = [];
    for (const [collectionName, collection] of Object.entries(getState() as unknown as Record<string, unknown>)) {
      if (!collection || typeof collection !== "object") continue;
      const rows = Array.isArray(collection) ? collection : Object.values(collection as Record<string, unknown>);
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const value = row as { clientId?: unknown; scope?: { kind?: unknown; id?: unknown; clientId?: unknown } | null };
        const named = value.clientId === world.clientId
          || (value.scope && typeof value.scope === "object"
            && (value.scope.clientId === world.clientId
              || (value.scope.kind === "client" && value.scope.id === world.clientId)));
        if (named) dangling.push(collectionName);
      }
    }
    assert.deepEqual([...new Set(dangling)], [],
      `these collections still reference the erased client: ${[...new Set(dangling)].join(", ")}`);
  });

  it("erasure leaves ANOTHER client's grant alone", async () => {
    // The negative that stops the fix becoming "delete more than asked".
    const world = await worldWithNestedReferences();
    const survivor = createClient(world.agencyId, { name: "Survivor Ltd", slug: `survivor-${Date.now()}` });
    const staffId = Object.values(getState().users).find(user => user.role === "agency-staff" && user.agencyId === world.agencyId)!.id;
    const keep = await createAccessGrant({
      agencyId: world.agencyId, actorUserId: world.ownerId, userId: staffId,
      scope: { kind: "client", id: survivor.id }, environment: "live",
      capabilities: ["element.client.record.view"], reason: "Survivor Ltd onboarding",
    });

    await eraseClientCompletely({ agencyId: world.agencyId, clientId: world.clientId, actorUserId: world.ownerId });

    assert.ok(getState().accessGrants[keep.id],
      "erasing one client removed another client's grant — the sweep is matching too much");
    assert.ok(getState().clients[survivor.id], "erasing one client removed another client");
  });
});
