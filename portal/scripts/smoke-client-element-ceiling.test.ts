// Client workspace elements — a ceiling refusal must not become legacy `manage`.
//
// Found while triaging the Finance cluster, 2026-08-27. `clientCommercialGate`
// in agency-finance asks the kernel whether this caller may touch a client's
// `client.commercial` element. Probing it with three client ids showed:
//
//   own client        ceilingFailure=none                 -> manage   (right)
//   nonexistent id    ceilingFailure=resource_ownership   -> manage   (wrong)
//   OTHER agency's    ceilingFailure=resource_ownership   -> manage   (wrong)
//
// `resolveActorClientWorkspaceElementAccess` read only "no capabilities and no
// grants" and concluded "this identity has not been migrated to canonical
// governance yet", falling back to `legacyLevels` — which answers `manage` for
// every agency role. So the element layer was overruling the very refusal the
// kernel had just handed it.
//
// The two cases ARE distinguishable, and that is what makes the fix safe:
//   • un-migrated identity  → the actor CAN reach the client, ceilingFailure is
//                             unset, and the legacy fallback is correct;
//   • ceiling refusal       → ceilingFailure is set, and nothing may be granted.
//
// This is a FLOOR beneath route-level tenancy, not a replacement for it — the
// direct tenant routes and the plugin catch-all still resolve the tenant first.
// But a floor that answers `manage` for another agency's client is not a floor,
// and anywhere it is the only client check it was load-bearing.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { AuthError, issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { Role } from "../src/server/types";

let mine: { id: string };
let theirs: { id: string };
let ownerSession: string;
let staffSession: string;

async function sessionAs(agencyId: string, role: Role, tag: string): Promise<string> {
  const user = createUser({
    email: `${tag}-${Date.now()}-${Math.round(performance.now() * 1000)}@ceiling.test`,
    name: tag,
    role,
    agencyId,
    password: "ceiling-smoke-pass-phrase",
  });
  return issueSession({
    userId: user.id, email: user.email, role,
    agencyId, agencyIds: [agencyId], activeAgencyId: agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
}

before(async () => {
  await ensureHydrated();
  const ours = createAgency({ name: "Ours", slug: `ceiling-ours-${Date.now()}` });
  const other = createAgency({ name: "Theirs", slug: `ceiling-theirs-${Date.now()}` });
  mine = createClient(ours.id, { name: "Our Client", slug: "our-client" });
  theirs = createClient(other.id, { name: "Their Client", slug: "their-client" });
  ownerSession = await sessionAs(ours.id, "agency-owner", "owner");
  // Same agency, no governance grants written: the un-migrated identity whose
  // legacy behaviour the fix must NOT disturb.
  staffSession = await sessionAs(ours.id, "agency-staff", "staff");
});

async function accessAs(session: string, clientId: string) {
  const mod = await import("../src/lib/server/access/clientWorkspaceElementAccess");
  return withSession(session, async () => {
    const { access } = await mod.currentClientWorkspaceElementAccess(clientId);
    return access;
  });
}

async function requireAs(session: string, clientId: string, level: "view" | "use" | "manage") {
  const mod = await import("../src/lib/server/access/clientWorkspaceElementAccess");
  return withSession(session, async () => {
    try {
      await mod.requireCurrentClientWorkspaceElementAccess(clientId, "client.commercial", level);
      return null;
    } catch (error) {
      return error;
    }
  });
}

describe("a ceiling refusal denies rather than falling back to legacy", () => {
  it("still gives the owner manage over their OWN client", async () => {
    const access = await accessAs(ownerSession, mine.id);
    assert.equal(access.source, "owner-baseline");
    assert.equal(access.levels["client.commercial"], "manage");
    assert.equal(await requireAs(ownerSession, mine.id, "manage"), null, "the fix must not lock the owner out");
  });

  it("refuses an owner on ANOTHER agency's client — the case that answered manage", async () => {
    const access = await accessAs(ownerSession, theirs.id);
    assert.equal(access.source, "ceiling-denied", "a refusal must be reported as a refusal, not as `legacy`");
    assert.equal(access.levels["client.commercial"], "hidden");

    const error = await requireAs(ownerSession, theirs.id, "view");
    assert.ok(error instanceof AuthError, `expected an AuthError, got ${String(error)}`);
    assert.equal((error as AuthError).status, 403);
  });

  it("refuses a client id that does not exist at all", async () => {
    const access = await accessAs(ownerSession, "cli_does_not_exist");
    assert.equal(access.source, "ceiling-denied");
    assert.equal(access.levels["client.commercial"], "hidden");
    assert.ok(await requireAs(ownerSession, "cli_does_not_exist", "view"), "an unknown id must not read as manage");
  });

  it("hides EVERY element on a refusal, not just the one asked about", async () => {
    const access = await accessAs(ownerSession, theirs.id);
    const granted = Object.entries(access.levels).filter(([, level]) => level !== "hidden");
    assert.deepEqual(granted, [], `a refused client leaked: ${JSON.stringify(granted)}`);
    assert.deepEqual(access.capabilities, []);
    assert.deepEqual(access.grantIds, []);
    assert.equal(access.agencyWidePolicy, false);
  });

  it("leaves the un-migrated legacy identity untouched — the property that makes this safe", async () => {
    // Same agency, no grants: the kernel raises no ceiling failure, so this
    // identity keeps exactly the behaviour it had before governance existed.
    // If this ever flips to `ceiling-denied`, the fix has over-reached and every
    // un-migrated agency user has silently lost their client workspace.
    const access = await accessAs(staffSession, mine.id);
    assert.equal(access.source, "legacy", "the migration fallback is still reached for its own case");
    assert.equal(access.canonical, false);
    assert.equal(access.levels["client.commercial"], "manage");
    assert.equal(await requireAs(staffSession, mine.id, "manage"), null);
  });

  it("and refuses that same un-migrated identity on another agency's client", async () => {
    // The legacy fallback was the widest surface: staff got `manage` on every
    // client id in existence, including ones the kernel had refused.
    const access = await accessAs(staffSession, theirs.id);
    assert.equal(access.source, "ceiling-denied");
    assert.equal(access.levels["client.commercial"], "hidden");
    assert.ok(await requireAs(staffSession, theirs.id, "view"));
  });
});
