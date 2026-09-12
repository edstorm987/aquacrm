// EMBED-SEC-001 — scoped vault credentials, immutable token lineage and
// durable single-use consumption. Hermetic: memory PortalState, no network.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { before, beforeEach, describe, it } from "node:test";

import { withSession } from "./dev-console-request-scope";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "embed-security-session-secret-at-least-thirty-two-characters";
process.env.PORTAL_VAULT_ENCRYPTION_KEY = "embed-security-vault-secret-at-least-thirty-two-characters";
process.env.AQUA_EMBED_SIGNING_SECRET = "embed-security-signing-secret-at-least-thirty-two-characters";
process.env.NODE_ENV = "test";

type Storage = typeof import("../src/server/storage");
type Authority = typeof import("../src/lib/server/embedCredentialAuthority");
type Handlers = typeof import("../src/lib/server/embedSessionHandlers");
type Tokens = typeof import("../src/lib/server/aquaEmbedToken");
type Connections = typeof import("../src/lib/server/integrations/integrationConnections");
type Coordinator = typeof import("../src/server/productWorkspaceCoordinator");
type Nonces = typeof import("../src/lib/server/auth/nonceStore");
type Auth = typeof import("../src/lib/server/auth/auth");
type Csrf = typeof import("../src/lib/server/auth/csrf");
type SecurityEvents = typeof import("../src/lib/server/security/securityEvents");
type ManagementRoute = typeof import("../src/app/api/portal/settings/embed-credentials/route");
type FramePolicy = typeof import("../src/lib/server/embedFramePolicy");
type ProxyModule = typeof import("../src/proxy");

let storage: Storage;
let authority: Authority;
let handlers: Handlers;
let tokens: Tokens;
let connections: Connections;
let coordinator: Coordinator;
let nonces: Nonces;
let auth: Auth;
let csrf: Csrf;
let securityEvents: SecurityEvents;
let managementRoute: ManagementRoute;
let framePolicy: FramePolicy;
let proxyModule: ProxyModule;

before(async () => {
  storage = await import("../src/server/storage");
  authority = await import("../src/lib/server/embedCredentialAuthority");
  handlers = await import("../src/lib/server/embedSessionHandlers");
  tokens = await import("../src/lib/server/aquaEmbedToken");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  coordinator = await import("../src/server/productWorkspaceCoordinator");
  nonces = await import("../src/lib/server/auth/nonceStore");
  auth = await import("../src/lib/server/auth/auth");
  csrf = await import("../src/lib/server/auth/csrf");
  securityEvents = await import("../src/lib/server/security/securityEvents");
  managementRoute = await import("../src/app/api/portal/settings/embed-credentials/route");
  framePolicy = await import("../src/lib/server/embedFramePolicy");
  proxyModule = await import("../src/proxy");
});

import type { NonceStore } from "../src/lib/server/auth/nonceStore";
import type { AquaEmbedMode } from "../src/lib/server/aquaEmbedToken";
import type { PublicEmbedCredential } from "../src/lib/server/embedCredentialAuthority";
import type { PortalState, Role, ServerUser } from "../src/server/types";

const ORIGIN = "http://localhost:3088";
const AGENCY_A = "embed-agency-a";
const AGENCY_B = "embed-agency-b";
const CLIENT_A1 = "embed-client-a1";
const CLIENT_A2 = "embed-client-a2";
const CLIENT_B1 = "embed-client-b1";
let ipCounter = 10;

function user(id: string, role: Role, agencyId = AGENCY_A): ServerUser {
  return {
    id,
    email: `${id}@example.test`,
    name: id,
    passwordHash: "test-only",
    role,
    agencyId,
    agencyIds: [agencyId],
    sessionRev: 0,
    accessRev: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}

const OWNER = user("embed-owner", "agency-owner");
const MANAGER = user("embed-manager", "agency-manager");
const STAFF = user("embed-staff", "agency-staff");

function seedState(users: ServerUser[] = [OWNER]): PortalState {
  const state = storage.createEmptyPortalState();
  for (const [id, name] of [[AGENCY_A, "Agency A"], [AGENCY_B, "Agency B"]] as const) {
    state.agencies[id] = { id, name, slug: id, brand: { primaryColor: "#000000" }, status: "active", createdAt: 1, updatedAt: 1 };
  }
  for (const [id, agencyId, name] of [
    [CLIENT_A1, AGENCY_A, "Client A1"],
    [CLIENT_A2, AGENCY_A, "Client A2"],
    [CLIENT_B1, AGENCY_B, "Client B1"],
  ] as const) {
    state.clients[id] = { id, agencyId, name, slug: id, brand: { primaryColor: "#000000" }, stage: "live", status: "active", createdAt: 1, updatedAt: 1 };
  }
  for (const person of users) state.users[person.email] = person;
  return state;
}

async function reset(users?: ServerUser[]) {
  await nonces._swapStoreForTests(nonces._createMemoryAdapterForTests());
  securityEvents.clearSecurityEventsForTest();
  await storage.replaceDataRealmState(storage.LIVE_DATA_REALM_ID, seedState(users));
}

async function createCredential(input: {
  clientId?: string;
  maxMode?: AquaEmbedMode;
  allowedOrigin?: string;
  label?: string;
} = {}) {
  return coordinator.withPortalStateTransaction(
    `embed-credential-test:${AGENCY_A}`,
    () => authority.createEmbedCredential({
      agencyId: AGENCY_A,
      clientId: input.clientId,
      maxMode: input.maxMode ?? "client",
      allowedOrigin: input.allowedOrigin,
      label: input.label,
      actorUserId: OWNER.id,
    }),
  );
}

function nextIp(): string {
  ipCounter += 1;
  return `198.18.0.${ipCounter}`;
}

async function mint(secret: string, clientId: string, mode: AquaEmbedMode, options: {
  ip?: string;
  email?: string;
  name?: string;
  reserveBudget?: typeof authority.reserveEmbedBudget;
} = {}) {
  const request = new NextRequest(`${ORIGIN}/api/v1/embed/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "x-forwarded-for": options.ip ?? nextIp(),
    },
    body: JSON.stringify({ clientId, mode, email: options.email, name: options.name }),
  });
  return handlers.handleEmbedSessionMint(request, { reserveBudget: options.reserveBudget });
}

async function mintToken(secret: string, clientId = CLIENT_A1, mode: AquaEmbedMode = "client") {
  const response = await mint(secret, clientId, mode);
  assert.equal(response.status, 200);
  const body = await response.json() as { url: string; embedUrl: string };
  return { token: new URL(body.url).searchParams.get("token")!, body };
}

function consumeRequest(token: string, options: { referer?: string; origin?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? nextIp() };
  if (options.referer) headers.referer = options.referer;
  if (options.origin) headers.origin = options.origin;
  return new NextRequest(`${ORIGIN}/api/v1/embed/consume?token=${encodeURIComponent(token)}`, { headers });
}

function sessionTokenFrom(response: Response): string {
  const value = response.headers.get("set-cookie")?.match(/(?:^|;\s*)lk_session_v1=([^;]+)/)?.[1];
  assert.ok(value, "embed consume must issue a session cookie");
  return decodeURIComponent(value);
}

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
  delete process.env.AQUA_EMBED_API_TOKEN;
  await reset();
});

describe("EMBED-SEC-001 scoped authority", () => {
  it("binds one agency and reveals no client existence to an invalid bearer", async () => {
    const { secret } = await createCredential({ maxMode: "admin" });
    assert.equal((await mint(secret, CLIENT_A1, "admin")).status, 200);
    const crossTenant = await mint(secret, CLIENT_B1, "client");
    assert.equal(crossTenant.status, 403);

    const existing = await mint("invalid-bearer", CLIENT_A1, "client");
    const absent = await mint("invalid-bearer", "nonexistent-client", "client");
    assert.equal(existing.status, 401);
    assert.equal(absent.status, 401);
    assert.deepEqual(await existing.json(), await absent.json());
  });

  it("keeps client-scoped credentials on one client and permanently below admin", async () => {
    const { credential, secret } = await createCredential({ clientId: CLIENT_A1, maxMode: "admin" });
    assert.equal(credential.maxMode, "client", "client scope clamps the stored policy");
    assert.equal((await mint(secret, CLIENT_A2, "client")).status, 403);
    assert.equal((await mint(secret, CLIENT_A1, "admin")).status, 403);
    const allowed = await mintToken(secret);
    const payload = tokens.verifyAquaEmbedToken(allowed.token);
    assert.equal(payload?.agencyId, AGENCY_A);
    assert.equal(payload?.clientId, CLIENT_A1);
    assert.equal(payload?.credentialId, credential.id);
    assert.equal(payload?.credentialVersion, credential.version);
  });

  it("rejects an ambiguous duplicate bearer instead of choosing storage order", async () => {
    const { secret } = await createCredential();
    const digest = crypto.createHash("sha256").update(secret).digest("hex");
    await coordinator.withPortalStateTransaction(`embed-duplicate:${AGENCY_A}`, () => connections.saveIntegrationConnection({
      agencyId: AGENCY_A,
      provider: "aqua-embed",
      label: "Duplicate",
      values: { credentialSecret: secret, credentialDigest: digest, fingerprint: digest.slice(0, 12), maxMode: "client" },
      actorUserId: OWNER.id,
    }));
    const refused = await mint(secret, CLIENT_A1, "client");
    assert.equal(refused.status, 401);
    assert.deepEqual(await refused.json(), { ok: false, error: "This embed request could not be authorised." });
  });

  it("revalidates credential existence and refuses a token minted before revocation", async () => {
    const { credential, secret } = await createCredential();
    const { token } = await mintToken(secret);
    await coordinator.withPortalStateTransaction(`embed-revoke:${AGENCY_A}`, () => authority.revokeEmbedCredential({
      agencyId: AGENCY_A,
      credentialId: credential.id,
      actorUserId: OWNER.id,
    }));
    const refused = await handlers.handleEmbedSessionConsume(consumeRequest(token));
    assert.equal(refused.status, 303);
    assert.match(refused.headers.get("location") ?? "", /^\/login\?error=/);
    assert.equal(refused.headers.get("set-cookie"), null);
  });

  it("consumes one nonce atomically across two handler adapter instances", async () => {
    const { secret } = await createCredential();
    const { token } = await mintToken(secret);
    const used = new Set<string>();
    const adapter = (): NonceStore => ({
      kind: "postgres",
      async consumeNonce(value) {
        if (used.has(value)) return false;
        used.add(value);
        return true;
      },
      async releaseNonce() {},
      async gcExpiredNonces() { return 0; },
    });
    const budget = async () => ({ allowed: true, retryAfterSec: 0 });
    const first = await handlers.handleEmbedSessionConsume(consumeRequest(token), { nonceStore: adapter(), reserveBudget: budget });
    const replay = await handlers.handleEmbedSessionConsume(consumeRequest(token), { nonceStore: adapter(), reserveBudget: budget });
    assert.equal(first.status, 303);
    assert.equal(first.headers.get("location"), "/embed/account");
    assert.match(first.headers.get("set-cookie") ?? "", /lk_session_v1=/);
    assert.equal(replay.status, 303);
    assert.match(replay.headers.get("location") ?? "", /^\/login\?error=/);
    assert.equal(replay.headers.get("set-cookie"), null);
  });

  it("fails closed when the durable nonce store is unavailable or rejects persistence", async () => {
    const { secret } = await createCredential();
    const unavailableToken = (await mintToken(secret)).token;
    const supabaseToken = (await mintToken(secret)).token;
    process.env.NODE_ENV = "production";
    try {
      const unavailable = await handlers.handleEmbedSessionConsume(consumeRequest(unavailableToken), {
        nonceStore: nonces._createMemoryAdapterForTests(),
        reserveBudget: async () => ({ allowed: true, retryAfterSec: 0 }),
      });
      assert.match(unavailable.headers.get("location") ?? "", /^\/login\?error=/);
      assert.equal(unavailable.headers.get("set-cookie"), null);

      const durableSupabase: NonceStore = {
        kind: "supabase",
        async consumeNonce(_value, kind) {
          assert.equal(kind, "aqua-embed");
          return true;
        },
        async releaseNonce() {},
        async gcExpiredNonces() { return 0; },
      };
      const accepted = await handlers.handleEmbedSessionConsume(consumeRequest(supabaseToken), {
        nonceStore: durableSupabase,
        reserveBudget: async () => ({ allowed: true, retryAfterSec: 0 }),
      });
      assert.equal(accepted.headers.get("location"), "/embed/account");
      assert.match(accepted.headers.get("set-cookie") ?? "", /lk_session_v1=/);
    } finally {
      process.env.NODE_ENV = "test";
    }

    const failedToken = (await mintToken(secret)).token;
    const failedAdapter: NonceStore = {
      kind: "postgres",
      async consumeNonce() { throw new Error("forced nonce persistence failure"); },
      async releaseNonce() {},
      async gcExpiredNonces() { return 0; },
    };
    const failed = await handlers.handleEmbedSessionConsume(consumeRequest(failedToken), {
      nonceStore: failedAdapter,
      reserveBudget: async () => ({ allowed: true, retryAfterSec: 0 }),
    });
    assert.match(failed.headers.get("location") ?? "", /^\/login\?error=/);
    assert.equal(failed.headers.get("set-cookie"), null);
  });

  it("routes every issued compact URL through consume and direct token replay cannot authenticate the account page", async () => {
    const { secret } = await createCredential();
    const { token, body } = await mintToken(secret);
    assert.equal(new URL(body.embedUrl).pathname, "/api/v1/embed/consume");
    const accountModule = await import("../src/app/embed/account/page");
    const Account = accountModule.default as unknown as (props: unknown) => Promise<{ props?: { message?: string } }>;
    const rendered = await Account({ searchParams: Promise.resolve({ token }) });
    assert.match(rendered.props?.message ?? "", /client record is no longer available/i);
  });

  it("requires the exact bound Origin or Referer and rejects missing or conflicting headers", async () => {
    const expected = "https://portal.example.test";
    const { secret } = await createCredential({ allowedOrigin: expected });
    const missingToken = (await mintToken(secret)).token;
    const missing = await handlers.handleEmbedSessionConsume(consumeRequest(missingToken));
    assert.match(missing.headers.get("location") ?? "", /different%20portal/);

    const wrongToken = (await mintToken(secret)).token;
    const wrong = await handlers.handleEmbedSessionConsume(consumeRequest(wrongToken, { referer: "https://attacker.example/path" }));
    assert.match(wrong.headers.get("location") ?? "", /different%20portal/);

    const exactToken = (await mintToken(secret)).token;
    const exact = await handlers.handleEmbedSessionConsume(consumeRequest(exactToken, { referer: `${expected}/account` }));
    assert.equal(exact.headers.get("location"), "/embed/account");
    assert.match(exact.headers.get("set-cookie") ?? "", /lk_session_v1=/);
    const boundPolicy = framePolicy.embedAccountContentSecurityPolicy({
      token: sessionTokenFrom(exact),
      nodeEnv: "production",
    });
    assert.match(boundPolicy, /frame-ancestors 'self' https:\/\/portal\.example\.test(?:;|$)/);
    const frameAncestors = boundPolicy.match(/frame-ancestors[^;]*/)?.[0] ?? "";
    assert.doesNotMatch(frameAncestors, /attacker|(?:^|\s)https:(?:\s|$)/);
    const proxyResponse = proxyModule.proxy(new NextRequest(`${ORIGIN}/embed/account`, {
      headers: { cookie: `lk_session_v1=${encodeURIComponent(sessionTokenFrom(exact))}` },
    }));
    assert.equal(
      proxyResponse.headers.get("content-security-policy")?.match(/frame-ancestors[^;]*/)?.[0],
      frameAncestors,
    );
    assert.ok(proxyModule.config.matcher.includes("/embed/account/:path*"));

    const forged = sessionTokenFrom(exact).replace(/.$/, character => character === "a" ? "b" : "a");
    assert.match(
      framePolicy.embedAccountContentSecurityPolicy({ token: forged, nodeEnv: "production" }),
      /frame-ancestors 'none'(?:;|$)/,
    );

    const conflictToken = (await mintToken(secret)).token;
    const conflict = await handlers.handleEmbedSessionConsume(consumeRequest(conflictToken, { origin: expected, referer: "https://attacker.example/path" }));
    assert.match(conflict.headers.get("location") ?? "", /different%20portal/);
  });

  it("keeps unbound or ordinary sessions top-level-only and cannot widen CSP with a stored directive", async () => {
    const { secret } = await createCredential();
    const { token } = await mintToken(secret);
    const accepted = await handlers.handleEmbedSessionConsume(consumeRequest(token));
    assert.equal(accepted.headers.get("location"), "/embed/account");
    assert.match(
      framePolicy.embedAccountContentSecurityPolicy({ token: sessionTokenFrom(accepted), nodeEnv: "production" }),
      /frame-ancestors 'none'(?:;|$)/,
    );

    const ordinary = auth.issueSession({
      userId: OWNER.id,
      email: OWNER.email,
      role: OWNER.role,
      agencyId: AGENCY_A,
      clientId: CLIENT_A1,
    });
    assert.match(
      framePolicy.embedAccountContentSecurityPolicy({ token: ordinary, nodeEnv: "production" }),
      /frame-ancestors 'none'(?:;|$)/,
    );
  });

  it("revalidates embed credential lineage before the account page loads customer data", async () => {
    const { credential, secret } = await createCredential({ clientId: CLIENT_A1 });
    const { token } = await mintToken(secret);
    const consumed = await handlers.handleEmbedSessionConsume(consumeRequest(token));
    const session = sessionTokenFrom(consumed);
    const accountModule = await import("../src/app/embed/account/page");
    const Account = accountModule.default as unknown as () => Promise<{ props?: { message?: string } }>;
    const beforeRevocation = await withSession(session, () => Account());
    assert.equal(beforeRevocation.props?.message, undefined);

    await coordinator.withPortalStateTransaction(`embed-page-revoke:${AGENCY_A}`, () => authority.revokeEmbedCredential({
      agencyId: AGENCY_A,
      credentialId: credential.id,
      actorUserId: OWNER.id,
    }));
    const afterRevocation = await withSession(session, () => Account());
    assert.match(afterRevocation.props?.message ?? "", /client record is no longer available/i);
  });

  it("bounds chunked JSON before authentication or a full body drain", async () => {
    let produced = 0;
    let cancelled = false;
    const total = 1024 * 1024;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= total) return controller.close();
        produced += 4096;
        controller.enqueue(new Uint8Array(4096));
      },
      cancel() { cancelled = true; },
    });
    const response = await handlers.handleEmbedSessionMint(new NextRequest(`${ORIGIN}/api/v1/embed/sessions`, {
      method: "POST",
      headers: { authorization: "Bearer invalid", "content-type": "application/json", "transfer-encoding": "chunked", "x-forwarded-for": nextIp() },
      body: stream,
      duplex: "half",
    } as RequestInit));
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
    assert.ok(produced < total, `body drained ${produced}/${total}`);
  });

  it("atomically enforces durable agency, credential and IP budgets under concurrency", async () => {
    const input = {
      action: "issue" as const,
      agencyId: AGENCY_A,
      credentialId: "int_budget_test",
      ipRef: authority.opaqueEmbedIp(new Headers({ "x-forwarded-for": "203.0.113.55" })),
      now: 10_000,
      limits: { agency: 2, credential: 2, ip: 2, windowMs: 60_000 },
    };
    const results = await Promise.all([
      authority.reserveEmbedBudget(input),
      authority.reserveEmbedBudget(input),
      authority.reserveEmbedBudget(input),
    ]);
    assert.equal(results.filter(result => result.allowed).length, 2);
    assert.equal(results.filter(result => !result.allowed).length, 1);
    const budgets = storage.getState().securityControl?.embedBudgets ?? {};
    assert.equal(Object.keys(budgets).length, 3);
    assert.ok(Object.values(budgets).every(bucket => bucket.count === 2));
    assert.doesNotMatch(JSON.stringify(budgets), /203\.0\.113\.55|int_budget_test|embed-agency-a/);
  });

  it("fails closed on durable budget persistence failure without minting a token", async () => {
    await assert.rejects(() => authority.reserveEmbedBudget({
      action: "issue",
      agencyId: AGENCY_A,
      credentialId: "int_failed_budget",
      ipRef: "opaque-ip",
    }, { transaction: async () => { throw new Error("forced persistence failure"); } }));

    const { secret } = await createCredential();
    const response = await mint(secret, CLIENT_A1, "client", {
      reserveBudget: async () => { throw new Error("forced persistence failure"); },
    });
    assert.equal(response.status, 503);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.ok, false);
    assert.equal("url" in body, false);
  });

  it("keeps raw bearer, issued token, IP and request PII out of limiter and audit records", async () => {
    const email = "embed-pii-marker@example.test";
    const name = "Embed Pii Marker";
    const rawIp = "203.0.113.88";
    const { secret } = await createCredential({ label: "PII-free audit test" });
    const response = await mint(secret, CLIENT_A1, "client", { email, name, ip: rawIp });
    const body = await response.json() as { url: string };
    const issuedToken = new URL(body.url).searchParams.get("token")!;
    const persisted = JSON.stringify({
      budgets: storage.getState().securityControl?.embedBudgets,
      activity: storage.getState().activity,
      events: securityEvents.recentSecurityEvents(),
    });
    for (const forbidden of [secret, issuedToken, email, name, rawIp]) {
      assert.equal(persisted.includes(forbidden), false, forbidden);
    }
    assert.equal(JSON.stringify(storage.getState()).includes(secret), false, "vault state must contain ciphertext, not the bearer");
  });

  it("denies the legacy deployment token in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.AQUA_EMBED_API_TOKEN = "legacy-deployment-wide-token";
    try {
      const response = await mint("legacy-deployment-wide-token", CLIENT_A1, "client");
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, error: "This embed request could not be authorised." });
    } finally {
      process.env.NODE_ENV = "test";
      delete process.env.AQUA_EMBED_API_TOKEN;
    }
  });

  it("fails closed with generic no-store responses when the production signing key is unavailable", async () => {
    const { secret } = await createCredential();
    const validToken = (await mintToken(secret)).token;
    process.env.NODE_ENV = "production";
    const configured = process.env.AQUA_EMBED_SIGNING_SECRET;
    delete process.env.AQUA_EMBED_SIGNING_SECRET;
    try {
      const issue = await mint(secret, CLIENT_A1, "client", {
        reserveBudget: async () => ({ allowed: true, retryAfterSec: 0 }),
      });
      assert.equal(issue.status, 503);
      assert.match(issue.headers.get("cache-control") ?? "", /no-store/);
      assert.deepEqual(await issue.json(), { ok: false, error: "Embed access is temporarily unavailable." });

      const consume = await handlers.handleEmbedSessionConsume(consumeRequest(validToken), {
        nonceStore: { ...nonces._createMemoryAdapterForTests(), kind: "postgres" },
        reserveBudget: async () => ({ allowed: true, retryAfterSec: 0 }),
      });
      assert.match(consume.headers.get("location") ?? "", /^\/login\?error=/);
      assert.equal(consume.headers.get("set-cookie"), null);
      assert.match(consume.headers.get("cache-control") ?? "", /no-store/);
    } finally {
      if (configured) process.env.AQUA_EMBED_SIGNING_SECRET = configured;
      else delete process.env.AQUA_EMBED_SIGNING_SECRET;
      process.env.NODE_ENV = "test";
    }
  });
});

describe("EMBED-SEC-001 in-app credential management", () => {
  function sessionFor(subject: ServerUser) {
    return auth.issueSession({
      userId: subject.id,
      email: subject.email,
      role: subject.role,
      agencyId: subject.agencyId,
      agencyIds: subject.agencyIds,
      activeAgencyId: subject.agencyId,
      sessionRev: 0,
    });
  }

  async function managementPost(subject: ServerUser, body: Record<string, unknown>) {
    const session = sessionFor(subject);
    const csrfToken = csrf.signCsrfToken().token;
    const request = new NextRequest(`${ORIGIN}/api/portal/settings/embed-credentials`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
        cookie: `${auth.SESSION_COOKIE_NAME}=${session}; ${csrf.CSRF_COOKIE_NAME}=${csrfToken}`,
      },
      body: JSON.stringify(body),
    });
    return withSession(session, () => managementRoute.POST(request));
  }

  it("lets owners create and managers list/revoke while revealing the secret once only", async () => {
    await reset([OWNER, MANAGER, STAFF]);
    const created = await managementPost(OWNER, { action: "create", label: "Partner portal", clientId: CLIENT_A1, maxMode: "admin" });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { secret: string; credential: PublicEmbedCredential };
    assert.match(createdBody.secret, /^aqe_[A-Za-z0-9_-]{40,}$/);
    assert.equal(createdBody.credential.maxMode, "client");

    const managerSession = sessionFor(MANAGER);
    const listed = await withSession(managerSession, () => managementRoute.GET());
    assert.equal(listed.status, 200);
    const listedText = await listed.text();
    assert.equal(listedText.includes(createdBody.secret), false);
    assert.doesNotMatch(listedText, /credentialSecret|encryptedSecrets/);

    const revoked = await managementPost(MANAGER, { action: "revoke", credentialId: createdBody.credential.id });
    assert.equal(revoked.status, 200);
    assert.deepEqual((await revoked.json() as { credentials: unknown[] }).credentials, []);

    const staffSession = sessionFor(STAFF);
    const denied = await withSession(staffSession, () => managementRoute.GET());
    assert.ok(denied.status === 401 || denied.status === 403);
  });

  it("requires signed double-submit CSRF before generating a credential", async () => {
    await reset([OWNER]);
    const session = sessionFor(OWNER);
    const request = new NextRequest(`${ORIGIN}/api/portal/settings/embed-credentials`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", cookie: `${auth.SESSION_COOKIE_NAME}=${session}` },
      body: JSON.stringify({ action: "create", maxMode: "client" }),
    });
    const denied = await withSession(session, () => managementRoute.POST(request));
    assert.equal(denied.status, 403);
    assert.deepEqual(authority.listEmbedCredentials(AGENCY_A), []);
  });
});
