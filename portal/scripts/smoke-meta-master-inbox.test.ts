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
  const meta = await import("../src/lib/server/integrations/metaMessaging");

  // The META_* env above is the FOUNDER'S Meta app, so only the founder's own
  // agency may fall back to it. Seed the founder into `agn_test` so this test
  // exercises the case the env is actually for. (It used to pass because ANY
  // agency inherited these credentials — which on a multi-company deployment
  // meant a second company's Meta inbox ran on Ed's app id and secret.)
  const storage = await import("../src/server/storage");
  const users = await import("../src/server/users");
  await storage.ensureHydrated();
  users.createUser({
    email: process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com",
    name: "Founder",
    role: "agency-owner",
    agencyId: "agn_test",
    password: "meta-smoke-founder-password",
  });

  const readiness = meta.metaInboxReadiness("agn_test");
  assert.equal(readiness.configured, true);

  // A DIFFERENT company with no Meta connection of its own must NOT be told it
  // is configured — otherwise it silently sends as the founder's app.
  assert.equal(
    meta.metaInboxReadiness("agn_someone_else").configured,
    false,
    "a second company must connect its own Meta app, not inherit the founder's",
  );
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

  const config = meta.readMetaMessagingConfig("agn_test");
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
  const store = await import("../src/lib/server/inbox/inboxStore");
  const vault = await import("../src/lib/server/inbox/inboxVault");
  const service = await import("../src/lib/server/inbox/inboxService");
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

test("webhook verification resolves the owning agency's stored credentials, not just env", async () => {
  const meta = await import("../src/lib/server/integrations/metaMessaging");
  const connections = await import("../src/lib/server/integrations/integrationConnections");
  const crypto = await import("node:crypto");

  // Store a Meta app connection for agn_test whose App Secret + verify token differ from env.
  const storedConnection = connections.saveIntegrationConnection({
    agencyId: "agn_test",
    provider: "meta",
    label: "Stored Meta app",
    values: { appId: "app_555", appSecret: "stored-app-secret", webhookVerifyToken: "stored-verify-token", graphApiVersion: "v21.0" },
    actorUserId: "owner",
  });
  connections.activateIntegrationConnection({
    agencyId: "agn_test",
    connectionId: storedConnection.id,
    actorUserId: "owner",
    allowUntested: true,
  });

  // A webhook for the connected account (ig_business_123 → agn_test, saved in the prior test)
  // signed with the STORED secret verifies — proving account → agency → stored-secret resolution.
  const raw = JSON.stringify({ object: "instagram", entry: [{ id: "ig_business_123", messaging: [] }] });
  const sign = (secret: string) => `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(await meta.verifyMetaWebhookRequest(raw, sign("stored-app-secret"), JSON.parse(raw)), true);
  // The env secret stays a valid fallback candidate; an unrelated secret is rejected.
  assert.equal(await meta.verifyMetaWebhookRequest(raw, sign(process.env.META_APP_SECRET!), JSON.parse(raw)), true);
  assert.equal(await meta.verifyMetaWebhookRequest(raw, sign("totally-wrong"), JSON.parse(raw)), false);
  assert.equal(await meta.verifyMetaWebhookRequest(raw, null, JSON.parse(raw)), false);

  // The GET handshake accepts the stored verify token and the env token, but not a wrong one.
  assert.equal(meta.metaWebhookVerifyTokenAccepted("stored-verify-token"), true);
  assert.equal(meta.metaWebhookVerifyTokenAccepted(process.env.META_WEBHOOK_VERIFY_TOKEN!), true);
  assert.equal(meta.metaWebhookVerifyTokenAccepted("not-a-real-token"), false);

  // …and the compare is CONSTANT-TIME (audit hardening: it used to be a Set
  // lookup, unlike the timing-safe signature path). The contract must survive
  // near-miss tokens of every shape — a prefix, a suffix, a same-length
  // one-character change, and one differing only in case.
  for (const nearMiss of [
    "stored-verify-toke",     // prefix of a real token
    "stored-verify-tokenX",   // real token + a char
    "stored-verify-tokeN",    // same length, last char differs
    "Stored-Verify-Token",    // same length, case differs
    "stored-verify-tokem",
    " stored-verify-token",   // leading space (candidates are trimmed, input is not)
    "",
  ]) {
    assert.equal(
      meta.metaWebhookVerifyTokenAccepted(nearMiss),
      false,
      `near-miss token "${nearMiss}" must not pass the handshake`,
    );
  }
});

test("the webhook verify-token compare is constant-time, not a Set lookup", async () => {
  const meta = await import("../src/lib/server/integrations/metaMessaging");
  const { readFileSync } = await import("node:fs");

  // Behaviour of the primitive itself: matches any candidate, rejects near
  // misses, and tolerates length differences (timingSafeEqual would THROW on
  // mismatched buffers if the values weren't digested to a fixed length first).
  assert.equal(meta.constantTimeSecretMatch("b", ["a", "b", "c"]), true);
  assert.equal(meta.constantTimeSecretMatch("b", ["a", "c"]), false);
  assert.equal(meta.constantTimeSecretMatch("b", []), false);
  assert.equal(meta.constantTimeSecretMatch("short", ["a-much-longer-candidate-value"]), false);
  assert.equal(meta.constantTimeSecretMatch("a-much-longer-supplied-value", ["x"]), false);
  assert.equal(meta.constantTimeSecretMatch("", [""]), true, "equal values match regardless of length");
  // Unicode / non-ASCII must not throw or mis-compare (utf8-encoded digest).
  assert.equal(meta.constantTimeSecretMatch("tökén-✓", ["tökén-✓"]), true);
  assert.equal(meta.constantTimeSecretMatch("tökén-✓", ["tökén-x"]), false);

  // Source guardrail — pin the primitive against a regression back to `===` /
  // `Set.has`, and keep it aligned with the signature path.
  const src = readFileSync("src/lib/server/integrations/metaMessaging.ts", "utf8");
  assert.match(src, /export function constantTimeSecretMatch/);
  assert.match(src, /crypto\.timingSafeEqual\(suppliedDigest, candidateDigest\)/);
  assert.match(src, /return constantTimeSecretMatch\(suppliedToken, candidates\);/);
  assert.doesNotMatch(src, /candidates\.has\(suppliedToken\)/, "the Set-lookup compare must not come back");
  // The POST signature path stays timing-safe too (posture unchanged).
  assert.match(src, /a\.length === b\.length && a\.length > 0 && crypto\.timingSafeEqual\(a, b\)/);
});

test("multiple accounts on one Meta app coexist as distinct, independently-routed profiles", async () => {
  const store = await import("../src/lib/server/inbox/inboxStore");
  const vault = await import("../src/lib/server/inbox/inboxVault");
  const service = await import("../src/lib/server/inbox/inboxService");
  const sentAt = Date.now() - 30_000;

  // A second account — a Facebook Page — under the SAME agency + same Meta app as ig_business_123.
  await store.saveInboxConnection({
    agencyId: "agn_test",
    provider: "meta",
    channel: "facebook",
    authMode: "facebook-login",
    externalAccountId: "fb_page_999",
    externalPageId: "fb_page_999",
    displayName: "Aqua Test Page",
    scopes: ["pages_manage_metadata", "pages_messaging"],
    status: "connected",
    webhookStatus: "subscribed",
    encryptedAccessToken: vault.encryptInboxSecret("fb-page-token"),
  });

  // A delivery addressed to the Facebook Page routes to ITS connection (account id → connection).
  await store.enqueueInboxWebhookEvent({
    eventKey: "fb-delivery-1",
    objectType: "page",
    payload: {
      object: "page",
      entry: [{
        id: "fb_page_999",
        time: sentAt,
        messaging: [{
          sender: { id: "fb_customer_777" },
          recipient: { id: "fb_page_999" },
          timestamp: sentAt,
          message: { mid: "fb_message_1", text: "Hello from Facebook" },
        }],
      }],
    },
  });
  await service.processInboxWebhookQueue();

  const snapshot = await store.listInboxSnapshot("agn_test");
  const live = snapshot.connections.filter(connection => connection.status !== "disconnected");
  assert.equal(live.length, 2); // ig_business_123 + fb_page_999 — both live, distinct sending profiles
  const igConversation = snapshot.conversations.find(item => item.connection.externalAccountId === "ig_business_123");
  const fbConversation = snapshot.conversations.find(item => item.connection.externalAccountId === "fb_page_999");
  assert.ok(igConversation, "the Instagram account keeps its own conversation");
  assert.ok(fbConversation, "the Facebook account has its own conversation, routed by account id");
  assert.equal(fbConversation!.connection.channel, "facebook");
  assert.equal(fbConversation!.messages[0]?.text, "Hello from Facebook");

  // Disconnecting one account leaves the other — and its history — intact.
  const igConnection = live.find(connection => connection.externalAccountId === "ig_business_123")!;
  await store.disconnectInboxConnection("agn_test", igConnection.id);
  const after = await store.listInboxSnapshot("agn_test");
  assert.equal(after.connections.filter(connection => connection.status !== "disconnected").length, 1);
  assert.ok(after.connections.some(connection => connection.externalAccountId === "fb_page_999" && connection.status !== "disconnected"));
});
