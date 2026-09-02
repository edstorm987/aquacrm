import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "aqua-outbox-order-"));
const dataFile = join(sandbox, "portal-state.json");
process.env.PORTAL_BACKEND = "file";
process.env.PORTAL_DATA_FILE = dataFile;
process.env.NODE_ENV = "test";

const require_ = createRequire(join(process.cwd(), "aqua-outbox-order-test.cjs"));
const storage = require_("./src/server/storage") as typeof import("../src/server/storage");
const outbox = require_("./src/server/outbox") as typeof import("../src/server/outbox");
const coordinator = require_("./src/server/productWorkspaceCoordinator") as typeof import("../src/server/productWorkspaceCoordinator");

after(async () => { await rm(sandbox, { recursive: true, force: true }); });
beforeEach(async () => { await storage.reset(); });

function persistedOutboxRow(id: string): Record<string, unknown> | undefined {
  const state = JSON.parse(readFileSync(dataFile, "utf8")) as {
    outbox?: Record<string, Record<string, unknown>>;
  };
  return state.outbox?.[id];
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("the durable commit keeps an outbox row pending until its post-commit dispatch actually starts", async () => {
  const atPostCommitBoundary = deferred();
  const releasePostCommitBoundary = deferred();
  let dispatches = 0;

  const transaction = coordinator.withPortalStateTransaction("outbox:commit-order", () => {
    storage.mutate(state => {
      outbox.recordOutboxEvent(state, {
        id: "obx_postcommit_order",
        name: "outbox.postcommit_order",
        agencyId: "agency-outbox-order",
        source: "scripts/smoke-outbox-postcommit-order",
        payload: { marker: "durable-before-dispatch" },
        now: 1_000,
      });
    });

    // Pause the post-commit queue before the outbox callback. At this point the
    // transaction is durably committed but dispatch has not started — exactly
    // the process-crash window this regression protects.
    coordinator.deferUntilPortalStateCommit(async () => {
      atPostCommitBoundary.resolve();
      await releasePostCommitBoundary.promise;
    }, "test:postcommit-barrier");

    const dispatch = () => { dispatches += 1; };
    assert.equal(outbox.drainOutbox(2_000, dispatch), 1);
    assert.equal(outbox.drainOutbox(2_000, dispatch), 1, "the second drain sees the still-pending row");
    assert.equal(storage.getState().outbox.obx_postcommit_order?.status, "pending");
    assert.equal(storage.getState().outbox.obx_postcommit_order?.attempts, 0);
  });

  await atPostCommitBoundary.promise;
  assert.equal(dispatches, 0, "dispatch ran before the queued post-commit callback");
  assert.deepEqual(
    {
      status: persistedOutboxRow("obx_postcommit_order")?.status,
      attempts: persistedOutboxRow("obx_postcommit_order")?.attempts,
    },
    { status: "pending", attempts: 0 },
    "a process dying after commit but before dispatch must leave replayable durable state",
  );

  releasePostCommitBoundary.resolve();
  await transaction;

  const delivered = persistedOutboxRow("obx_postcommit_order");
  assert.equal(dispatches, 1, "keyed post-commit drains dispatch exactly once");
  assert.equal(delivered?.status, "delivered");
  assert.equal(delivered?.attempts, 1);
  assert.equal(delivered?.lastAttemptAt, 2_000);
  assert.equal(delivered?.deliveredAt, 2_000);
});

test("a synchronous post-commit dispatch failure stays pending and a later drain retries it", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
    await coordinator.withPortalStateTransaction("outbox:retry-order", () => {
      storage.mutate(state => {
        outbox.recordOutboxEvent(state, {
          id: "obx_retry_after_failure",
          name: "outbox.retry_after_failure",
          agencyId: "agency-outbox-order",
          source: "scripts/smoke-outbox-postcommit-order",
          payload: {},
          now: 3_000,
        });
      });
      outbox.drainOutbox(4_000, () => { throw new Error("injected_dispatch_failure"); });
      assert.equal(storage.getState().outbox.obx_retry_after_failure?.status, "pending");
    });
  } finally {
    console.error = originalError;
  }

  const failed = persistedOutboxRow("obx_retry_after_failure");
  assert.equal(failed?.status, "pending", "a failed handoff cannot claim delivery");
  assert.equal(failed?.attempts, 1);
  assert.equal(failed?.lastAttemptAt, 4_000);
  assert.equal(failed?.lastError, "injected_dispatch_failure");
  assert.equal(failed?.deliveredAt, undefined);

  let retried = 0;
  assert.equal(outbox.drainOutbox(5_000, () => { retried += 1; }), 1);
  const recovered = persistedOutboxRow("obx_retry_after_failure");
  assert.equal(retried, 1);
  assert.equal(recovered?.status, "delivered");
  assert.equal(recovered?.attempts, 2);
  assert.equal(recovered?.lastAttemptAt, 5_000);
  assert.equal(recovered?.lastError, undefined);
  assert.equal(recovered?.deliveredAt, 5_000);
});

test("a rolled-back transaction neither persists nor dispatches its queued outbox event", async () => {
  let dispatches = 0;
  await assert.rejects(
    coordinator.withPortalStateTransaction("outbox:rollback-order", () => {
      storage.mutate(state => {
        outbox.recordOutboxEvent(state, {
          id: "obx_rolled_back",
          name: "outbox.rolled_back",
          agencyId: "agency-outbox-order",
          source: "scripts/smoke-outbox-postcommit-order",
          payload: {},
        });
      });
      outbox.drainOutbox(6_000, () => { dispatches += 1; });
      throw new Error("injected_transaction_failure");
    }),
    /injected_transaction_failure/,
  );

  assert.equal(dispatches, 0);
  assert.equal(persistedOutboxRow("obx_rolled_back"), undefined);
});
