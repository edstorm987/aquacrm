import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "password-reset-operation-smoke-secret";

import { signPasswordResetToken } from "../src/lib/server/auth/passwordReset";
import { _createMemoryAdapterForTests, _swapStoreForTests } from "../src/lib/server/auth/nonceStore";
import {
  executePasswordReset,
  getPasswordResetOperation,
  passwordResetProviderStrategy,
  type PasswordResetProviderDependencies,
} from "../src/server/passwordResetOperation";
import { reset } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { bindSupabaseAuthIdentity, createUser, getUserById } from "../src/server/users";

beforeEach(async () => {
  await reset();
  await _swapStoreForTests(_createMemoryAdapterForTests());
});

function ownerFixture(email = "reset-owner@example.test") {
  const agency = createAgency({ name: "Reset Owner Agency" });
  const user = createUser({
    email,
    password: "Old-owner-password-123",
    role: "agency-owner",
    agencyId: agency.id,
  });
  return { agency, user };
}

describe("durable password-reset operation", () => {
  it("commits provider receipt + local session epoch and invalidates every sibling link", async () => {
    const { user } = ownerFixture();
    const first = signPasswordResetToken({
      userId: user.id,
      email: user.email,
      sessionRev: user.sessionRev ?? 0,
    });
    const sibling = signPasswordResetToken({
      userId: user.id,
      email: user.email,
      sessionRev: user.sessionRev ?? 0,
    });
    let providerCalls = 0;
    const dependencies: PasswordResetProviderDependencies = {
      async apply() {
        providerCalls += 1;
        return { authUserId: "supabase_reset_owner" };
      },
    };

    const completed = await executePasswordReset({
      payload: first.payload,
      password: "New-owner-password-456",
      dependencies,
    });
    assert.equal(completed.completedNow, true);
    assert.equal(completed.operation.status, "complete");
    assert.equal(completed.operation.providerUserId, "supabase_reset_owner");
    assert.equal(getUserById(user.id)?.sessionRev, (user.sessionRev ?? 0) + 1);
    assert.equal(getUserById(user.id)?.supabaseAuthUserId, "supabase_reset_owner");

    await assert.rejects(
      executePasswordReset({
        payload: sibling.payload,
        password: "Sibling-must-not-win-789",
        dependencies,
      }),
      /reset_epoch_changed/,
    );
    assert.equal(providerCalls, 1, "stale sibling proof must not reach the provider");
  });

  it("resumes an ambiguous provider response with the exact operation/password and converges once", async () => {
    const { user } = ownerFixture("ambiguous-reset@example.test");
    const signed = signPasswordResetToken({
      userId: user.id,
      email: user.email,
      sessionRev: user.sessionRev ?? 0,
    });
    let remoteApplied = false;
    let calls = 0;
    const dependencies: PasswordResetProviderDependencies = {
      async apply({ operation }) {
        calls += 1;
        if (!remoteApplied) {
          remoteApplied = true;
          throw new Error(`response lost for ${operation.id}`);
        }
        return { authUserId: "supabase_ambiguous_reset" };
      },
    };
    await assert.rejects(executePasswordReset({
      payload: signed.payload,
      password: "Ambiguous-new-password-123",
      dependencies,
    }), /password_reset_provider_failed/);
    assert.equal(getPasswordResetOperation(signed.payload)?.status, "accepted");
    assert.equal(getPasswordResetOperation(signed.payload)?.providerOutcomeUnknown, true);

    await assert.rejects(executePasswordReset({
      payload: signed.payload,
      password: "Different-retry-password-123",
      dependencies,
    }), /password_reset_operation_mismatch/);
    assert.equal(calls, 1, "a changed retry input must not reach the provider");

    const resumed = await executePasswordReset({
      payload: signed.payload,
      password: "Ambiguous-new-password-123",
      dependencies,
    });
    assert.equal(resumed.completedNow, true);
    assert.equal(resumed.operation.providerAttempts, 2);
    const replay = await executePasswordReset({
      payload: signed.payload,
      password: "Ambiguous-new-password-123",
      dependencies,
    });
    assert.equal(replay.completedNow, false);
    assert.equal(calls, 2, "a lost HTTP response may replay local success without another provider mutation");
  });

  it("pins client resets to the immutable client membership and bound subject", async () => {
    const agency = createAgency({ name: "Client Reset Agency" });
    const client = createClient(agency.id, { name: "Exact Client" });
    const user = createUser({
      email: "client-reset@example.test",
      password: "Old-client-password-123",
      role: "end-customer",
      agencyId: agency.id,
      clientId: client.id,
    });
    assert.ok(bindSupabaseAuthIdentity(user.id, "supabase_exact_client"));
    const current = getUserById(user.id)!;
    const signed = signPasswordResetToken({
      userId: current.id,
      email: current.email,
      sessionRev: current.sessionRev ?? 0,
    });
    const dependencies: PasswordResetProviderDependencies = {
      async apply({ operation, user: exact }) {
        assert.equal(operation.initialSupabaseAuthUserId, "supabase_exact_client");
        assert.equal(exact.clientId, client.id);
        assert.equal(passwordResetProviderStrategy(operation, exact), "update-bound-client");
        return { authUserId: "supabase_exact_client" };
      },
    };
    const result = await executePasswordReset({
      payload: signed.payload,
      password: "New-client-password-456",
      dependencies,
    });
    assert.equal(result.user.id, user.id);
    assert.equal(result.user.clientId, client.id);
    assert.equal(result.user.supabaseAuthUserId, "supabase_exact_client");
  });
});
