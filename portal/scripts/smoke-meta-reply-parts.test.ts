import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = mkdtempSync(join(tmpdir(), "aquacrm-meta-reply-parts-"));
const inboxFile = join(root, "inbox.json");

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";
process.env.INBOX_LOCAL_DATA_FILE = inboxFile;
process.env.PORTAL_SESSION_SECRET = "reply-parts-session-secret-at-least-thirty-two-chars";
process.env.PORTAL_VAULT_ENCRYPTION_KEY = "reply-parts-vault-secret-at-least-thirty-two-chars";
process.env.META_APP_ID = "reply-parts-app";
process.env.META_APP_SECRET = "reply-parts-app-secret";
process.env.META_WEBHOOK_VERIFY_TOKEN = "reply-parts-webhook-token";
process.env.META_GRAPH_API_VERSION = "v99.0";
process.env.NEXT_PUBLIC_PORTAL_BASE_URL = "https://reply-parts.aquacrm.test";

const storePromise = import("../src/lib/server/inbox/inboxStore");
const servicePromise = import("../src/lib/server/inbox/inboxService");
const replyDeliveryPromise = import("../src/lib/inbox/replyDelivery");

let conversationId = "";

test.before(async () => {
  const storage = await import("../src/server/storage");
  const users = await import("../src/server/users");
  const vault = await import("../src/lib/server/inbox/inboxVault");
  const store = await storePromise;
  const service = await servicePromise;
  await storage.ensureHydrated();
  users.createUser({
    email: process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com",
    name: "Reply-parts founder",
    role: "agency-owner",
    agencyId: "agn_reply_parts",
    password: "reply-parts-founder-password",
  });
  await store.saveInboxConnection({
    id: "chn_reply_parts",
    agencyId: "agn_reply_parts",
    provider: "meta",
    channel: "instagram",
    authMode: "instagram-login",
    externalAccountId: "business_reply_parts",
    displayName: "Reply parts account",
    scopes: ["instagram_business_manage_messages"],
    status: "connected",
    webhookStatus: "subscribed",
    encryptedAccessToken: vault.encryptInboxSecret("reply-parts-token"),
  });
  const inboundAt = Date.now() - 1_000;
  assert.equal(await service.ingestMetaWebhookPayload({
    object: "instagram",
    entry: [{
      id: "business_reply_parts",
      messaging: [{
        sender: { id: "customer_reply_parts" },
        recipient: { id: "business_reply_parts" },
        timestamp: inboundAt,
        message: { mid: "mid_reply_parts_inbound", text: "Please send the files" },
      }],
    }],
  }), 1);
  const snapshot = await store.listInboxSnapshot("agn_reply_parts");
  conversationId = snapshot.conversations[0]?.id ?? "";
  assert.ok(conversationId);
});

test.after(() => rmSync(root, { recursive: true, force: true }));

test("a partial provider failure retains successful ids and retry sends only the missing part", async () => {
  const service = await servicePromise;
  const store = await storePromise;
  const { readInboxReplyOperation } = await replyDeliveryPromise;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ kind: "text" | "attachment"; body: Record<string, unknown> }> = [];
  let failFirstAttachment = true;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const message = body.message as Record<string, unknown>;
    const kind = message.text ? "text" : "attachment";
    calls.push({ kind, body });
    if (kind === "attachment" && failFirstAttachment) {
      failFirstAttachment = false;
      return Response.json({ error: { message: "attachment unavailable" } }, { status: 503 });
    }
    return Response.json({ message_id: `provider-${kind}-${calls.length}` });
  };

  try {
    let firstFailure: unknown;
    try {
      await service.sendInboxReply({
        agencyId: "agn_reply_parts",
        conversationId,
        text: "Here is the document",
        attachments: [{ type: "file", url: "https://media.aquacrm.test/document.pdf", title: "document.pdf" }],
        actorUserId: "usr_reply_parts",
        operationId: "reply-operation-partial-1",
      });
    } catch (error) {
      firstFailure = error;
    }
    assert.ok(firstFailure instanceof service.InboxReplyDeliveryError);
    assert.equal(firstFailure.message, "inbox_reply_part_failed");
    const partial = firstFailure.reply;
    const partialOperation = readInboxReplyOperation(partial);
    assert.ok(partialOperation);
    assert.equal(partial.status, "failed");
    assert.deepEqual(partialOperation.parts.map(part => [part.id, part.status]), [["text", "sent"], ["attachment:0", "failed"]]);
    assert.equal(partialOperation.parts[0]?.providerMessageId, "provider-text-1");
    assert.equal(calls.filter(call => call.kind === "text").length, 1);

    await store.updateInboxConnection("agn_reply_parts", "chn_reply_parts", { status: "connected", lastError: undefined });
    const sent = await service.sendInboxReply({
      agencyId: "agn_reply_parts",
      conversationId,
      text: "",
      actorUserId: "usr_reply_parts",
      operationId: "reply-operation-partial-1",
      retryOnly: true,
    });
    const sentOperation = readInboxReplyOperation(sent);
    assert.ok(sentOperation);
    assert.equal(sent.id, partial.id);
    assert.equal(sent.status, "sent");
    assert.deepEqual(sentOperation.parts.map(part => part.status), ["sent", "sent"]);
    assert.equal(sentOperation.parts[0]?.providerMessageId, "provider-text-1");
    assert.equal(sentOperation.parts[1]?.providerMessageId, "provider-attachment-3");
    assert.deepEqual(calls.map(call => call.kind), ["text", "attachment", "attachment"]);

    const replayed = await service.sendInboxReply({
      agencyId: "agn_reply_parts",
      conversationId,
      text: "Here is the document",
      attachments: [{ type: "file", url: "https://media.aquacrm.test/document.pdf", title: "document.pdf" }],
      actorUserId: "usr_reply_parts",
      operationId: "reply-operation-partial-1",
    });
    assert.equal(replayed.id, sent.id);
    assert.equal(calls.length, 3, "a completed operation replay must perform zero provider calls");

    const snapshot = await store.listInboxSnapshot("agn_reply_parts");
    const thread = snapshot.conversations.find(item => item.id === conversationId);
    assert.ok(thread);
    assert.equal(thread.messages.filter(message => message.direction === "outbound").length, 1);
    assert.equal(thread.unreadCount, 0);
    assert.equal(thread.lastOutboundAt, sent.sentAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the same operation id refuses a changed payload before another provider call", async () => {
  const service = await servicePromise;
  await assert.rejects(
    () => service.sendInboxReply({
      agencyId: "agn_reply_parts",
      conversationId,
      text: "Changed content",
      attachments: [{ type: "file", url: "https://media.aquacrm.test/document.pdf", title: "document.pdf" }],
      actorUserId: "usr_reply_parts",
      operationId: "reply-operation-partial-1",
    }),
    /inbox_reply_operation_payload_conflict/,
  );
});

test("an expired in-flight part becomes uncertain instead of being claimed for duplicate send", async () => {
  const store = await storePromise;
  const { readInboxReplyOperation } = await replyDeliveryPromise;
  const operationId = "reply-operation-uncertain-1";
  const prepared = await store.prepareInboxReplyOperation({
    message: {
      id: "msg_reply_uncertain_test",
      agencyId: "agn_reply_parts",
      connectionId: "chn_reply_parts",
      conversationId,
      direction: "outbound",
      type: "text",
      text: "Ambiguous delivery",
      attachments: [],
      status: "pending",
      metadata: { actorUserId: "usr_reply_parts" },
      sentAt: 1_900_000_000_000,
    },
    operation: {
      version: 1,
      operationId,
      payloadHash: "payload-uncertain",
      parts: [{ id: "text", kind: "text", status: "pending", attempts: 0, updatedAt: 1_000 }],
    },
  });
  const claimed = await store.claimInboxReplyPart("agn_reply_parts", prepared.id, "text", "worker-a", { now: 1_000, leaseMs: 1_000 });
  assert.equal(claimed.outcome, "claimed");
  const contender = await store.claimInboxReplyPart("agn_reply_parts", prepared.id, "text", "worker-b", { now: 1_500, leaseMs: 1_000 });
  assert.equal(contender.outcome, "busy");
  const recovered = await store.claimInboxReplyPart("agn_reply_parts", prepared.id, "text", "worker-b", { now: 2_001, leaseMs: 1_000 });
  assert.equal(recovered.outcome, "uncertain");
  assert.equal(readInboxReplyOperation(recovered.message)?.parts[0]?.status, "uncertain");
  assert.equal(recovered.message.status, "failed");
});

test("database and UI contracts pin per-part leases, partial truth and retry-only requests", () => {
  const migration = readFileSync(resolve("../supabase/migrations/20260825110000_resumable_meta_reply_parts.sql"), "utf8");
  const route = readFileSync(resolve("src/app/api/portal/inbox/messages/route.ts"), "utf8");
  const ui = readFileSync(resolve("src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx"), "utf8");
  assert.match(migration, /for update/i);
  assert.match(migration, /claim_inbox_reply_part/);
  assert.match(migration, /settle_inbox_reply_part/);
  assert.match(migration, /status', 'uncertain'/);
  assert.match(migration, /revoke all on function public\.claim_inbox_reply_part/);
  assert.match(route, /retryOnly/);
  assert.match(route, /InboxReplyDeliveryError/);
  assert.match(ui, /Retry remaining/);
  assert.match(ui, /Partially sent/);
  assert.match(ui, /operationId: progress\.operation\.operationId/);
});
