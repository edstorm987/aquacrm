import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const sandbox = mkdtempSync(join(tmpdir(), "aqua-portal-atomic-"));
const dataFile = join(sandbox, "portal-state.json");
process.env.PORTAL_BACKEND = "file";
process.env.PORTAL_DATA_FILE = dataFile;
process.env.NODE_ENV = "test";

const require_ = createRequire(import.meta.url);
const tsxLoader = require_.resolve("tsx");

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

function persistedPluginData(installId: string): Record<string, unknown> {
  const state = JSON.parse(readFileSync(dataFile, "utf8")) as {
    pluginData?: Record<string, Record<string, unknown>>;
  };
  return state.pluginData?.[installId] ?? {};
}

function runCrashWorker(installId: string): Promise<number | null> {
  const source = String.raw`
    const { createRequire } = await import("node:module");
    const { join } = await import("node:path");
    const require_ = createRequire(join(process.cwd(), "aqua-atomic-crash-worker.cjs"));
    const storageModule = require_("./src/server/storage");
    const { makePluginStorage } = require_("./src/lib/server/pluginStorage");
    await storageModule.ensureHydrated();
    const storage = makePluginStorage(process.env.AQUA_INSTALL_ID);
    await storage.runExclusive("crash-boundary", async () => {
      await storage.set("crash/row", { accepted: false });
      await storage.set("crash/index", ["crash/row"]);
      process.exit(17);
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      tsxLoader,
      "--input-type=module",
      "--eval",
      source,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: dataFile,
        AQUA_INSTALL_ID: installId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 17 && stderr) reject(new Error(stderr));
      else resolve(code);
    });
  });
}

test("coordinated PortalState writes publish once, roll back on failure and defer events", async () => {
  const [storageModule, pluginStorageModule, eventBus, activity] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/pluginStorage"),
    import("../src/server/eventBus"),
    import("../src/server/activity"),
  ]);
  await storageModule.ensureHydrated();
  await storageModule.reset();

  const installId = "install_atomic_transaction";
  const storage = pluginStorageModule.makePluginStorage(installId);
  const originalFile = readFileSync(dataFile, "utf8");
  let failedEvents = 0;
  const stopFailed = eventBus.on("atomic.failed", () => { failedEvents += 1; });

  await assert.rejects(
    storage.runExclusive!("atomic-test", async () => {
      await storage.set("row/failed", { value: 1 });
      await storage.set("index/failed", ["row/failed"]);
      activity.logActivity({
        agencyId: "agency_atomic",
        category: "system",
        action: "atomic.failed",
        message: "This activity must roll back.",
      });
      eventBus.emit({ agencyId: "agency_atomic" }, "atomic.failed", { id: "row/failed" });
      assert.equal(readFileSync(dataFile, "utf8"), originalFile, "file changed before commit");
      throw new Error("injected_atomic_failure");
    }),
    /injected_atomic_failure/,
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await storage.get("row/failed"), undefined);
  assert.equal(storageModule.getState().activity.some(entry => entry.action === "atomic.failed"), false);
  assert.equal(readFileSync(dataFile, "utf8"), originalFile, "failed transaction reached disk");
  assert.equal(failedEvents, 0, "failed transaction dispatched an event");
  stopFailed();

  let committedEvents = 0;
  const stopCommitted = eventBus.on("atomic.committed", () => { committedEvents += 1; });
  await storage.runExclusive!("atomic-test", async () => {
    await storage.set("row/committed", { value: 2 });
    await storage.set("pointer/committed", "row/committed");
    await storage.set("index/committed", ["row/committed"]);
    activity.logActivity({
      agencyId: "agency_atomic",
      category: "system",
      action: "atomic.committed",
      message: "This activity commits with the plugin indexes.",
    });
    eventBus.emit({ agencyId: "agency_atomic" }, "atomic.committed", { id: "row/committed" });
    assert.equal(committedEvents, 0, "event ran before durable commit");
    assert.equal(readFileSync(dataFile, "utf8"), originalFile, "file exposed an intermediate write");
  });
  const committed = persistedPluginData(installId);
  assert.deepEqual(committed["row/committed"], { value: 2 });
  assert.equal(committed["pointer/committed"], "row/committed");
  assert.deepEqual(committed["index/committed"], ["row/committed"]);
  assert.equal(storageModule.getState().activity.some(entry => entry.action === "atomic.committed"), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(committedEvents, 1, "committed event did not dispatch exactly once");
  stopCommitted();

  await storage.runExclusive!("nested-outer", async () => {
    await storage.set("row/nested-outer", { value: 4 });
    void storage.runExclusive!("nested-inner", async () => {
      await new Promise(resolve => setTimeout(resolve, 15));
      await storage.set("row/nested-inner", { value: 5 });
    });
  });
  assert.deepEqual(persistedPluginData(installId)["row/nested-outer"], { value: 4 });
  assert.deepEqual(persistedPluginData(installId)["row/nested-inner"], { value: 5 });

  // A timer inherits both transaction AsyncLocalStorage stores when it is
  // created, even if it does not start its own write until after the outer
  // operation has committed. That stale context used to accept the late write
  // into the dead working tree and resolve successfully while persisting
  // nothing. Hold the callback behind a gate so the ordering is deterministic.
  let releaseEscaped!: () => void;
  let markEscapedStarted!: () => void;
  let resolveEscapedDone!: () => void;
  let rejectEscapedDone!: (error: unknown) => void;
  const escapedGate = new Promise<void>(resolve => { releaseEscaped = resolve; });
  const escapedStarted = new Promise<void>(resolve => { markEscapedStarted = resolve; });
  const escapedDone = new Promise<void>((resolve, reject) => {
    resolveEscapedDone = resolve;
    rejectEscapedDone = reject;
  });
  let escapedEvents = 0;
  const stopEscaped = eventBus.on("atomic.escaped", () => { escapedEvents += 1; });

  await storage.runExclusive!("escaped-owner", async () => {
    await storage.set("row/escaped-owner", { value: 8 });
    setTimeout(() => {
      markEscapedStarted();
      void (async () => {
        await escapedGate;
        await storage.runExclusive!("escaped-successor", async () => {
          await storage.set("row/escaped-successor", { value: 9 });
          eventBus.emit({ agencyId: "agency_atomic" }, "atomic.escaped", { id: "row/escaped-successor" });
        });
      })().then(resolveEscapedDone, rejectEscapedDone);
    }, 0);
    await escapedStarted;
  });

  assert.deepEqual(persistedPluginData(installId)["row/escaped-owner"], { value: 8 });
  assert.equal(persistedPluginData(installId)["row/escaped-successor"], undefined);
  assert.equal(escapedEvents, 0);
  releaseEscaped();
  await escapedDone;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(
    persistedPluginData(installId)["row/escaped-successor"],
    { value: 9 },
    "a callback carrying a closed transaction context must start a fresh durable transaction",
  );
  assert.equal(escapedEvents, 1, "the late event must run once after its fresh commit");
  stopEscaped();

  await assert.rejects(
    storage.runExclusive!("nested-failure-outer", async () => {
      await storage.set("row/nested-failure-outer", { value: 6 });
      void storage.runExclusive!("nested-failure-inner", async () => {
        await storage.set("row/nested-failure-inner", { value: 7 });
        throw new Error("injected_nested_failure");
      });
    }),
    /injected_nested_failure/,
  );
  assert.equal(persistedPluginData(installId)["row/nested-failure-outer"], undefined);
  assert.equal(persistedPluginData(installId)["row/nested-failure-inner"], undefined);

  await assert.rejects(
    storage.runExclusive!("explicit-checkpoint", async () => {
      await storage.set("operation/checkpoint", { state: "provider-pending" });
      await storageModule.flushPendingWrites();
      assert.deepEqual(
        persistedPluginData(installId)["operation/checkpoint"],
        { state: "provider-pending" },
        "an explicit state-first checkpoint was not durable before the provider boundary",
      );
      await storage.set("operation/after-checkpoint", { state: "must-roll-back" });
      throw new Error("injected_after_checkpoint_failure");
    }),
    /injected_after_checkpoint_failure/,
  );
  assert.deepEqual(
    persistedPluginData(installId)["operation/checkpoint"],
    { state: "provider-pending" },
  );
  assert.equal(persistedPluginData(installId)["operation/after-checkpoint"], undefined);

  assert.equal(await runCrashWorker(installId), 17, "crash worker did not stop inside the transaction");
  const afterCrash = persistedPluginData(installId);
  assert.equal(afterCrash["crash/row"], undefined, "process death exposed a partial row");
  assert.equal(afterCrash["crash/index"], undefined, "process death exposed a partial index");

  // The dead worker leaves the lock directory behind. The next transaction
  // must reap that stale owner and remain writable.
  await storage.runExclusive!("after-crash", async () => {
    await storage.set("row/recovered", { value: 3 });
  });
  assert.deepEqual(persistedPluginData(installId)["row/recovered"], { value: 3 });
});
