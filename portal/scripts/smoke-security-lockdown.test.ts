// Lockdown switches — assume-breach containment, Phase 1.
//
// Two reversible containment controls and their enforcement points:
//   1. GLOBAL READ-ONLY: `mutate()` refuses every write BEFORE the callback
//      runs (nothing partially applies), reads keep serving, the control
//      plane's own writes stay allowed (the switch must be liftable and
//      suspension/revocation must keep working DURING the incident).
//   2. TENANT LOCKDOWN: every session scoped to the locked tenant fails the
//      central session gate; other tenants are untouched; LIFTING restores the
//      existing sessions (no forced re-login — that's what distinguishes it
//      from a tenant epoch bump).
// Every switch flip lands in the security-event spine.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { getState, mutate, SecurityLockdownError } from "../src/server/storage";
import {
  bumpTenantSecurityEpoch,
  bumpUserSecurityEpoch,
  clearGlobalReadOnly,
  enforceSessionSecurity,
  isGlobalReadOnly,
  isTenantLockedDown,
  liftTenantLockdown,
  lockdownTenant,
  setGlobalReadOnly,
  suspendUser,
  unsuspendUser,
} from "../src/lib/server/auth/securityControl";
import { clearSecurityEventsForTest, recentSecurityEvents } from "../src/lib/server/security/securityEvents";
import type { SessionPayload } from "../src/server/types";

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  const control = getState().securityControl;
  return {
    userId: "user-a",
    agencyId: "agency-a",
    role: "owner",
    issuedAt: Date.now(),
    se: { g: control?.globalEpoch ?? 0, t: 0, u: 0 },
    ...overrides,
  } as SessionPayload;
}

beforeEach(() => {
  clearSecurityEventsForTest();
  // Make sure no switch leaks between tests.
  if (isGlobalReadOnly()) clearGlobalReadOnly("test-reset");
  for (const agencyId of Object.keys(getState().securityControl?.tenantLockdowns ?? {})) {
    liftTenantLockdown(agencyId, "test-reset");
  }
});

test("global read-only refuses ordinary writes before they apply", () => {
  mutate(state => {
    state.agencies["agency-a"] = { id: "agency-a", name: "Before" } as never;
  });
  setGlobalReadOnly("incident-commander", "active data-corruption incident");
  assert.equal(isGlobalReadOnly(), true);

  assert.throws(
    () =>
      mutate(state => {
        state.agencies["agency-a"] = { id: "agency-a", name: "After" } as never;
      }),
    (error: unknown) => (
      error instanceof SecurityLockdownError
      && error.code === "writes_frozen"
    ),
  );
  // The refused write did not partially apply — reads keep serving the
  // pre-lockdown value.
  assert.equal((getState().agencies["agency-a"] as { name?: string }).name, "Before");
});

test("the control plane keeps working during global read-only, and the switch lifts", () => {
  setGlobalReadOnly("incident-commander", "containment drill");

  // Suspension (a control-plane write) must keep working mid-incident.
  suspendUser("user-b", "incident-commander", "compromised credentials");
  assert.equal(enforceSessionSecurity(session({ userId: "user-b" })).ok, false);
  unsuspendUser("user-b", "incident-commander");

  // And the switch itself must be liftable — fail-closed can never mean
  // locked-forever.
  clearGlobalReadOnly("incident-commander");
  assert.equal(isGlobalReadOnly(), false);
  mutate(state => {
    state.agencies["agency-rw"] = { id: "agency-rw", name: "Writable again" } as never;
  });
  assert.equal((getState().agencies["agency-rw"] as { name?: string }).name, "Writable again");
});

test("application code cannot partially apply a refused multi-collection write", () => {
  setGlobalReadOnly("incident-commander", "freeze");
  assert.throws(
    () =>
      mutate(state => {
        state.agencies["agency-z"] = { id: "agency-z", name: "Z" } as never;
        state.clients["client-z"] = { id: "client-z" } as never;
      }),
    SecurityLockdownError,
  );
  assert.equal(getState().agencies["agency-z"], undefined);
  assert.equal(getState().clients["client-z"], undefined);
  clearGlobalReadOnly("incident-commander");
});

test("tenant lockdown fails only that tenant's sessions, and lifting restores them", () => {
  lockdownTenant("agency-a", "incident-commander", "tenant compromise suspected");
  assert.equal(isTenantLockedDown("agency-a"), true);

  const locked = enforceSessionSecurity(session());
  assert.deepEqual(locked, { ok: false, reason: "tenant-lockdown" });

  // A different tenant sails through.
  assert.equal(enforceSessionSecurity(session({ agencyId: "agency-b", userId: "user-b" })).ok, true);

  // Lifting restores the EXISTING session — no re-login required.
  liftTenantLockdown("agency-a", "incident-commander");
  assert.equal(enforceSessionSecurity(session()).ok, true);
});

test("a session whose ACTIVE agency is locked is refused even if its home tenant is fine", () => {
  lockdownTenant("agency-locked", "incident-commander", "containment");
  const result = enforceSessionSecurity(session({ activeAgencyId: "agency-locked" } as Partial<SessionPayload>));
  assert.deepEqual(result, { ok: false, reason: "tenant-lockdown" });
  liftTenantLockdown("agency-locked", "incident-commander");
});

test("every switch flip lands in the security-event spine", () => {
  setGlobalReadOnly("ic", "drill");
  clearGlobalReadOnly("ic");
  lockdownTenant("agency-a", "ic", "drill");
  liftTenantLockdown("agency-a", "ic");

  const kinds = recentSecurityEvents().map(event => event.kind);
  for (const expected of [
    "lockdown.global-read-only.set",
    "lockdown.global-read-only.cleared",
    "lockdown.tenant.set",
    "lockdown.tenant.lifted",
  ]) {
    assert.ok(kinds.includes(expected), `missing security event ${expected} (got: ${kinds.join(", ")})`);
  }
});

test("control-plane actions persist durably in state, bounded (Phase 1 durability)", () => {
  setGlobalReadOnly("ic", "durable drill");
  clearGlobalReadOnly("ic");
  const durable = getState().securityControl?.recentEvents ?? [];
  const kinds = durable.map(event => event.kind);
  assert.ok(kinds.includes("lockdown.global-read-only.set"), "the flip must be in DURABLE state, not just the ring");
  assert.ok(kinds.includes("lockdown.global-read-only.cleared"));
  assert.ok(durable.length <= 200, "the durable record must stay bounded");
  // Durable entries carry actor + time — enough for the threat centre and an
  // audit, with no secrets/prompts/bodies by construction (redaction upstream).
  // The record accumulates across actions (that is the point), so assert on
  // the NEWEST matching entry.
  const flip = [...durable].reverse().find(event => event.kind === "lockdown.global-read-only.set");
  assert.equal(flip?.actor, "ic");
  assert.ok((flip?.at ?? 0) > 0);
});

test("tenant lockdown exempts the tenant's owners — the locksmith keeps the keys", () => {
  lockdownTenant("agency-keys", "ic", "owner-exemption drill");
  // Staff and client sessions of the locked tenant are refused…
  assert.deepEqual(
    enforceSessionSecurity(session({ agencyId: "agency-keys", userId: "staff-1", role: "agency-staff" } as Partial<SessionPayload>)),
    { ok: false, reason: "tenant-lockdown" },
  );
  // …but an agency-owner session survives, so the lock can be investigated
  // and LIFTED from the threat centre rather than locking the locksmith out.
  assert.equal(
    enforceSessionSecurity(session({ agencyId: "agency-keys", userId: "owner-1", role: "agency-owner" } as Partial<SessionPayload>)).ok,
    true,
  );
  // The exemption shields the ROLE, not a compromised owner ACCOUNT:
  // suspension still bites owners during a lockdown.
  suspendUser("owner-1", "ic", "compromised owner drill");
  assert.deepEqual(
    enforceSessionSecurity(session({ agencyId: "agency-keys", userId: "owner-1", role: "agency-owner" } as Partial<SessionPayload>)),
    { ok: false, reason: "suspended" },
  );
  unsuspendUser("owner-1", "ic");
  liftTenantLockdown("agency-keys", "ic");
});

// ─── Sandbox live-anchor (Phase 2) ──────────────────────────────────────────

function sandboxSession(live: { user: string; agency: string }, persona: { user: string; agency: string }): SessionPayload {
  return session({
    userId: persona.user,
    agencyId: persona.agency,
    activeAgencyId: persona.agency,
    role: "agency-owner",
    sandbox: { access: "writable", returnUserId: live.user, returnAgencyId: live.agency, enteredAt: Date.now() },
  } as Partial<SessionPayload>);
}

test("a live user suspended WHILE in sandbox loses access on the next request", () => {
  const s = sandboxSession({ user: "live-op", agency: "live-agency" }, { user: "persona-demo", agency: "demo-agency" });
  // Fresh: persona not suspended, live not suspended → ok.
  assert.equal(enforceSessionSecurity(s).ok, true);
  // Suspend the LIVE operator (not the persona). The sandbox session must fail.
  suspendUser("live-op", "ic", "compromise found mid-session");
  assert.deepEqual(enforceSessionSecurity(s), { ok: false, reason: "suspended" });
  unsuspendUser("live-op", "ic");
});

test("a locked LIVE tenant blocks a sandbox session anchored to it (persona role is not an escape)", () => {
  const s = sandboxSession({ user: "live-op", agency: "live-agency" }, { user: "persona-demo", agency: "demo-agency" });
  lockdownTenant("live-agency", "ic", "tenant compromise");
  // The owner exemption must NOT apply to a sandbox session.
  assert.deepEqual(enforceSessionSecurity(s), { ok: false, reason: "tenant-lockdown" });
  liftTenantLockdown("live-agency", "ic");
  assert.equal(enforceSessionSecurity(s).ok, true);
});

test("a user/tenant epoch bump on the LIVE identity invalidates a sandbox session", () => {
  // A sandbox session born before any bump (se all zeros), anchored to the live
  // operator/tenant. Bumping the live user's epoch must fail it (user-epoch);
  // bumping the live tenant's epoch must fail it (tenant-epoch).
  const s = sandboxSession({ user: "live-op2", agency: "live-agency2" }, { user: "persona-demo2", agency: "demo-agency2" });
  s.se = { g: 0, t: 0, u: 0 };
  assert.equal(enforceSessionSecurity(s).ok, true);

  bumpUserSecurityEpoch("live-op2", "ic", "rotate the live operator");
  assert.deepEqual(enforceSessionSecurity(s), { ok: false, reason: "user-epoch" });

  // A fresh sandbox session (stamped after the bump) is fine again — proves the
  // check is stamp-matched to the live anchor, not a blanket block.
  const fresh = sandboxSession({ user: "live-op2", agency: "live-agency2" }, { user: "persona-demo2", agency: "demo-agency2" });
  fresh.se = { g: 0, t: 0, u: 1 };
  assert.equal(enforceSessionSecurity(fresh).ok, true);

  bumpTenantSecurityEpoch("live-agency2", "ic", "rotate the live tenant");
  assert.deepEqual(enforceSessionSecurity(fresh), { ok: false, reason: "tenant-epoch" });
});
