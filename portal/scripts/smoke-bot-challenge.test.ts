// AUTH-001 — managed bot-challenge abstraction (DECISIONS #13).
//
// Adversarial unit coverage for src/lib/server/security/botChallenge.ts. No
// real network call is ever made — a fake fetch is injected. The module has
// `import "server-only"`, so this MUST run under the react-server condition,
// exactly like the other server-only smokes:
//
//   NODE_OPTIONS='--conditions react-server' node --import tsx --test \
//     scripts/smoke-bot-challenge.test.ts
//
// Every clause of the module's contract has at least one hostile case here:
// fail-closed on missing/malformed/replayed/expired/rejected/error/timeout,
// action + hostname binding, per-IP verify rate limit, the production
// unconfigured readiness-blocker denial, and the dev skip.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  verifyBotChallenge,
  captchaConfigured,
  botChallengeClientConfig,
  __resetBotChallengeForTest,
  __botChallengeReplaySizeForTest,
  __seedBotChallengeReplayForTest,
} from "../src/lib/server/security/botChallenge";
import {
  clearSecurityEventsForTest,
  recentSecurityEvents,
} from "../src/lib/server/security/securityEvents";

const TEST_SITE_KEY = "1x00000000000000000000AA"; // Cloudflare "always passes" site key
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA"; // "always passes" secret

const NOW = Date.UTC(2026, 8, 12, 3, 0, 0); // fixed clock

// A fake fetch that returns a Response-shaped object with the given body.
function fetchReturning(body: Record<string, unknown>, ok = true, status = 200): typeof fetch {
  return (async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

// A fake fetch that throws — `abort:true` mimics the AbortController timeout.
function fetchThrowing(abort: boolean): typeof fetch {
  return (async () => {
    const err = new Error(abort ? "The operation was aborted" : "network down");
    if (abort) err.name = "AbortError";
    throw err;
  }) as unknown as typeof fetch;
}

const ORIGINAL_ENV = {
  site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  secret: process.env.TURNSTILE_SECRET_KEY,
  hosts: process.env.CAPTCHA_EXPECTED_HOSTNAMES,
  nodeEnv: process.env.NODE_ENV,
};

function configureKeys(): void {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = TEST_SITE_KEY;
  process.env.TURNSTILE_SECRET_KEY = TEST_SECRET_KEY;
}

beforeEach(() => {
  __resetBotChallengeForTest();
  clearSecurityEventsForTest();
  configureKeys();
  delete process.env.CAPTCHA_EXPECTED_HOSTNAMES;
  // Default to a non-production posture; individual tests opt into production.
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ORIGINAL_ENV.site;
  process.env.TURNSTILE_SECRET_KEY = ORIGINAL_ENV.secret;
  process.env.CAPTCHA_EXPECTED_HOSTNAMES = ORIGINAL_ENV.hosts;
  process.env.NODE_ENV = ORIGINAL_ENV.nodeEnv;
});

const happyBody = {
  success: true,
  action: "login",
  hostname: "portal.aquacrm.test",
  challenge_ts: new Date(NOW).toISOString(),
};

function verify(overrides: Partial<Parameters<typeof verifyBotChallenge>[0]> = {}) {
  return verifyBotChallenge({
    action: "login",
    token: "valid.token.aaa",
    remoteIp: "203.0.113.7",
    hostname: "portal.aquacrm.test",
    now: NOW,
    fetchImpl: fetchReturning(happyBody),
    ...overrides,
  });
}

describe("bot-challenge — configuration", () => {
  it("reports configured when both keys present, and exposes only the site key to clients", () => {
    assert.equal(captchaConfigured(), true);
    const client = botChallengeClientConfig();
    assert.equal(client.provider, "turnstile");
    assert.equal(client.siteKey, TEST_SITE_KEY);
    assert.equal(client.enabled, true);
    // The secret must never appear anywhere in the client-facing shape.
    assert.ok(!JSON.stringify(client).includes(TEST_SECRET_KEY));
  });
});

describe("bot-challenge — happy path", () => {
  it("verifies a good token, binds action + hostname, and logs a verified event", async () => {
    const decision = await verify();
    assert.equal(decision.ok, true);
    assert.equal(decision.enforced, true);
    assert.equal(decision.reason, "ok");
    const events = recentSecurityEvents();
    assert.ok(events.some((e) => e.kind === "captcha.verified" && e.severity === "info"));
  });
});

describe("bot-challenge — fail closed on bad input", () => {
  it("denies a missing token", async () => {
    const decision = await verify({ token: undefined });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "missing-token");
    assert.ok(decision.message.length > 0);
  });

  it("denies an empty-string token", async () => {
    const decision = await verify({ token: "   " });
    assert.equal(decision.reason, "missing-token");
  });

  it("denies a control-character token before calling the provider", async () => {
    let called = false;
    const spyFetch = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => happyBody };
    }) as unknown as typeof fetch;
    const decision = await verify({ token: `bad${String.fromCharCode(0)}token`, fetchImpl: spyFetch });
    assert.equal(decision.reason, "malformed-token");
    assert.equal(called, false, "provider must not be called for junk input");
  });

  it("denies an over-long token", async () => {
    const decision = await verify({ token: "a".repeat(5000) });
    assert.equal(decision.reason, "malformed-token");
  });
});

describe("bot-challenge — provider outcomes fail closed", () => {
  it("denies when the provider says success:false", async () => {
    const decision = await verify({
      fetchImpl: fetchReturning({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "rejected");
    assert.ok(recentSecurityEvents().some((e) => e.kind === "captcha.rejected"));
  });

  it("denies (fail closed) on a provider timeout", async () => {
    const decision = await verify({ fetchImpl: fetchThrowing(true) });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "provider-timeout");
  });

  it("denies (fail closed) on a provider network error", async () => {
    const decision = await verify({ fetchImpl: fetchThrowing(false) });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "provider-error");
  });

  it("denies (fail closed) on a non-200 provider response", async () => {
    const decision = await verify({ fetchImpl: fetchReturning({}, false, 502) });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "provider-error");
  });
});

describe("bot-challenge — action + hostname + age binding", () => {
  it("refuses a token minted for a different action", async () => {
    const decision = await verify({
      action: "login",
      fetchImpl: fetchReturning({ ...happyBody, action: "brand-enquiry" }),
    });
    assert.equal(decision.reason, "action-mismatch");
  });

  it("refuses a token minted on a different hostname", async () => {
    const decision = await verify({
      hostname: "portal.aquacrm.test",
      fetchImpl: fetchReturning({ ...happyBody, hostname: "evil.example" }),
    });
    assert.equal(decision.reason, "hostname-mismatch");
  });

  it("honours an explicit hostname allowlist", async () => {
    const ok = await verify({
      hostname: undefined,
      expectedHostnames: ["portal.aquacrm.test"],
      fetchImpl: fetchReturning(happyBody),
    });
    assert.equal(ok.ok, true);
  });

  it("refuses a token older than the max age", async () => {
    const stale = { ...happyBody, challenge_ts: new Date(NOW - 6 * 60_000).toISOString() };
    const decision = await verify({ fetchImpl: fetchReturning(stale) });
    assert.equal(decision.reason, "expired");
  });

  it("refuses a malformed provider timestamp", async () => {
    const decision = await verify({
      fetchImpl: fetchReturning({ ...happyBody, challenge_ts: "not-a-date" }),
    });
    assert.equal(decision.reason, "invalid-timestamp");
  });

  it("refuses a provider timestamp materially in the future", async () => {
    const decision = await verify({
      fetchImpl: fetchReturning({
        ...happyBody,
        challenge_ts: new Date(NOW + 2 * 60_000).toISOString(),
      }),
    });
    assert.equal(decision.reason, "invalid-timestamp");
  });

  it("tolerates absent action/hostname OUTSIDE production (test keys) with a warning", async () => {
    const decision = await verify({ fetchImpl: fetchReturning({ success: true }) });
    assert.equal(decision.ok, true);
    const events = recentSecurityEvents();
    assert.ok(events.some((e) => e.kind === "captcha.action-absent"));
    assert.ok(events.some((e) => e.kind === "captcha.hostname-absent"));
  });

  it("REQUIRES action/hostname to be present and bound in production", async () => {
    process.env.NODE_ENV = "production";
    const decision = await verify({ fetchImpl: fetchReturning({ success: true }) });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "action-mismatch");
  });

  it("REQUIRES a provider timestamp in production", async () => {
    process.env.NODE_ENV = "production";
    const decision = await verify({
      fetchImpl: fetchReturning({
        success: true,
        action: "login",
        hostname: "portal.aquacrm.test",
      }),
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "invalid-timestamp");
  });
});

describe("bot-challenge — replay resistance", () => {
  it("refuses a token that was already spent", async () => {
    const first = await verify({ token: "single.use.token" });
    assert.equal(first.ok, true);
    const second = await verify({ token: "single.use.token" });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "replayed");
  });


  it("keeps the process-local replay cache at its hard maximum", async () => {
    __seedBotChallengeReplayForTest(5_000, NOW);
    const decision = await verify({ token: "new-token-at-capacity" });
    assert.equal(decision.ok, true);
    assert.equal(__botChallengeReplaySizeForTest(), 5_000);
  });
});

describe("bot-challenge — per-IP verify rate limit", () => {
  it("rate-limits a flood of verification attempts from one IP", async () => {
    const ip = "198.51.100.99";
    let lastReason = "";
    for (let i = 0; i < 31; i += 1) {
      const decision = await verify({
        remoteIp: ip,
        token: `token-${i}`,
        // rejected responses do not consume the replay slot, keeping the loop
        // purely about the rate limiter.
        fetchImpl: fetchReturning({ success: false, "error-codes": ["x"] }),
      });
      lastReason = decision.reason;
    }
    assert.equal(lastReason, "rate-limited");
  });
});

describe("bot-challenge — configuration gate", () => {
  it("SKIPS (allows) when unconfigured outside production", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "test";
    const decision = await verify({ token: undefined, fetchImpl: fetchThrowing(false) });
    assert.equal(decision.ok, true);
    assert.equal(decision.enforced, false);
    assert.equal(decision.reason, "skipped-unconfigured");
  });

  it("FAILS CLOSED when unconfigured in production, with a critical event", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "production";
    const decision = await verify({ token: undefined });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "unconfigured-fail-closed");
    assert.ok(
      recentSecurityEvents().some(
        (e) => e.kind === "captcha.unconfigured-fail-closed" && e.severity === "critical",
      ),
    );
  });
});
