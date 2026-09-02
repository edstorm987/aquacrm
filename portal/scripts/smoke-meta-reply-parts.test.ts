import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { withSession } from "./dev-console-request-scope";

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
let sessionToken = "";

test.before(async () => {
  const storage = await import("../src/server/storage");
  const users = await import("../src/server/users");
  const vault = await import("../src/lib/server/inbox/inboxVault");
  const store = await storePromise;
  const service = await servicePromise;
  await storage.ensureHydrated();
  const owner = users.createUser({
    email: process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com",
    name: "Reply-parts founder",
    role: "agency-owner",
    agencyId: "agn_reply_parts",
    password: "reply-parts-founder-password",
  });
  const auth = await import("../src/lib/server/auth/auth");
  sessionToken = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: owner.agencyId,
    agencyIds: [owner.agencyId!],
    activeAgencyId: owner.agencyId,
    sessionRev: owner.sessionRev ?? 0,
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

test("retry-only attachment replay is payload-bound before a changed upload is claimed", async () => {
  const { NextRequest } = await import("next/server");
  const route = await import("../src/app/api/portal/inbox/messages/route");
  const lifecycle = await import("../src/lib/server/privateObjectLifecycle");
  const inboxMedia = await import("../src/lib/server/inbox/inboxMedia");
  const storage = await import("../src/server/storage");
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({ message_id: `provider-bound-${providerCalls}` });
  };

  const stage = async (id: string) => {
    const storageKey = `agn_reply_parts/social/${conversationId}/${id}.pdf`;
    const requestHash = lifecycle.privateObjectRequestHash(["reply-bound", id, storageKey]);
    await lifecycle.beginStagedPrivateUpload({
      agencyId: "agn_reply_parts",
      purpose: "inbox-media",
      objectId: id,
      requestHash,
      planned: { storageProvider: "local", storageKey },
      localDirectory: "inbox-media",
    });
    await lifecycle.confirmStagedPrivateUpload({
      agencyId: "agn_reply_parts",
      purpose: "inbox-media",
      objectId: id,
      requestHash,
      stored: { storageProvider: "local", storageKey },
    });
    return inboxMedia.signInboxMediaToken({
      agencyId: "agn_reply_parts",
      targetKind: "social",
      targetId: conversationId,
      id,
      name: `${id}.pdf`,
      size: 12,
      contentType: "application/pdf",
      kind: "file",
      storageProvider: "local",
      storageKey,
    });
  };
  const post = (body: Record<string, unknown>) => withSession(sessionToken, () => route.POST(new NextRequest(
    "https://reply-parts.aquacrm.test/api/portal/inbox/messages",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  )));

  try {
    const originalToken = await stage("ima_bound_original");
    const base = {
      conversationId,
      text: "Bound attachment",
      attachments: [{ token: originalToken }],
      operationId: "reply-operation-bound-1",
    };
    const first = await post(base);
    assert.equal(first.status, 200, await first.text());
    assert.equal(providerCalls, 2, "text and attachment should each be delivered once");

    const replay = await post({ ...base, retryOnly: true });
    assert.equal(replay.status, 200, await replay.text());
    assert.equal(providerCalls, 2, "a lost-success replay must perform zero new provider calls");

    const malformed = await post({ ...base, attachments: "not-an-attachment-list", retryOnly: true });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as { error?: string }).error, "inbox_attachment_invalid");
    assert.equal(providerCalls, 2, "malformed attachment input must not become a payloadless replay");

    const changedId = "ima_bound_changed";
    const changedToken = await stage(changedId);
    const changed = await post({ ...base, attachments: [{ token: changedToken }], retryOnly: true });
    assert.equal(changed.status, 400);
    assert.equal((await changed.json() as { error?: string }).error, "inbox_reply_operation_payload_conflict");
    assert.equal(providerCalls, 2, "a changed attachment must conflict before provider delivery");
    const changedLifecycle = Object.values(storage.getState().privateObjectLifecycles)
      .find(record => record.objectId === changedId);
    assert.equal(changedLifecycle?.state, "uploading", "a definitely refused owner must release only its staged claim");
    assert.equal(changedLifecycle?.claimId, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a known lost-success owner is recovered before a later connection refusal", async () => {
  const { NextRequest } = await import("next/server");
  const route = await import("../src/app/api/portal/inbox/messages/route");
  const lifecycle = await import("../src/lib/server/privateObjectLifecycle");
  const inboxMedia = await import("../src/lib/server/inbox/inboxMedia");
  const storage = await import("../src/server/storage");
  const service = await servicePromise;
  const store = await storePromise;
  const originalFetch = globalThis.fetch;
  const objectId = "ima_known_owner";
  const operationId = "reply-operation-known-owner-1";
  const storageKey = `agn_reply_parts/social/${conversationId}/${objectId}.pdf`;
  const requestHash = lifecycle.privateObjectRequestHash(["reply-known-owner", objectId, storageKey]);
  const claimId = lifecycle.privateObjectRequestHash([
    "inbox-reply-owner",
    "agn_reply_parts",
    conversationId,
    operationId,
  ]);
  const binding = { objectId, storageProvider: "local" as const, storageKey };
  const token = inboxMedia.signInboxMediaToken({
    agencyId: "agn_reply_parts",
    targetKind: "social",
    targetId: conversationId,
    id: objectId,
    name: `${objectId}.pdf`,
    size: 12,
    contentType: "application/pdf",
    kind: "file",
    storageProvider: "local",
    storageKey,
  });
  const attachment = {
    type: "file" as const,
    url: inboxMedia.inboxMediaUrl("https://reply-parts.aquacrm.test", token),
    title: `${objectId}.pdf`,
    mimeType: "application/pdf",
  };

  globalThis.fetch = async () => Response.json({ message_id: "provider-known-owner" });
  try {
    await lifecycle.beginStagedPrivateUpload({
      agencyId: "agn_reply_parts",
      purpose: "inbox-media",
      objectId,
      requestHash,
      planned: { storageProvider: "local", storageKey },
      localDirectory: "inbox-media",
    });
    await lifecycle.confirmStagedPrivateUpload({
      agencyId: "agn_reply_parts",
      purpose: "inbox-media",
      objectId,
      requestHash,
      stored: { storageProvider: "local", storageKey },
    });
    await lifecycle.claimStagedPrivateUploadsForOwnership({
      agencyId: "agn_reply_parts",
      purpose: "inbox-media",
      objectIds: [objectId],
      expectedBindings: [binding],
      claimId,
    });

    // Simulate the owner write succeeding while the route loses the readiness
    // acknowledgement before it can finalize the staged object.
    const owner = await service.sendInboxReply({
      agencyId: "agn_reply_parts",
      conversationId,
      text: "Known owner attachment",
      attachments: [attachment],
      actorUserId: "usr_reply_parts",
      operationId,
    });
    const beforeRetry = Object.values(storage.getState().privateObjectLifecycles)
      .find(record => record.objectId === objectId);
    assert.equal(beforeRetry?.state, "claiming");
    assert.equal(beforeRetry?.claimId, claimId);

    await store.updateInboxConnection("agn_reply_parts", "chn_reply_parts", {
      status: "needs-attention",
      lastError: "provider temporarily unavailable",
    });
    const response = await withSession(sessionToken, () => route.POST(new NextRequest(
      "https://reply-parts.aquacrm.test/api/portal/inbox/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          text: "Known owner attachment",
          attachments: [{ token }],
          operationId,
          retryOnly: true,
        }),
      },
    )));
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error?: string }).error, "inbox_connection_not_ready");
    const recovered = Object.values(storage.getState().privateObjectLifecycles)
      .find(record => record.objectId === objectId);
    assert.equal(recovered?.state, "ready", "the persisted owner must win over the later provider refusal");
    assert.equal(recovered?.ownerId, owner.id);
    assert.equal(recovered?.claimId, claimId);
  } finally {
    await store.updateInboxConnection("agn_reply_parts", "chn_reply_parts", {
      status: "connected",
      lastError: undefined,
    });
    globalThis.fetch = originalFetch;
  }
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
  const unifiedUi = readFileSync(resolve("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx"), "utf8");
  assert.match(migration, /for update/i);
  assert.match(migration, /claim_inbox_reply_part/);
  assert.match(migration, /settle_inbox_reply_part/);
  assert.match(migration, /status', 'uncertain'/);
  assert.match(migration, /revoke all on function public\.claim_inbox_reply_part/);
  assert.match(route, /retryOnly/);
  assert.match(route, /InboxReplyDeliveryError/);
  assert.match(route, /expectedBindings: stagedBindings/);
  assert.match(route, /releaseStagedPrivateUploadOwnershipClaim/);
  assert.match(route, /recoverStagedPrivateUploadOwnershipClaim/);
  assert.match(ui, /Retry remaining/);
  assert.match(ui, /Partially sent/);
  assert.match(ui, /operationId: progress\.operation\.operationId/);
  assert.match(ui, /const payloadKey = JSON\.stringify\(\[selected\.id, draft\.trim\(\)\.slice\(0, 2_000\)\]\)/);
  assert.match(ui, /draftOperation\?\.payloadKey === payloadKey/);
  assert.match(unifiedUi, /attachments\.map\(attachment => attachment\.token\)/);
  assert.match(unifiedUi, /draftOperation\?\.payloadKey === payloadKey/);
});
