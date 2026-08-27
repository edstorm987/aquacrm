import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testRoot = mkdtempSync(join(tmpdir(), "aquacrm-meta-lease-"));
const inboxFile = join(testRoot, "inbox.json");
const require_ = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require_.resolve("tsx");
const inboxStoreUrl = pathToFileURL(join(repoRoot, "src/lib/server/inbox/inboxStore.ts")).href;

const childSource = String.raw`
const loaded = await import(process.env.AQUA_INBOX_STORE_URL);
const store = loaded.default || loaded;
const now = Number(process.env.AQUA_LEASE_NOW);
let claimed;
if (process.env.AQUA_LEASE_ACTION === "claim-and-crash") {
  await store.enqueueInboxWebhookEvent({ eventKey: "cross-process-crash", payload: { entry: [] } });
  claimed = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "crashed-process",
    leaseMs: 2_000,
    now,
  }))[0];
} else if (process.env.AQUA_LEASE_ACTION === "reclaim-and-complete") {
  claimed = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "replacement-process",
    leaseMs: 2_000,
    now,
  }))[0];
  if (claimed) await store.completeInboxWebhookEvent(claimed.id, "replacement-process", now + 1);
} else {
  throw new Error("Unknown lease child action");
}
process.stdout.write(JSON.stringify(claimed));
`;

function runLeaseChild(action: "claim-and-crash" | "reclaim-and-complete", file: string, now: number) {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--import",
    tsxLoader,
    "--input-type=module",
    "--eval",
    childSource,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      INBOX_STORAGE_BACKEND: "file",
      INBOX_LOCAL_DATA_FILE: file,
      TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json"),
      AQUA_INBOX_STORE_URL: inboxStoreUrl,
      AQUA_LEASE_ACTION: action,
      AQUA_LEASE_NOW: String(now),
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as {
    id: string;
    status: string;
    attempts: number;
    leaseOwner?: string;
  };
}

process.env.NODE_ENV = "test";
process.env.INBOX_STORAGE_BACKEND = "file";
process.env.INBOX_LOCAL_DATA_FILE = inboxFile;

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test("a crashed worker's stale webhook lease is reclaimed and fenced", async () => {
  const store = await import("../src/lib/server/inbox/inboxStore");
  const start = Date.now() + 100;
  await store.enqueueInboxWebhookEvent({ eventKey: "lease-reclaim", payload: { entry: [] } });

  const first = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "worker-a",
    leaseMs: 2_000,
    now: start,
  }))[0];
  assert.ok(first);
  assert.equal(first.status, "processing");
  assert.equal(first.attempts, 1);
  assert.equal(first.leaseOwner, "worker-a");
  assert.equal(first.leaseExpiresAt, start + 2_000);

  assert.deepEqual(await store.claimInboxWebhookEvents(1, {
    leaseOwner: "worker-b",
    leaseMs: 2_000,
    now: start + 1_999,
  }), [], "an active claim cannot be stolen");
  await assert.rejects(
    store.completeInboxWebhookEvent(first.id, "worker-b", start + 500),
    store.InboxWebhookLeaseLostError,
  );

  const reclaimed = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "worker-b",
    leaseMs: 2_000,
    now: start + 2_000,
  }))[0];
  assert.equal(reclaimed.id, first.id);
  assert.equal(reclaimed.attempts, 2);
  assert.equal(reclaimed.leaseOwner, "worker-b");

  await assert.rejects(
    store.completeInboxWebhookEvent(first.id, "worker-a", start + 2_001),
    store.InboxWebhookLeaseLostError,
    "the stale worker cannot complete the replacement's claim",
  );
  await store.completeInboxWebhookEvent(reclaimed.id, "worker-b", start + 2_001);
  assert.deepEqual(await store.claimInboxWebhookEvents(1, {
    leaseOwner: "worker-c",
    now: start + 10_000,
  }), []);
});

test("failure is lease-conditional and retry retains bounded backoff", async () => {
  const store = await import("../src/lib/server/inbox/inboxStore");
  const start = Date.now() + 20_000;
  await store.enqueueInboxWebhookEvent({ eventKey: "lease-fail", payload: { entry: [] } });
  const claimed = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "worker-fail",
    leaseMs: 5_000,
    now: start,
  }))[0];

  await assert.rejects(
    store.failInboxWebhookEvent({ ...claimed, leaseOwner: "other-worker" }, new Error("wrong"), start + 1),
    store.InboxWebhookLeaseLostError,
  );
  await store.failInboxWebhookEvent(claimed, new Error("provider unavailable"), start + 100);
  assert.deepEqual(await store.claimInboxWebhookEvents(1, {
    leaseOwner: "too-early",
    now: start + 30_099,
  }), []);
  const retry = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "retry-worker",
    now: start + 30_100,
  }))[0];
  assert.equal(retry.id, claimed.id);
  assert.equal(retry.attempts, 2);
  await store.completeInboxWebhookEvent(retry.id, "retry-worker", start + 30_101);
});

test("legacy processing rows without lease fields recover after restart", async () => {
  const store = await import("../src/lib/server/inbox/inboxStore");
  await store.enqueueInboxWebhookEvent({ eventKey: "legacy-processing", payload: { entry: [] } });
  const claimed = (await store.claimInboxWebhookEvents(1, { leaseOwner: "dead-worker" }))[0];

  const state = JSON.parse(readFileSync(inboxFile, "utf8")) as {
    webhookEvents: Array<Record<string, unknown>>;
  };
  const row = state.webhookEvents.find(event => event.id === claimed.id)!;
  delete row.leaseOwner;
  delete row.leaseExpiresAt;
  writeFileSync(inboxFile, JSON.stringify(state), "utf8");

  const recovered = (await store.claimInboxWebhookEvents(1, {
    leaseOwner: "restart-worker",
    now: Date.now() + 1,
  }))[0];
  assert.equal(recovered.id, claimed.id);
  assert.equal(recovered.leaseOwner, "restart-worker");
  assert.equal(recovered.attempts, 2);
  await store.completeInboxWebhookEvent(recovered.id, "restart-worker", Date.now() + 2);
});

test("a stale final attempt becomes terminal failed, never permanently processing", async () => {
  const store = await import("../src/lib/server/inbox/inboxStore");
  await store.enqueueInboxWebhookEvent({ eventKey: "final-attempt", payload: { entry: [] } });
  const state = JSON.parse(readFileSync(inboxFile, "utf8")) as {
    webhookEvents: Array<Record<string, unknown>>;
  };
  const row = state.webhookEvents.find(event => event.eventKey === "final-attempt")!;
  row.status = "processing";
  row.attempts = 8;
  row.leaseOwner = "dead-final-worker";
  row.leaseExpiresAt = 1;
  writeFileSync(inboxFile, JSON.stringify(state), "utf8");

  assert.deepEqual(await store.claimInboxWebhookEvents(1, {
    leaseOwner: "replacement",
    now: Date.now(),
  }), []);
  const settled = JSON.parse(readFileSync(inboxFile, "utf8")) as {
    webhookEvents: Array<Record<string, unknown>>;
  };
  const failed = settled.webhookEvents.find(event => event.eventKey === "final-attempt")!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.leaseOwner, undefined);
  assert.equal(failed.leaseExpiresAt, undefined);
  assert.match(String(failed.lastError), /lease expired/i);
});

test("a fresh Node process reclaims work left by a process that exited mid-claim", () => {
  const crossProcessFile = join(testRoot, "cross-process-inbox.json");
  const start = Date.now() + 40_000;
  const crashed = runLeaseChild("claim-and-crash", crossProcessFile, start);
  assert.equal(crashed.status, "processing");
  assert.equal(crashed.attempts, 1);
  assert.equal(crashed.leaseOwner, "crashed-process");

  const replacement = runLeaseChild("reclaim-and-complete", crossProcessFile, start + 2_000);
  assert.equal(replacement.id, crashed.id);
  assert.equal(replacement.status, "processing");
  assert.equal(replacement.attempts, 2);
  assert.equal(replacement.leaseOwner, "replacement-process");

  const state = JSON.parse(readFileSync(crossProcessFile, "utf8")) as {
    webhookEvents: Array<Record<string, unknown>>;
  };
  const row = state.webhookEvents.find(event => event.id === crashed.id)!;
  assert.equal(row.status, "processed");
  assert.equal(row.leaseOwner, undefined);
  assert.equal(row.leaseExpiresAt, undefined);
});

test("the checked-in database contract reclaims atomically and fences stale workers", () => {
  const originalMigration = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20260811113000_master_inbox_messaging.sql"),
    "utf8",
  );
  const upgrade = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20260825090000_meta_webhook_claim_leases.sql"),
    "utf8",
  );
  for (const sql of [originalMigration, upgrade]) {
    assert.match(sql, /lease_owner text/);
    assert.match(sql, /lease_expires_at timestamptz/);
    assert.match(sql, /event\.status = 'processing'[\s\S]*event\.lease_expires_at/);
    assert.match(sql, /for update skip locked/i);
    assert.match(sql, /complete_inbox_webhook_event/);
    assert.match(sql, /fail_inbox_webhook_event/);
    assert.match(sql, /event\.lease_owner = p_lease_owner/);
    assert.match(sql, /event\.lease_expires_at > now\(\)/);
    assert.match(sql, /revoke all on function public\.complete_inbox_webhook_event/);
  }
});
