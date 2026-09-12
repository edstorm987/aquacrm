import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";
import type { ClientPortalSetupDependencies } from "../src/server/clientPortalSetupOperation";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "client-setup-recovery-test-secret";
process.env.NODE_ENV = "test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let users: typeof import("../src/server/users");
let setup: typeof import("../src/server/clientPortalSetupOperation");

before(async () => {
  [storage, tenants, users, setup] = await Promise.all([
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/server/clientPortalSetupOperation"),
  ]);
});

beforeEach(async () => {
  await storage.reset();
});

describe("client portal password setup recovery", () => {
  it("adopts a lost provider response, rejects changed-password retry, and commits one epoch bump", async () => {
    const agency = tenants.createAgency({ name: "Setup Recovery Agency" });
    const client = tenants.createClient(agency.id, { name: "Setup Recovery Client" });
    const created = users.createUser({
      email: "setup-recovery@example.test",
      password: "Temporary-password-123",
      role: "end-customer",
      agencyId: agency.id,
      clientId: client.id,
      mustChangePassword: true,
    });
    users.markEmailVerified(created.id);
    await storage.flushPendingWrites();

    let providerCalls = 0;
    let remoteCreated = false;
    const providerOperationIds: string[] = [];
    const dependencies: ClientPortalSetupDependencies = {
      async applyProvider({ operation, user }) {
        providerCalls += 1;
        providerOperationIds.push(operation.id);
        assert.equal(user.id, created.id);
        if (!remoteCreated) {
          remoteCreated = true;
          throw new Error("lost provider response");
        }
        return { authUserId: "supabase_client_setup_exact" };
      },
    };

    await assert.rejects(setup.executeClientPortalSetup({
      userId: created.id,
      expectedSessionRev: 0,
      password: "Chosen-password-123",
      dependencies,
    }), /client_setup_provider_failed/);
    const accepted = Object.values(storage.getState().clientPortalSetupOperations)[0];
    assert.equal(accepted?.status, "accepted");
    assert.doesNotMatch(JSON.stringify(accepted), /Chosen-password-123/);

    await assert.rejects(setup.executeClientPortalSetup({
      userId: created.id,
      expectedSessionRev: 0,
      password: "Changed-password-456",
      dependencies,
    }), /client_setup_password_changed/);
    assert.equal(providerCalls, 1);

    const completed = await setup.executeClientPortalSetup({
      userId: created.id,
      expectedSessionRev: 0,
      password: "Chosen-password-123",
      dependencies,
    });
    assert.equal(completed.completedNow, true);
    assert.equal(completed.operation.status, "complete");
    assert.equal(completed.user.supabaseAuthUserId, "supabase_client_setup_exact");
    assert.equal(completed.user.sessionRev, 1);
    assert.ok(completed.user.welcomeCompletedAt);
    assert.equal(providerCalls, 2);
    assert.equal(new Set(providerOperationIds).size, 1, "lost-response adoption must reuse one exact provider operation");

    const replay = await setup.executeClientPortalSetup({
      userId: created.id,
      expectedSessionRev: 0,
      password: "Chosen-password-123",
      dependencies,
    });
    assert.equal(replay.completedNow, false);
    assert.equal(providerCalls, 2);
  });
});
