// Session-registry completeness (Item 3).
//
// Every REAL session mint must register in the durable registry (so it can be
// listed and revoked), not just password logins. Ephemeral/development mints
// (public showcase, sandbox persona, dev-mode) must NOT — they are not real
// credentials and must not populate the operator's device list. Registration
// happens centrally in issueSession, so this drives issueSession directly for
// each flow and checks listUserSessions.

import assert from "node:assert/strict";
import test, { before } from "node:test";

let issueSession: typeof import("../src/lib/server/auth/auth")["issueSession"];
let control: typeof import("../src/lib/server/auth/securityControl");

before(async () => {
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  ({ issueSession } = await import("../src/lib/server/auth/auth"));
  control = await import("../src/lib/server/auth/securityControl");
});

test("every real mint flow registers a listable, revocable session", () => {
  const flows = ["password", "oauth", "magic-link", "signup", "agency-switch", "end-customer"];
  for (const [i, issuedVia] of flows.entries()) {
    const userId = `registry-user-${i}`;
    issueSession({
      userId, email: `${userId}@example.test`, role: "agency-owner",
      agencyId: "registry-agency", agencyIds: ["registry-agency"], activeAgencyId: "registry-agency",
      issuedVia,
    } as never);
    const sessions = control.listUserSessions(userId);
    assert.equal(sessions.length, 1, `${issuedVia} must register exactly one session`);
    assert.equal(sessions[0].issuedVia, issuedVia, `${issuedVia} must record how it was minted`);
    assert.ok(sessions[0].expiresAt && sessions[0].expiresAt > Date.now(), `${issuedVia} must record an expiry`);
    // And it is revocable.
    assert.equal(control.revokeSession(sessions[0].sid, "ops", "test"), true);
  }
});

test("ephemeral / development mints do NOT register", () => {
  // Public showcase.
  issueSession({ userId: "eph-showcase", email: "s@example.test", role: "agency-owner", agencyId: "a", publicShowcase: true } as never);
  assert.equal(control.listUserSessions("eph-showcase").length, 0, "showcase must not register");
  // Dev-mode (isDemo).
  issueSession({ userId: "eph-dev", email: "d@example.test", role: "agency-owner", agencyId: "a", isDemo: true } as never);
  assert.equal(control.listUserSessions("eph-dev").length, 0, "dev-mode must not register");
  // Sandbox persona.
  issueSession({ userId: "eph-sandbox", email: "sb@example.test", role: "agency-owner", agencyId: "a", sandbox: { access: "writable", returnUserId: "live", returnAgencyId: "live-a", enteredAt: Date.now() } } as never);
  assert.equal(control.listUserSessions("eph-sandbox").length, 0, "sandbox must not register");
});

test("expired registry records are pruned/ignored", () => {
  const userId = "registry-expired";
  issueSession({ userId, email: "e@example.test", role: "agency-owner", agencyId: "a", issuedVia: "password" } as never);
  const [live] = control.listUserSessions(userId);
  assert.ok(live, "a live session is listed");
  // Force-expire the record and confirm it drops out of the listing.
  control.expireSessionForTest(live.sid);
  assert.equal(control.listUserSessions(userId).length, 0, "an expired record must not be listed");
});
