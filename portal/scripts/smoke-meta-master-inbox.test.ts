import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const testRoot = mkdtempSync(join(tmpdir(), "aquacrm-meta-inbox-"));
process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";
process.env.INBOX_LOCAL_DATA_FILE = join(testRoot, "inbox.json");
process.env.PORTAL_SESSION_SECRET = "test-session-secret-at-least-thirty-two-characters";
process.env.PORTAL_VAULT_ENCRYPTION_KEY = "test-vault-key-at-least-thirty-two-characters";
process.env.META_APP_ID = "1234567890";
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.META_WEBHOOK_VERIFY_TOKEN = "test-webhook-token";
process.env.META_GRAPH_API_VERSION = "v99.0";
process.env.NEXT_PUBLIC_PORTAL_BASE_URL = "https://staging.aquacrm.example";

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test("Meta readiness, OAuth state and webhook signatures fail closed", async () => {
  const meta = await import("../src/lib/server/metaMessaging");
  const readiness = meta.metaInboxReadiness();
  assert.equal(readiness.configured, true);
  assert.equal(readiness.callbackUrl, "https://staging.aquacrm.example/api/portal/inbox/meta/callback");
  assert.equal(readiness.webhookUrl, "https://staging.aquacrm.example/api/webhooks/meta");

  const state = meta.createMetaOAuthState({
    agencyId: "agn_test",
    userId: "usr_test",
    mode: "instagram-login",
    marketingAssetId: "asset_instagram",
    returnUrl: "/portal/agency/inbox?view=social",
  });
  const verified = meta.verifyMetaOAuthState(state);
  assert.equal(verified.ok, true);
  assert.equal(meta.verifyMetaOAuthState(`${state}tampered`).ok, false);

  const config = meta.readMetaMessagingConfig();
  assert.ok(config);
  const authorizeUrl = new URL(meta.buildMetaAuthorizeUrl(config, state, "instagram-login"));
  assert.equal(authorizeUrl.hostname, "www.instagram.com");
  assert.match(authorizeUrl.searchParams.get("scope") ?? "", /instagram_business_manage_messages/);

  const raw = JSON.stringify({ object: "instagram", entry: [] });
  const crypto = await import("node:crypto");
  const signature = `sha256=${crypto.createHmac("sha256", process.env.META_APP_SECRET!).update(raw).digest("hex")}`;
  assert.equal(meta.verifyMetaWebhookSignature(raw, signature, process.env.META_APP_SECRET!), true);
  assert.equal(meta.verifyMetaWebhookSignature(`${raw}x`, signature, process.env.META_APP_SECRET!), false);
});

test("a Meta delivery becomes an idempotent timed Master Inbox conversation", async () => {
  const store = await import("../src/lib/server/inboxStore");
  const vault = await import("../src/lib/server/inboxVault");
  const service = await import("../src/lib/server/inboxService");
  const sentAt = Date.now() - 60_000;

  await store.saveInboxConnection({
    agencyId: "agn_test",
    companyId: "company_aqua",
    marketingAssetId: "asset_instagram",
    provider: "meta",
    channel: "instagram",
    authMode: "instagram-login",
    externalAccountId: "ig_business_123",
    username: "aqua_test",
    displayName: "Aqua Test Instagram",
    scopes: ["instagram_business_basic", "instagram_business_manage_messages"],
    status: "connected",
    webhookStatus: "subscribed",
    encryptedAccessToken: vault.encryptInboxSecret("test-access-token"),
  });

  const payload = {
    object: "instagram",
    entry: [{
      id: "ig_business_123",
      time: sentAt,
      messaging: [{
        sender: { id: "ig_customer_456" },
        recipient: { id: "ig_business_123" },
        timestamp: sentAt,
        message: { mid: "meta_message_1", text: "Hello from Instagram" },
      }],
    }],
  };

  const queued = await store.enqueueInboxWebhookEvent({ eventKey: "delivery-1", objectType: "instagram", payload });
  assert.equal(queued.duplicate, false);
  const duplicate = await store.enqueueInboxWebhookEvent({ eventKey: "delivery-1", objectType: "instagram", payload });
  assert.equal(duplicate.duplicate, true);

  const result = await service.processInboxWebhookQueue();
  assert.deepEqual(result, { claimed: 1, processed: 1, failed: 0, messages: 1 });
  const snapshot = await store.listInboxSnapshot("agn_test");
  assert.equal(snapshot.connections.length, 1);
  assert.equal(snapshot.conversations.length, 1);
  const conversation = snapshot.conversations[0];
  assert.equal(conversation.unreadCount, 1);
  assert.equal(conversation.identity.externalUserId, "ig_customer_456");
  assert.equal(conversation.messages[0]?.text, "Hello from Instagram");
  assert.equal(conversation.messages[0]?.status, "received");
  assert.equal(conversation.responseDueAt, sentAt + 24 * 60 * 60_000);
});
