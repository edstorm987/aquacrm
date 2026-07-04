// Mock-smoke for the foundation Vercel domain client. Verifies the
// call shapes (URL / method / headers / body / response handling)
// without hitting the real Vercel API.
//
// Real-creds smoke: set VERCEL_TOKEN + VERCEL_PROJECT_ID + a sandbox
// hostname you control, then run scripts/attach-domain.mjs at the
// repo root. See 01 development/runbooks/deploy.md §6c.
//
// Usage:
//   npx tsx --test scripts/smoke-vercel-domain.test.ts

import test from "node:test";
import assert from "node:assert/strict";

interface CapturedCall {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: unknown;
}

const captured: CapturedCall[] = [];
const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(spec: { status: number; body: unknown }): void {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(rawHeaders)) headers[k] = String(v);
    let body: unknown;
    try { body = init?.body ? JSON.parse(String(init.body)) : undefined; }
    catch { body = init?.body; }
    captured.push({
      url: String(url),
      ...(init?.method !== undefined ? { method: init.method } : {}),
      headers,
      ...(body !== undefined ? { body } : {}),
    });
    return new Response(JSON.stringify(spec.body), {
      status: spec.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = ORIGINAL_FETCH;
}

// The module reads env at function-call time, not at import time, so
// a static import is fine — we set/clear VERCEL_TOKEN per-test.
process.env.VERCEL_TOKEN = "fake-token-for-smoke";

// Import from the impl, NOT vercelDomain.ts — the public file has
// `import "server-only"` which throws under plain Node.
import * as mod from "../src/lib/server/vercelDomain.impl";

test("configFromEnv reads VERCEL_TOKEN", () => {
  process.env.VERCEL_TOKEN = "fake-token-for-smoke";
  const cfg = mod.configFromEnv({ projectId: "prj_test" });
  assert.equal(cfg.token, "fake-token-for-smoke");
  assert.equal(cfg.projectId, "prj_test");
});

test("configFromEnv throws clearly when VERCEL_TOKEN unset", () => {
  const saved = process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_TOKEN;
  try {
    assert.throws(() => mod.configFromEnv({ projectId: "prj_test" }), /VERCEL_TOKEN/);
  } finally {
    process.env.VERCEL_TOKEN = saved;
  }
});

test("isVercelDomainConfigured reflects env", () => {
  process.env.VERCEL_TOKEN = "tok";
  assert.equal(mod.isVercelDomainConfigured(), true);
  delete process.env.VERCEL_TOKEN;
  assert.equal(mod.isVercelDomainConfigured(), false);
  process.env.VERCEL_TOKEN = "fake-token-for-smoke";
});

test("normaliseHostname strips https / trims / lowercases", () => {
  assert.equal(mod.normaliseHostname("https://Example.COM/foo"), "example.com");
  assert.equal(mod.normaliseHostname("  WWW.Test.com "), "www.test.com");
  assert.equal(mod.normaliseHostname(""), "");
});

test("attachDomain happy path — POST /v10/projects/<id>/domains", async () => {
  captured.length = 0;
  mockFetch({
    status: 200,
    body: {
      name: "example.com",
      verified: false,
      verification: [
        { type: "TXT", domain: "example.com", value: "vc=abc", reason: "DNS not propagated" },
        { type: "CNAME", domain: "example.com", value: "cname.vercel-dns.com" },
      ],
    },
  });
  try {
    const cfg = { token: "tok", projectId: "prj_test", teamId: "team_xyz" };
    const result = await mod.attachDomain(cfg, "Example.com");

    const c = captured[0];
    assert.ok(c, "fetch was called");
    assert.match(c!.url, /\/v10\/projects\/prj_test\/domains/);
    assert.match(c!.url, /teamId=team_xyz/);
    assert.equal(c!.method, "POST");
    assert.equal(c!.headers["authorization"], "Bearer tok");
    assert.equal((c!.body as { name: string }).name, "example.com");

    assert.equal(result.ok, true);
    assert.equal(result.verified, false);
    assert.equal(result.hostname, "example.com");
    assert.equal(result.pending.length, 2);
    assert.equal(result.pending[0]?.type, "TXT");
    assert.equal(result.pending[0]?.name, "example.com");
  } finally {
    restoreFetch();
  }
});

test("attachDomain treats 409 already_in_use as success", async () => {
  mockFetch({
    status: 409,
    body: { error: { code: "domain_already_in_use", message: "..." } },
  });
  try {
    const result = await mod.attachDomain(
      { token: "tok", projectId: "prj_test" },
      "example.com",
    );
    assert.equal(result.ok, true);
  } finally {
    restoreFetch();
  }
});

test("attachDomain surfaces non-409 errors", async () => {
  mockFetch({
    status: 500,
    body: { error: { code: "internal", message: "boom" } },
  });
  try {
    const result = await mod.attachDomain(
      { token: "tok", projectId: "prj_test" },
      "example.com",
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "boom");
  } finally {
    restoreFetch();
  }
});

test("attachDomain rejects empty hostname locally (no fetch)", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("", { status: 500 });
  }) as typeof fetch;
  try {
    const result = await mod.attachDomain(
      { token: "tok", projectId: "prj_test" },
      "  ",
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "missing-hostname");
    assert.equal(called, false);
  } finally {
    restoreFetch();
  }
});

test("verifyDomain — POST /v9/projects/<id>/domains/<host>/verify", async () => {
  captured.length = 0;
  mockFetch({
    status: 200,
    body: { name: "example.com", verified: true, verification: [] },
  });
  try {
    const result = await mod.verifyDomain(
      { token: "tok", projectId: "prj_test" },
      "example.com",
    );
    const c = captured[0];
    assert.ok(c);
    assert.match(c!.url, /\/v9\/projects\/prj_test\/domains\/example\.com\/verify/);
    assert.equal(c!.method, "POST");
    assert.equal(result.ok, true);
    assert.equal(result.verified, true);
    assert.equal(result.pending.length, 0);
  } finally {
    restoreFetch();
  }
});

test("removeDomain — DELETE /v9/projects/<id>/domains/<host>", async () => {
  captured.length = 0;
  mockFetch({ status: 200, body: {} });
  try {
    const result = await mod.removeDomain(
      { token: "tok", projectId: "prj_test" },
      "example.com",
    );
    const c = captured[0];
    assert.ok(c);
    assert.equal(c!.method, "DELETE");
    assert.match(c!.url, /\/v9\/projects\/prj_test\/domains\/example\.com/);
    assert.equal(result.ok, true);
  } finally {
    restoreFetch();
  }
});

test("removeDomain returns error message on network failure", async () => {
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const result = await mod.removeDomain(
      { token: "tok", projectId: "prj_test" },
      "example.com",
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "ECONNREFUSED");
  } finally {
    restoreFetch();
  }
});
