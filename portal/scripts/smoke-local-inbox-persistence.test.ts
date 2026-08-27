import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require_.resolve("tsx");
const storeUrl = pathToFileURL(join(repoRoot, "src/lib/server/inbox/inboxStore.ts")).href;
const root = mkdtempSync(join(tmpdir(), "aquacrm-local-inbox-"));

test.after(() => rmSync(root, { recursive: true, force: true }));

const childSource = String.raw`
const loaded = await import(process.env.AQUA_INBOX_STORE_URL);
const store = loaded.default || loaded;
const action = process.env.AQUA_INBOX_ACTION;
const index = Number(process.env.AQUA_INBOX_INDEX || 0);
let value;
if (action === "inspect-errors") {
  let readError;
  let writeError;
  try { await store.listInboxConnections("agn_test"); } catch (error) { readError = { name: error?.name, message: error?.message }; }
  try { await store.enqueueInboxWebhookEvent({ eventKey: "must-not-land", payload: { entry: [] } }); } catch (error) { writeError = { name: error?.name, message: error?.message }; }
  value = { readError, writeError };
} else if (action === "webhook") {
  value = await store.enqueueInboxWebhookEvent({ eventKey: process.env.AQUA_INBOX_EVENT_KEY || "event-" + index, payload: { entry: [], index } });
} else if (action === "connection") {
  value = await store.saveInboxConnection({
    id: "chn_" + index,
    agencyId: "agn_test",
    provider: "meta",
    channel: index % 2 ? "facebook" : "instagram",
    authMode: index % 2 ? "facebook-login" : "instagram-login",
    externalAccountId: "account_" + index,
    displayName: "Account " + index,
    scopes: [],
    status: "connected",
    webhookStatus: "active",
    encryptedAccessToken: "encrypted-" + index,
  });
} else if (action === "message") {
  value = await store.saveInboxMessage({
    id: "msg_" + index,
    agencyId: "agn_test",
    connectionId: "chn_0",
    conversationId: "cnv_shared",
    externalMessageId: "external_" + index,
    direction: "inbound",
    type: "text",
    text: "Message " + index,
    attachments: [],
    status: "received",
    metadata: {},
    sentAt: 1_800_000_000_000 + index,
  });
} else if (action === "claim") {
  value = await store.claimInboxWebhookEvents(1, {
    leaseOwner: "claim-worker-" + index,
    leaseMs: 5_000,
    now: 1_800_000_100_000,
  });
} else {
  throw new Error("Unknown local Inbox test action: " + action);
}
process.stdout.write(JSON.stringify({ ok: true, value }));
`;

function childEnv(file: string, action: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    INBOX_STORAGE_BACKEND: "file",
    INBOX_LOCAL_DATA_FILE: file,
    TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json"),
    AQUA_INBOX_STORE_URL: storeUrl,
    AQUA_INBOX_ACTION: action,
    ...extra,
  };
}

function command() {
  return [
    "--conditions=react-server",
    "--import",
    tsxLoader,
    "--input-type=module",
    "--eval",
    childSource,
  ];
}

function runChild(file: string, action: string, extra: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, command(), {
    cwd: repoRoot,
    env: childEnv(file, action, extra),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as { ok: true; value: unknown };
}

function runChildConcurrent(file: string, action: string, index: number): Promise<{ ok: true; value: unknown }> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, command(), {
      cwd: repoRoot,
      env: childEnv(file, action, { AQUA_INBOX_INDEX: String(index) }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) {
        rejectChild(new Error(`child ${action}:${index} exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { ok: true; value: unknown };
        assert.equal(parsed.ok, true);
        resolveChild(parsed);
      } catch (error) {
        rejectChild(error);
      }
    });
  });
}

function artifacts(file: string): string[] {
  const folder = dirname(file);
  const name = file.slice(folder.length + 1);
  return readdirSync(folder).filter(entry => entry.startsWith(`${name}.`) && (entry.endsWith(".tmp") || entry.includes("aqua-lock")));
}

test("malformed local Inbox state fails closed and remains byte-identical", () => {
  const folder = join(root, "corrupt");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "inbox.json");
  const corrupt = "{ this is not valid Inbox JSON";
  writeFileSync(file, corrupt, "utf8");

  const result = runChild(file, "inspect-errors").value as {
    readError: { name: string; message: string };
    writeError: { name: string; message: string };
  };
  assert.equal(result.readError.name, "InboxLocalRecoveryRequiredError");
  assert.equal(result.writeError.name, "InboxLocalRecoveryRequiredError");
  assert.match(result.readError.message, /Restore or deliberately replace it before writing/);
  assert.equal(readFileSync(file, "utf8"), corrupt);
  assert.deepEqual(artifacts(file), []);
});

test("valid JSON with a malformed collection is recovery-required, not silently normalised", () => {
  const folder = join(root, "invalid-shape");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "inbox.json");
  const malformed = JSON.stringify({ connections: { accidentally: "an object" } });
  writeFileSync(file, malformed, "utf8");

  const result = runChild(file, "inspect-errors").value as {
    readError: { name: string; message: string };
    writeError: { name: string; message: string };
  };
  assert.equal(result.readError.name, "InboxLocalRecoveryRequiredError");
  assert.equal(result.writeError.name, "InboxLocalRecoveryRequiredError");
  assert.match(result.readError.message, /connections collection is malformed/);
  assert.equal(readFileSync(file, "utf8"), malformed);
});

test("write and rename failures are surfaced without changing the last good snapshot", () => {
  const folder = join(root, "faults");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "inbox.json");
  runChild(file, "webhook", { AQUA_INBOX_EVENT_KEY: "original" });
  const original = readFileSync(file, "utf8");

  for (const [fault, marker] of [
    ["AQUA_TEST_INBOX_FAIL_WRITE", "inbox_test_write_failure"],
    ["AQUA_TEST_INBOX_FAIL_RENAME", "inbox_test_rename_failure"],
  ] as const) {
    const result = spawnSync(process.execPath, command(), {
      cwd: repoRoot,
      env: childEnv(file, "webhook", {
        AQUA_INBOX_EVENT_KEY: `rejected-${fault}`,
        [fault]: "1",
      }),
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(marker));
    assert.equal(readFileSync(file, "utf8"), original);
    assert.deepEqual(artifacts(file), []);
  }
});

test("a process death after fsync preserves the previous snapshot and a new process recovers", () => {
  const folder = join(root, "crash");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "inbox.json");
  runChild(file, "webhook", { AQUA_INBOX_EVENT_KEY: "before-crash" });
  const before = readFileSync(file, "utf8");

  const crashed = spawnSync(process.execPath, command(), {
    cwd: repoRoot,
    env: childEnv(file, "webhook", {
      AQUA_INBOX_EVENT_KEY: "not-committed",
      AQUA_TEST_INBOX_CRASH_AFTER_SYNC: "1",
    }),
    encoding: "utf8",
  });
  assert.equal(crashed.signal, "SIGKILL");
  assert.equal(readFileSync(file, "utf8"), before);
  assert.ok(artifacts(file).length >= 1, "the simulated crash should leave a lock/temp artifact");

  runChild(file, "webhook", { AQUA_INBOX_EVENT_KEY: "after-restart" });
  const state = JSON.parse(readFileSync(file, "utf8")) as { webhookEvents: Array<{ eventKey: string }> };
  assert.deepEqual(new Set(state.webhookEvents.map(event => event.eventKey)), new Set(["before-crash", "after-restart"]));
  assert.deepEqual(artifacts(file), []);
});

test("separate processes preserve concurrent connection, message and webhook writes", async () => {
  const folder = join(root, "concurrent");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "inbox.json");
  await Promise.all([
    ...Array.from({ length: 4 }, (_, index) => runChildConcurrent(file, "connection", index)),
    ...Array.from({ length: 4 }, (_, index) => runChildConcurrent(file, "message", index)),
    ...Array.from({ length: 4 }, (_, index) => runChildConcurrent(file, "webhook", index)),
  ]);

  const state = JSON.parse(readFileSync(file, "utf8")) as {
    connections: Array<{ id: string }>;
    messages: Array<{ id: string }>;
    webhookEvents: Array<{ eventKey: string }>;
  };
  assert.deepEqual(new Set(state.connections.map(row => row.id)), new Set(["chn_0", "chn_1", "chn_2", "chn_3"]));
  assert.deepEqual(new Set(state.messages.map(row => row.id)), new Set(["msg_0", "msg_1", "msg_2", "msg_3"]));
  assert.deepEqual(new Set(state.webhookEvents.map(row => row.eventKey)), new Set(["event-0", "event-1", "event-2", "event-3"]));
  assert.deepEqual(artifacts(file), []);

  const lockSource = readFileSync(resolve(repoRoot, "src/lib/server/dev/devFileTransaction.ts"), "utf8");
  assert.match(lockSource, /async function releaseLock[\s\S]*await rename\(directory, released\)[\s\S]*await rm\(released/);
  assert.doesNotMatch(lockSource, /return async \(\) => \{ await rm\(directory/,
    "recursive removal of the canonical lock path can erase a successor lock");
});

test("two separate claimers cannot both own one local webhook event", async () => {
  const folder = join(root, "concurrent-claim");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "inbox.json");
  runChild(file, "webhook", { AQUA_INBOX_EVENT_KEY: "claim-once" });

  const results = await Promise.all([
    runChildConcurrent(file, "claim", 1),
    runChildConcurrent(file, "claim", 2),
  ]);
  const claims = results.flatMap(result => result.value as Array<{ eventKey: string; leaseOwner: string }>);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].eventKey, "claim-once");
  assert.match(claims[0].leaseOwner, /^claim-worker-[12]$/);
  assert.deepEqual(artifacts(file), []);
});
