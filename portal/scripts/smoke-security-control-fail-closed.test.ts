// Security-control fail-closed (Item 1).
//
// If the control plane cannot be READ, protected writes and the session gate
// must DENY — never proceed on a fabricated all-clear object. We prove this
// behaviourally by stubbing storage.getState() to throw (a control-read
// failure) and then exercising the real guards.

import assert from "node:assert/strict";
import test from "node:test";

// Stub the storage module BEFORE securityControl is loaded, so its getState
// import resolves to one that throws — simulating an unreadable control plane.
const storageId = require.resolve("../src/server/storage");
require.cache[storageId] = {
  id: storageId, filename: storageId, loaded: true, paths: [], children: [],
  exports: {
    getState() { throw new Error("state backend unreachable"); },
    mutate() { throw new Error("state backend unreachable"); },
    ensureHydrated: async () => {},
  },
} as never;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const control = require("../src/lib/server/auth/securityControl") as typeof import("../src/lib/server/auth/securityControl");

test("readSecurityControlStrict throws when state cannot be read (no all-clear fabrication)", () => {
  assert.throws(() => control.readSecurityControlStrict(), control.SecurityControlUnavailableError);
});

test("the tolerant read still returns all-zeros (used only where absence == all-clear)", () => {
  // Tolerant read is for issue-time epoch stamping etc.; it must not throw.
  const c = control.readSecurityControl();
  assert.equal(c.globalEpoch, 0);
});

test("assertWritesAllowed FAILS CLOSED when the control plane is unreadable", () => {
  assert.throws(() => control.assertWritesAllowed("test.surface", { tenantId: "a" }), control.WritesFrozenError);
});

test("the session gate FAILS CLOSED (control-unavailable) when the control plane is unreadable", () => {
  const result = control.enforceSessionSecurity({
    userId: "u", email: "u@example.test", role: "agency-owner", agencyId: "a",
    issuedAt: Date.now(), se: { g: 0, t: 0, u: 0 },
  } as never);
  assert.deepEqual(result, { ok: false, reason: "control-unavailable" });
});
