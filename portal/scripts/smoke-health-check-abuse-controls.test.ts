// ABUSE-002 — the mounted Health Check completion is the only anonymous
// capture admission. It requires a purpose/host-bound managed challenge before
// victim/shared budgets or mutations; the old query-selected plugin routes are
// retired. All provider answers below are in-process stubs.

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";
process.env.FOUNDER_PASSWORD ??= "AquaHealthCheck2026!";

import { POST } from "../src/app/api/public/health-check/complete/route";
import { ROUTES } from "../src/built-ins/modules/public-funnel/src/api/routes";
import {
  ensurePublicFunnelFoundationRegistered,
  publicFunnelContainerFor,
} from "../src/built-ins/runtime/foundation-adapters/publicFunnelFoundation";
import { makePluginStorage } from "../src/lib/server/pluginStorage";
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";
import { _resetFounderSeedForTests, seedFounder } from "../src/lib/server/seeds/founderSeed";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { getState, reset } from "../src/server/storage";
import { createAgency, getAgencyBySlug } from "../src/server/tenants";
import { createUser, getUser } from "../src/server/users";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://localhost:3030/api/public/health-check/complete";
const SITE_KEY = "1x00000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

let realFetch: typeof fetch;
let savedEnv: Record<string, string | undefined> = {};
let providerCalls = 0;

function body(email: string, completionId: string, captchaToken?: string): Record<string, unknown> {
  return {
    email,
    completionId,
    slot: { slot: 3, summary: { percentage: 61 } },
    sourceUrl: "http://localhost:3030/health-check/index.html",
    ...(captchaToken ? { captchaToken } : {}),
  };
}

function request(payload: Record<string, unknown>, ip: string, hostname = "localhost"): NextRequest {
  return new NextRequest(`http://${hostname}:3030/api/public/health-check/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(payload),
  });
}

function verdict(token: string): Record<string, unknown> {
  if (token.startsWith("wrong-action")) {
    return { success: true, action: "login", hostname: "localhost", challenge_ts: new Date().toISOString() };
  }
  if (token.startsWith("wrong-host")) {
    return { success: true, action: "health-check-complete", hostname: "evil.example", challenge_ts: new Date().toISOString() };
  }
  return {
    success: token.startsWith("valid-"),
    action: "health-check-complete",
    hostname: "localhost",
    challenge_ts: new Date().toISOString(),
  };
}

before(async () => {
  savedEnv = {
    site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    secret: process.env.TURNSTILE_SECRET_KEY,
    founderPassword: process.env.FOUNDER_PASSWORD,
  };
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
  process.env.FOUNDER_PASSWORD = "AquaHealthCheck2026!";
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (!target.includes("challenges.cloudflare.com/turnstile")) {
      throw new Error(`ABUSE-002 test refused unexpected network target: ${target}`);
    }
    providerCalls += 1;
    const token = new URLSearchParams(typeof init?.body === "string" ? init.body : "").get("response") ?? "";
    return new Response(JSON.stringify(verdict(token)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await reset();
  _resetFounderSeedForTests();
  await seedFounder();
});

beforeEach(() => {
  providerCalls = 0;
  __resetBotChallengeForTest();
});

after(() => {
  globalThis.fetch = realFetch;
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", savedEnv.site);
  restore("TURNSTILE_SECRET_KEY", savedEnv.secret);
  restore("FOUNDER_PASSWORD", savedEnv.founderPassword);
});

describe("mounted Health Check managed-challenge admission", () => {
  it("requires proof without spending a victim budget or preclaiming signup identity", async () => {
    const victim = "hc-abuse-victim@example.com";
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const denied = await POST(request(
        body(victim, `hc_abuse_victim_${attempt.toString().padStart(2, "0")}`),
        `42.0.0.${attempt + 1}`,
      ));
      assert.equal(denied.status, 403);
    }
    assert.equal(providerCalls, 0, "missing tokens must not spend a provider call");

    const allowed = await POST(request(
      body(victim, "hc_abuse_victim_real", "valid-victim"),
      "42.0.0.99",
    ));
    assert.notEqual(allowed.status, 429, "tokenless attempts must not spend the victim address budget");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("set-cookie"), null);
    assert.equal(getUser(victim), null, "anonymous Health Check created a global authenticatable User");

    const canonicalRepeat = await POST(request(
      body("  HC-ABUSE-VICTIM@EXAMPLE.COM ", "hc_abuse_victim_repeat", "valid-victim-repeat"),
      "42.0.0.100",
    ));
    assert.equal(canonicalRepeat.status, 400, "canonical address repeat appended a second capture");
    assert.equal(getUser(victim), null);

    // The verified signup boundary must remain able to claim this address.
    const agency = createAgency({ name: "Victim signup succeeds", slug: "victim-signup-succeeds" });
    const signedUp = createUser({
      email: victim,
      password: "VictimSignupSecret42!",
      role: "agency-owner",
      agencyId: agency.id,
    });
    assert.equal(signedUp.email, victim);
    assert.equal(getUser(victim)?.id, signedUp.id);
  });

  it("rejects tokens minted for another action or hostname before capture", async () => {
    const wrongActionEmail = "hc-wrong-action@example.com";
    const wrongAction = await POST(request(
      body(wrongActionEmail, "hc_wrong_action_001", "wrong-action-001"),
      "42.0.1.1",
    ));
    assert.equal(wrongAction.status, 403);
    assert.equal(getUser(wrongActionEmail), null);

    const wrongHostEmail = "hc-wrong-host@example.com";
    const wrongHost = await POST(request(
      body(wrongHostEmail, "hc_wrong_host_0001", "wrong-host-001"),
      "42.0.1.2",
    ));
    assert.equal(wrongHost.status, 403);
    assert.equal(getUser(wrongHostEmail), null);
  });

  it("burns a successful proof once, even when replayed with new capture data", async () => {
    const firstEmail = "hc-replay-first@example.com";
    const token = "valid-replay-once";
    const first = await POST(request(body(firstEmail, "hc_replay_first_01", token), "42.0.2.1"));
    assert.equal(first.status, 200);

    const secondEmail = "hc-replay-second@example.com";
    const replay = await POST(request(body(secondEmail, "hc_replay_second_1", token), "42.0.2.2"));
    assert.equal(replay.status, 403);
    assert.equal(getUser(secondEmail), null);
    assert.equal(providerCalls, 1, "the local replay guard must reject before another provider call");
  });

  it("ignores query/body tenant hints and writes only to the fixed founder install", async () => {
    const decoy = createAgency({ name: "ABUSE-002 decoy", slug: "abuse-002-decoy" });
    const decoyInstall = upsertInstall({
      scope: { agencyId: decoy.id },
      pluginId: "public-funnel",
      enabled: true,
      config: {},
      features: {},
      installedBy: "abuse-002-test",
    });
    const email = "hc-tenant-proof@example.com";
    const response = await POST(request({
      ...body(email, "hc_tenant_proof_001", "valid-tenant-proof"),
      agencyId: decoy.id,
      installId: decoyInstall.id,
    }, "42.0.3.1"));
    assert.equal(response.status, 200);

    ensurePublicFunnelFoundationRegistered();
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const founderInstall = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(founderInstall);
    const founderRows = await publicFunnelContainerFor({
      agencyId: founder.id,
      install: founderInstall,
      storage: makePluginStorage(founderInstall.id),
    }).funnel.listByEmail(email);
    const decoyRows = await publicFunnelContainerFor({
      agencyId: decoy.id,
      install: decoyInstall,
      storage: makePluginStorage(decoyInstall.id),
    }).funnel.listByEmail(email);
    assert.equal(founderRows.length, 1);
    assert.equal(decoyRows.length, 0);
  });

  it("does not strand a capture when availability fails and a fresh proof retries", async () => {
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(install);
    upsertInstall({
      scope: { agencyId: founder.id },
      pluginId: install.pluginId,
      enabled: false,
      config: install.config,
      features: install.features,
      setupAnswers: install.setupAnswers,
      installedBy: install.installedBy,
    });

    const email = "hc-rollback-retry@example.com";
    const unavailable = await POST(request(
      body(email, "hc_rollback_retry_01", "valid-rollback-first"),
      "42.0.4.1",
    ));
    assert.equal(unavailable.status, 503);
    assert.equal(getUser(email), null);

    upsertInstall({
      scope: { agencyId: founder.id },
      pluginId: install.pluginId,
      enabled: true,
      config: install.config,
      features: install.features,
      setupAnswers: install.setupAnswers,
      installedBy: install.installedBy,
    });
    const retry = await POST(request(
      body(email, "hc_rollback_retry_01", "valid-rollback-second"),
      "42.0.4.2",
    ));
    assert.equal(retry.status, 200);
    assert.equal(getUser(email), null, "successful retry minted a global User");
  });

  it("erases an exact pending capture without auth residue or collateral rows", async () => {
    const email = "hc-exact-pending-erasure@example.com";
    const response = await POST(request(
      body(email, "hc_exact_pending_erasure_01", "valid-exact-erasure"),
      "42.0.5.1",
    ));
    assert.equal(response.status, 200);

    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(install);
    const store = makePluginStorage(install.id);
    const funnel = publicFunnelContainerFor({ agencyId: founder.id, install, storage: store }).funnel;
    const rows = await funnel.listByEmail(email);
    assert.equal(rows.length, 1);
    const capture = rows[0]!;
    assert.ok(capture.pendingLeadId);
    assert.equal(capture.leadUserId, undefined);
    const clientId = "client_hc_exact_pending_erasure";
    await store.set(`captures/by-id/${capture.id}`, { ...capture, clientId });

    const erased = await funnel.eraseForClient({
      clientId,
      personShared: false,
      emails: [email],
      sharedEmails: [],
    });
    assert.equal(erased.erased, 1);
    assert.deepEqual(erased.reviewRequired, { legacyUnscoped: 0, sharedIdentity: 0 });
    assert.equal((await funnel.listByEmail(email)).length, 0);
    assert.equal(getUser(email), null);
    assert.equal(getState().activity.some(entry =>
      (entry.metadata as { captureId?: string } | undefined)?.captureId === capture.id), false,
    "exact capture activity survived erasure");
  });
});

describe("alternate-path retirement and ordering contract", () => {
  it("exposes no query-selected anonymous capture route from the plugin dispatcher", () => {
    assert.deepEqual(ROUTES.map(route => route.path), ["me-context"]);
    assert.equal(ROUTES.some(route => route.public === true), false);
  });

  it("keeps address/install budgets and every mutation below exact proof", () => {
    const source = readFileSync(path.join(
      ROOT,
      "src/app/api/public/health-check/complete/route.ts",
    ), "utf8");
    const proof = source.indexOf("await verifyBotChallenge");
    const address = source.indexOf("health-check-complete-address:");
    const hydrate = source.indexOf("await ensureHydrated");
    const install = source.indexOf("health-check-complete-install:");
    const capture = source.indexOf(".funnel.captureHcCompletion");
    assert.ok(proof > 0);
    assert.ok(address > proof, "victim address quota moved above human proof");
    assert.ok(hydrate > proof, "hydration/seeding moved above human proof");
    assert.ok(install > proof, "shared install budget moved above human proof");
    assert.ok(capture > install, "capture must remain below every admission budget");
    assert.match(source, /health-check-complete-ip:/);
    assert.match(source, /addressDigest\(email\)/);
  });

  it("mounts a dedicated purpose-bound challenge and forwards/resets its token", () => {
    const html = readFileSync(path.join(ROOT, "public/health-check/index.html"), "utf8");
    const loader = readFileSync(path.join(ROOT, "public/aqua-bot-challenge.js"), "utf8");
    assert.match(html, /data-hc-completion-proof[^>]+data-hc-challenge-action="health-check-complete"/);
    assert.match(html, /setAttribute\('data-aqua-challenge-action', 'health-check-complete'\)/);
    assert.match(html, /AquaBotChallenge\?\.mount\(proofForm\)/);
    assert.match(loader, /mount:\s*function \(form\)/);
    assert.match(html, /captchaToken:\s*captchaToken/);
    assert.match(html, /challenge\.reset\(proofForm\)/);
  });
});
