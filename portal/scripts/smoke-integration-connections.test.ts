import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

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

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Connections = typeof import("../src/lib/server/integrations/integrationConnections");
type Communications = typeof import("../src/lib/server/email/outboundCommunications");
type Meta = typeof import("../src/lib/server/integrations/metaMessaging");
type Users = typeof import("../src/server/users");

let storage: Storage;
let tenants: Tenants;
let connections: Connections;
let communications: Communications;
let meta: Meta;
let users: Users;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "integration-smoke-vault-key-longer-than-thirty-two-characters";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  communications = await import("../src/lib/server/email/outboundCommunications");
  meta = await import("../src/lib/server/integrations/metaMessaging");
  users = await import("../src/server/users");
  await storage.ensureHydrated();
  await storage.reset();
});

test("multiple messaging accounts remain distinct send-as identities", async () => {
  const agency = tenants.createAgency({ name: "Messaging Accounts", slug: "messaging-accounts" });
  const first = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "twilio",
    label: "AquaCRM sales",
    values: { accountSid: "AC_sales", authToken: "sales-secret", smsFrom: "+447700900101", whatsappFrom: "+447700900102", voiceFrom: "+447700900103", agentPhone: "+447700900100" },
    actorUserId: "owner",
  });
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "twilio",
    label: "Milesymedia support",
    values: { accountSid: "AC_support", authToken: "support-secret", smsFrom: "+447700900201", whatsappFrom: "+447700900202", voiceFrom: "+447700900203", agentPhone: "+447700900200" },
    actorUserId: "owner",
  });
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "smtp",
    label: "AquaCRM hello",
    values: { host: "smtp.example.com", port: "587", username: "hello@example.com", password: "smtp-secret", fromEmail: "hello@example.com", fromName: "AquaCRM" },
    actorUserId: "owner",
  });

  const readiness = communications.outboundCommunicationReadiness(agency.id);
  assert.equal(readiness.senders.filter(sender => sender.channel === "sms").length, 2);
  assert.equal(readiness.senders.filter(sender => sender.channel === "whatsapp").length, 2);
  assert.equal(readiness.senders.filter(sender => sender.channel === "email").length, 1);
  assert.equal(readiness.senders.filter(sender => sender.channel === "call").length, 3);
  const selected = communications.resolveCommunicationSender(agency.id, `connection:${first.id}:sms`, "sms");
  assert.equal(selected?.label, "AquaCRM sales · SMS");
  assert.equal(communications.resolveCommunicationSender(agency.id, `connection:${first.id}:sms`, "whatsapp"), null);

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /Accounts\/AC_sales\/Messages\.json/);
    assert.equal(new Headers(init?.headers).get("authorization"), `Basic ${Buffer.from("AC_sales:sales-secret").toString("base64")}`);
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("From"), "+447700900101");
    assert.equal(body.get("To"), "+447700900999");
    return Response.json({ sid: "SM_test" });
  };
  try {
    const sent = await communications.sendPhoneMessage({ agencyId: agency.id, sender: selected!, channel: "sms", to: "07700 900999", body: "Hello" });
    assert.equal(sent.delivered, true);
    assert.equal(sent.externalMessageId, "SM_test");
  } finally {
    globalThis.fetch = oldFetch;
  }

  const voiceSender = communications.resolveCommunicationSender(agency.id, `connection:${first.id}:call`, "call");
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /Accounts\/AC_sales\/Calls\.json/);
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("To"), "+447700900100");
    assert.equal(body.get("From"), "+447700900103");
    assert.match(body.get("Twiml") ?? "", /<Number>\+447700900999<\/Number>/);
    return Response.json({ sid: "CA_test" });
  };
  try {
    const call = await communications.initiatePhoneCall({ agencyId: agency.id, sender: voiceSender!, customerPhone: "07700 900999" });
    assert.equal(call.initiated, true);
    assert.equal(call.externalCallId, "CA_test");
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("integration secrets are encrypted at rest and redacted from browser records", () => {
  const agency = tenants.createAgency({ name: "Integration Smoke", slug: "integration-smoke" });
  const saved = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "resend",
    label: "Workspace email",
    values: {
      apiKey: "re_super_secret_test_value",
      fromEmail: "hello@example.com",
      fromName: "Example",
      notifyTo: "owner@example.com",
    },
    actorUserId: "owner",
  });

  assert.deepEqual(saved.config, {
    fromEmail: "hello@example.com",
    fromName: "Example",
    notifyTo: "owner@example.com",
  });
  assert.deepEqual(saved.configuredSecretFields, ["apiKey"]);
  assert.equal("encryptedSecrets" in saved, false);
  assert.doesNotMatch(JSON.stringify(storage.getState()), /re_super_secret_test_value/);
  assert.equal(
    connections.resolveIntegrationValues(agency.id, "resend", { includeEnvironmentFallback: false }).apiKey,
    "re_super_secret_test_value",
  );
});

test("client-scoped credentials override the workspace default and blank edits preserve secrets", () => {
  const agency = tenants.createAgency({ name: "Scoped Integration", slug: "scoped-integration" });
  const firstClient = tenants.createClient(agency.id, { name: "First Client" });
  const secondClient = tenants.createClient(agency.id, { name: "Second Client" });
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "openai",
    values: { apiKey: "sk-workspace", model: "gpt-5-mini" },
    actorUserId: "owner",
  });
  const clientConnection = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "openai",
    clientId: firstClient.id,
    label: "First Client AI",
    values: { apiKey: "sk-client", model: "gpt-5" },
    actorUserId: "owner",
  });
  connections.saveIntegrationConnection({
    agencyId: agency.id,
    connectionId: clientConnection.id,
    provider: "openai",
    clientId: firstClient.id,
    label: "First Client AI edited",
    values: { apiKey: "", model: "gpt-5.1" },
    actorUserId: "owner",
  });

  assert.equal(connections.resolveIntegrationValues(agency.id, "openai", { clientId: firstClient.id }).apiKey, "sk-client");
  assert.equal(connections.resolveIntegrationValues(agency.id, "openai", { clientId: firstClient.id }).model, "gpt-5.1");
  assert.equal(connections.resolveIntegrationValues(agency.id, "openai", { clientId: secondClient.id }).apiKey, "sk-workspace");
});

test("connections can be tested without exposing secrets and revoked completely", async () => {
  const agency = tenants.createAgency({ name: "Connection Test", slug: "connection-test" });
  const saved = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "github",
    values: { token: "github_pat_private", owner: "example" },
    actorUserId: "owner",
  });
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer github_pat_private");
    return Response.json({ login: "example" });
  }) as typeof fetch;
  const tested = await connections.testIntegrationConnection(agency.id, saved.id, { userId: "owner" }, fetchImpl);
  assert.equal(tested.status, "connected");
  assert.equal(tested.lastTestStatus, "passed");
  assert.match(tested.lastTestMessage ?? "", /example/);
  assert.doesNotMatch(JSON.stringify(tested), /github_pat_private/);

  connections.revokeIntegrationConnection({ agencyId: agency.id, connectionId: saved.id, actorUserId: "owner" });
  assert.equal(connections.listIntegrationConnections(agency.id).length, 0);
  assert.equal(connections.resolveIntegrationValues(agency.id, "github", { includeEnvironmentFallback: false }).token, undefined);
});

test("meta app credentials persist encrypted and resolve stored-then-env", async () => {
  const agency = tenants.createAgency({ name: "Meta Messaging", slug: "meta-messaging" });
  const saved = connections.saveIntegrationConnection({
    agencyId: agency.id,
    provider: "meta",
    label: "Meta app",
    values: {
      appId: "1122334455",
      appSecret: "meta_app_secret_value",
      webhookVerifyToken: "verify_token_value",
      graphApiVersion: "v21.0",
    },
    actorUserId: "owner",
  });

  // Non-secret config is stored in the clear; App Secret + verify token are encrypted, masked and sorted.
  assert.deepEqual(saved.config, { appId: "1122334455", graphApiVersion: "v21.0" });
  assert.deepEqual(saved.configuredSecretFields, ["appSecret", "webhookVerifyToken"]);
  // Neither secret ever reaches persisted state or the browser-facing record.
  assert.doesNotMatch(JSON.stringify(storage.getState()), /meta_app_secret_value|verify_token_value/);
  assert.doesNotMatch(JSON.stringify(saved), /meta_app_secret_value|verify_token_value/);

  // Server-side resolve returns the full decrypted credential set for the config reader.
  const resolved = connections.resolveIntegrationValues(agency.id, "meta", { includeEnvironmentFallback: false });
  assert.equal(resolved.appId, "1122334455");
  assert.equal(resolved.appSecret, "meta_app_secret_value");
  assert.equal(resolved.webhookVerifyToken, "verify_token_value");
  assert.equal(resolved.graphApiVersion, "v21.0");

  // Stored values win over environment — and the environment is the FOUNDER'S,
  // so it is a fallback only for HIS agency. This used to hand env credentials
  // to any agency with none of its own, which on a multi-company deployment
  // meant a second company's Meta app ran on Ed's app id and secret.
  const emptyAgency = tenants.createAgency({ name: "Meta Env Only", slug: "meta-env-only" });
  const prior = {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
    version: process.env.META_GRAPH_API_VERSION,
  };
  process.env.META_APP_ID = "env-app-id";
  process.env.META_APP_SECRET = "env-app-secret";
  process.env.META_WEBHOOK_VERIFY_TOKEN = "env-verify-token";
  process.env.META_GRAPH_API_VERSION = "v20.0";
  try {
    // A stored credential always wins, for anyone.
    assert.equal(connections.resolveIntegrationValues(agency.id, "meta").appId, "1122334455");

    // A DIFFERENT company with nothing stored gets NOTHING — not Ed's keys.
    const foreign = connections.resolveIntegrationValues(emptyAgency.id, "meta");
    assert.deepEqual(
      foreign,
      {},
      "a company with no connection of its own must not inherit the founder's credentials",
    );

    // The FOUNDER'S own agency still gets the environment — that is the whole
    // point of it being there. Identified by the account whose email is
    // FOUNDER_EMAIL, so the rule is "these are Ed's keys", not "the first
    // agency wins".
    const founderAgency = tenants.createAgency({ name: "Founder Co", slug: "founder-co" });
    users.createUser({
      email: process.env.FOUNDER_EMAIL ?? "edwardhallam07@gmail.com",
      name: "Founder",
      role: "agency-owner",
      agencyId: founderAgency.id,
      password: "founder-smoke-password",
    });
    const mine = connections.resolveIntegrationValues(founderAgency.id, "meta");
    assert.equal(mine.appId, "env-app-id");
    assert.equal(mine.appSecret, "env-app-secret");
    assert.equal(mine.webhookVerifyToken, "env-verify-token");
    assert.equal(mine.graphApiVersion, "v20.0");

    // And the foreign company is STILL empty with the founder now present —
    // proving the gate keys off identity, not off ordering.
    assert.deepEqual(connections.resolveIntegrationValues(emptyAgency.id, "meta"), {});
  } finally {
    restoreEnv("META_APP_ID", prior.appId);
    restoreEnv("META_APP_SECRET", prior.appSecret);
    restoreEnv("META_WEBHOOK_VERIFY_TOKEN", prior.verifyToken);
    restoreEnv("META_GRAPH_API_VERSION", prior.version);
  }

  // Credentials can be verified against Meta's app-token endpoint without leaking the secret.
  const fetchImpl = (async (url: string | URL | Request) => {
    const target = new URL(String(url));
    assert.equal(`${target.origin}${target.pathname}`, "https://graph.facebook.com/oauth/access_token");
    assert.equal(target.searchParams.get("client_id"), "1122334455");
    assert.equal(target.searchParams.get("client_secret"), "meta_app_secret_value");
    assert.equal(target.searchParams.get("grant_type"), "client_credentials");
    return Response.json({ access_token: "1122334455|app-token" });
  }) as typeof fetch;
  const tested = await connections.testIntegrationConnection(agency.id, saved.id, { userId: "owner" }, fetchImpl);
  assert.equal(tested.status, "connected");
  assert.equal(tested.lastTestStatus, "passed");
  assert.doesNotMatch(JSON.stringify(tested), /meta_app_secret_value/);

  // Phase 2: the inbox config readers now consult this stored connection (store wins over env).
  // Clear the META_* + base-URL env hermetically (the suite shares one process, so another file's
  // top-level env can leak in) — proving the stored connection alone drives readiness here.
  const priorEnv = {
    base: process.env.NEXT_PUBLIC_PORTAL_BASE_URL,
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
    version: process.env.META_GRAPH_API_VERSION,
  };
  for (const key of ["NEXT_PUBLIC_PORTAL_BASE_URL", "META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "META_GRAPH_API_VERSION"]) {
    delete process.env[key];
  }
  try {
    const httpsOrigin = "https://portal.aquacrm.example";
    const readiness = meta.metaInboxReadiness(agency.id, httpsOrigin);
    assert.equal(readiness.configured, true);
    assert.equal(readiness.appSecretConfigured, true);
    assert.equal(readiness.publicBaseUrlConfigured, true);
    const metaConfig = meta.readMetaMessagingConfig(agency.id, httpsOrigin);
    assert.ok(metaConfig);
    assert.equal(metaConfig!.appId, "1122334455");
    assert.equal(metaConfig!.appSecret, "meta_app_secret_value");
    assert.equal(metaConfig!.webhookVerifyToken, "verify_token_value");
    assert.equal(metaConfig!.graphApiVersion, "v21.0");
    assert.equal(metaConfig!.callbackUrl, "https://portal.aquacrm.example/api/portal/inbox/meta/callback");
    // An agency with nothing stored and no env is not configured (proves it is store-driven, not env).
    const bare = meta.metaInboxReadiness(tenants.createAgency({ name: "Bare Meta", slug: "bare-meta" }).id, httpsOrigin);
    assert.equal(bare.appIdConfigured, false);
    assert.equal(bare.configured, false);
  } finally {
    restoreEnv("NEXT_PUBLIC_PORTAL_BASE_URL", priorEnv.base);
    restoreEnv("META_APP_ID", priorEnv.appId);
    restoreEnv("META_APP_SECRET", priorEnv.appSecret);
    restoreEnv("META_WEBHOOK_VERIFY_TOKEN", priorEnv.verifyToken);
    restoreEnv("META_GRAPH_API_VERSION", priorEnv.version);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
