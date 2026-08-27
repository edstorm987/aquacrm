import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = mkdtempSync(join(tmpdir(), "aquacrm-meta-conversation-"));
const inboxFile = join(root, "inbox.json");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
const tsxLoader = require_.resolve("tsx");
const serviceUrl = pathToFileURL(join(repoRoot, "src/lib/server/inbox/inboxService.ts")).href;

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";
process.env.INBOX_LOCAL_DATA_FILE = inboxFile;

const storePromise = import("../src/lib/server/inbox/inboxStore");
const servicePromise = import("../src/lib/server/inbox/inboxService");

test.before(async () => {
  const store = await storePromise;
  await store.saveInboxConnection({
    id: "chn_atomic",
    agencyId: "agn_atomic",
    provider: "meta",
    channel: "instagram",
    authMode: "instagram-login",
    externalAccountId: "business_atomic",
    displayName: "Atomic account",
    scopes: [],
    status: "connected",
    webhookStatus: "active",
    encryptedAccessToken: "encrypted-test-token",
  });
});

test.after(() => rmSync(root, { recursive: true, force: true }));

function inbound(userId: string, messageId: string, timestamp: number, referral?: Record<string, unknown>) {
  return {
    object: "instagram",
    entry: [{
      id: "business_atomic",
      messaging: [{
        sender: { id: userId },
        recipient: { id: "business_atomic" },
        timestamp,
        message: { mid: messageId, text: messageId },
        ...(referral ? { referral } : {}),
      }],
    }],
  };
}

function outbound(userId: string, messageId: string, timestamp: number) {
  return {
    object: "instagram",
    entry: [{
      id: "business_atomic",
      messaging: [{
        sender: { id: "business_atomic" },
        recipient: { id: userId },
        timestamp,
        message: { mid: messageId, text: messageId, is_echo: true },
      }],
    }],
  };
}

async function thread(userId: string) {
  const store = await storePromise;
  const snapshot = await store.listInboxSnapshot("agn_atomic");
  const value = snapshot.conversations.find(row => row.externalConversationId === userId);
  assert.ok(value, `missing conversation for ${userId}`);
  return value;
}

test("two concurrent inbound messages retain unread +2 and both rows", async () => {
  const service = await servicePromise;
  const base = 1_800_000_000_000;
  const handled = await Promise.all([
    service.ingestMetaWebhookPayload(inbound("user-concurrent", "mid-concurrent-a", base + 1_000)),
    service.ingestMetaWebhookPayload(inbound("user-concurrent", "mid-concurrent-b", base + 2_000)),
  ]);
  assert.equal(handled.reduce((sum, value) => sum + value, 0), 2);
  const conversation = await thread("user-concurrent");
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.unreadCount, 2);
  assert.equal(conversation.firstInboundAt, base + 1_000);
  assert.equal(conversation.lastInboundAt, base + 2_000);
  assert.equal(conversation.lastMessageAt, base + 2_000);
  assert.equal(conversation.responseDueAt, base + 2_000 + 24 * 60 * 60_000);
});

test("delayed older events cannot regress thread clocks or latest referral facts", async () => {
  const service = await servicePromise;
  const base = 1_800_100_000_000;
  await service.ingestMetaWebhookPayload(inbound("user-delayed", "mid-newer", base + 9_000, {
    source: "new-source",
    campaign_id: "new-campaign",
    source_url: "https://example.test/new",
  }));
  await service.ingestMetaWebhookPayload(inbound("user-delayed", "mid-older", base + 1_000, {
    source: "old-source",
    campaign_id: "old-campaign",
    source_url: "https://example.test/old",
  }));
  const conversation = await thread("user-delayed");
  assert.equal(conversation.unreadCount, 2);
  assert.equal(conversation.firstInboundAt, base + 1_000);
  assert.equal(conversation.lastInboundAt, base + 9_000);
  assert.equal(conversation.lastMessageAt, base + 9_000);
  assert.equal(conversation.responseDueAt, base + 9_000 + 24 * 60 * 60_000);
  assert.equal(conversation.source, "new-source");
  assert.equal(conversation.campaign, "new-campaign");
  assert.equal(conversation.referralUrl, "https://example.test/new");
});

test("outbound-before-inbound arrival still derives the first real response by event time", async () => {
  const service = await servicePromise;
  const base = 1_800_200_000_000;
  await service.ingestMetaWebhookPayload(outbound("user-response", "mid-response", base + 8_000));
  await service.ingestMetaWebhookPayload(inbound("user-response", "mid-question", base + 2_000));
  const conversation = await thread("user-response");
  assert.equal(conversation.firstInboundAt, base + 2_000);
  assert.equal(conversation.firstResponseAt, base + 8_000);
  assert.equal(conversation.lastOutboundAt, base + 8_000);
  assert.equal(conversation.lastMessageAt, base + 8_000);
  assert.equal(conversation.unreadCount, 1);
});

test("replayed provider ids do not increment unread or report a second handled message", async () => {
  const service = await servicePromise;
  const payload = inbound("user-replay", "mid-replay", 1_800_300_000_000);
  const handled = await Promise.all([
    service.ingestMetaWebhookPayload(payload),
    service.ingestMetaWebhookPayload(payload),
  ]);
  assert.deepEqual([...handled].sort(), [0, 1]);
  const conversation = await thread("user-replay");
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.unreadCount, 1);
});

test("delete replay and read receipts leave monotonic conversation facts intact", async () => {
  const service = await servicePromise;
  const base = 1_800_350_000_000;
  await service.ingestMetaWebhookPayload(inbound("user-delete", "mid-delete", base));
  const deletion = {
    object: "instagram",
    entry: [{
      id: "business_atomic",
      messaging: [{
        sender: { id: "user-delete" },
        recipient: { id: "business_atomic" },
        timestamp: base + 9_000,
        message: { mid: "mid-delete", is_deleted: true },
      }],
    }],
  };
  assert.equal(await service.ingestMetaWebhookPayload(deletion), 1);
  assert.equal(await service.ingestMetaWebhookPayload(deletion), 1);
  assert.equal(await service.ingestMetaWebhookPayload({
    object: "instagram",
    entry: [{
      id: "business_atomic",
      messaging: [{
        sender: { id: "user-delete" },
        recipient: { id: "business_atomic" },
        timestamp: base + 10_000,
        read: { watermark: base },
      }],
    }],
  }), 0);
  const conversation = await thread("user-delete");
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].status, "deleted");
  assert.equal(conversation.unreadCount, 1);
  assert.equal(conversation.firstInboundAt, base);
  assert.equal(conversation.lastInboundAt, base);
  assert.equal(conversation.lastMessageAt, base);
  assert.equal(conversation.responseDueAt, base + 24 * 60 * 60_000);
});

const childSource = String.raw`
const loaded = await import(process.env.AQUA_INBOX_SERVICE_URL);
const service = loaded.default || loaded;
const payload = JSON.parse(process.env.AQUA_INBOX_PAYLOAD);
const handled = await service.ingestMetaWebhookPayload(payload);
process.stdout.write(JSON.stringify({ ok: true, handled }));
`;

function runIngestionChild(payload: unknown): Promise<number> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
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
        PORTAL_BACKEND: "memory",
        INBOX_STORAGE_BACKEND: "file",
        INBOX_LOCAL_DATA_FILE: inboxFile,
        TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json"),
        AQUA_INBOX_SERVICE_URL: serviceUrl,
        AQUA_INBOX_PAYLOAD: JSON.stringify(payload),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) {
        rejectChild(new Error(`ingestion child exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolveChild((JSON.parse(stdout) as { ok: true; handled: number }).handled);
      } catch (error) {
        rejectChild(error);
      }
    });
  });
}

test("separate worker processes converge concurrent delivery onto one monotonic thread", async () => {
  const base = 1_800_400_000_000;
  const handled = await Promise.all([
    runIngestionChild(inbound("user-process", "mid-process-a", base + 5_000)),
    runIngestionChild(inbound("user-process", "mid-process-b", base + 7_000)),
  ]);
  assert.equal(handled.reduce((sum, value) => sum + value, 0), 2);
  const conversation = await thread("user-process");
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.unreadCount, 2);
  assert.equal(conversation.firstInboundAt, base + 5_000);
  assert.equal(conversation.lastInboundAt, base + 7_000);
  assert.equal(conversation.lastMessageAt, base + 7_000);
});

test("the database RPC locks, dedupes and derives monotonic conversation facts", () => {
  const sql = readFileSync(
    resolve(repoRoot, "../supabase/migrations/20260825100000_atomic_meta_conversation_ingestion.sql"),
    "utf8",
  );
  const source = readFileSync(resolve(repoRoot, "src/lib/server/inbox/inboxService.ts"), "utf8");
  assert.match(sql, /append_inbox_provider_message/);
  assert.match(sql, /for update/i);
  assert.match(sql, /on conflict \(connection_id, external_message_id\) do nothing/i);
  assert.match(sql, /unread_count = conversation\.unread_count \+ case/i);
  assert.match(sql, /min\(message\.sent_at\) filter \(where message\.direction = 'inbound'\)/i);
  assert.match(sql, /max\(message\.sent_at\) filter \(where message\.direction = 'inbound'\)/i);
  assert.match(sql, /derived_last_inbound \+ interval '24 hours'/i);
  assert.match(sql, /revoke all on function public\.append_inbox_provider_message/);
  assert.match(source, /if \(!appended\.inserted\) return 0;/);
});
