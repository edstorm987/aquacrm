// Hermetic request-boundary regression: no network, provider or live storage.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "local-public-body-boundary-secret";
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";

import { POST as issueAquaTagAdmission } from "../src/app/api/public/aqua-tag-admission/route";
import { POST as captureAquaTagForm } from "../src/app/api/public/form-capture/route";
import { POST as collectTelemetry } from "../src/app/api/telemetry/collect/route";
import { readBoundedRequestBody } from "../src/lib/server/boundedRequestBody";
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";

type StreamProbe = {
  request: NextRequest;
  produced: () => number;
  cancelled: () => boolean;
};

let realFetch: typeof fetch;
let providerCalls = 0;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async input => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    providerCalls += 1;
    return new Response(JSON.stringify({
      success: true,
      action: "aqua-tag-form-capture",
      hostname: "milesymedia.com",
      challenge_ts: new Date().toISOString(),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

after(() => { globalThis.fetch = realFetch; });

function streamedRequest(path: string, totalBytes: number, chunkBytes = 4_096): StreamProbe {
  let produced = 0;
  let cancelled = false;
  const encoder = new TextEncoder();
  const chunk = encoder.encode("x".repeat(chunkBytes));
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced >= totalBytes) {
        controller.close();
        return;
      }
      const remaining = totalBytes - produced;
      const next = remaining >= chunk.length ? chunk : chunk.slice(0, remaining);
      produced += next.length;
      controller.enqueue(next);
    },
    cancel() { cancelled = true; },
  });
  const request = new NextRequest(`https://portal.example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.example.test" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, produced: () => produced, cancelled: () => cancelled };
}

function requestWithBytes(path: string, bytes: Uint8Array, chunkBytes = 4_096): StreamProbe {
  let offset = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const next = bytes.slice(offset, Math.min(offset + chunkBytes, bytes.length));
      offset += next.length;
      controller.enqueue(next);
    },
    cancel() { cancelled = true; },
  });
  const request = new NextRequest(`https://portal.example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.example.test" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, produced: () => offset, cancelled: () => cancelled };
}

function fakeHeaderRequest(contentLength: string) {
  let bodyAccesses = 0;
  const request = {
    headers: new Headers({
      "content-length": contentLength,
      "content-type": "application/json",
      origin: "https://site.example.test",
    }),
    get body() {
      bodyAccesses += 1;
      throw new Error("body must not be accessed for a rejected declaration");
    },
  } as unknown as NextRequest;
  return { request, bodyAccesses: () => bodyAccesses };
}

describe("public streamed request boundaries", { concurrency: false }, () => {
  for (const target of [
    { name: "Aqua Tag admission", path: "/api/public/aqua-tag-admission", handler: issueAquaTagAdmission, cap: 160 * 1_024 },
    { name: "Aqua Tag capture", path: "/api/public/form-capture", handler: captureAquaTagForm, cap: 160 * 1_024 },
    { name: "telemetry", path: "/api/telemetry/collect", handler: collectTelemetry, cap: 32_768 },
  ] as const) {
    it(`${target.name} cancels an over-limit body with no Content-Length before hydration`, async () => {
      const probe = streamedRequest(target.path, 2 * 1_024 * 1_024);
      const response = await target.handler(probe.request);
      assert.equal(response.status, 413);
      assert.equal(probe.cancelled(), true);
      assert.ok(
        probe.produced() <= target.cap + 8_192,
        `consumed ${probe.produced()} bytes for a ${target.cap}-byte ceiling`,
      );
    });

    it(`${target.name} rejects invalid Content-Length before accessing the stream`, async () => {
      for (const invalid of ["-1", "1.5", "1e3", "12x", "9007199254740992"]) {
        const probe = fakeHeaderRequest(invalid);
        const response = await target.handler(probe.request);
        assert.equal(response.status, 400, invalid);
        assert.equal(probe.bodyAccesses(), 0, invalid);
      }
    });

    it(`${target.name} rejects invalid UTF-8 and non-object JSON`, async () => {
      const invalidUtf8 = requestWithBytes(target.path, new Uint8Array([0xc3, 0x28]));
      assert.equal((await target.handler(invalidUtf8.request)).status, 400);
      for (const raw of ["null", "[]", "[{}]"]) {
        const request = new NextRequest(`https://portal.example.test${target.path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://site.example.test" },
          body: raw,
        });
        assert.equal((await target.handler(request)).status, 400, raw);
      }
    });

    it(`${target.name} never accepts a valid JSON prefix by truncating an over-limit stream`, async () => {
      const validPrefix = JSON.stringify({
        siteKey: "aqua_public_milesymedia_v1",
        submissionId: "aqua_sub_truncationprobe001",
        pageUrl: "https://milesymedia.com/contact",
        pagePath: "/contact",
        captchaToken: "truncation-proof",
        category: "analytics",
        type: "pageview",
        consentAnalytics: true,
        fields: [{ key: "email", value: "visitor@example.test" }],
      });
      const raw = validPrefix + " ".repeat(target.cap + 1 - Buffer.byteLength(validPrefix));
      const probe = requestWithBytes(target.path, new TextEncoder().encode(raw));
      const callsBefore = providerCalls;
      assert.equal((await target.handler(probe.request)).status, 413);
      assert.equal(probe.cancelled(), true);
      assert.ok(probe.produced() <= target.cap + 8_192);
      assert.equal(providerCalls, callsBefore, "an oversize body reached managed proof");
    });
  }

  it("rejects a declared over-limit body without pulling the stream", async () => {
    let readerCalls = 0;
    const request = {
      headers: new Headers({ "content-length": "1025", "content-type": "application/json" }),
      body: {
        getReader() {
          readerCalls += 1;
          throw new Error("the declared limit should refuse before body access");
        },
      },
    } as unknown as Request;
    const result = await readBoundedRequestBody(request, 1_024);
    assert.deepEqual(result, { ok: false, status: 413, reason: "request_body_too_large" });
    assert.equal(readerCalls, 0);
  });

  it("counts bytes rather than JavaScript characters and preserves valid JSON", async () => {
    const rawBody = JSON.stringify({ message: "£".repeat(20) });
    const bytes = new TextEncoder().encode(rawBody).byteLength;
    const request = new Request("https://portal.example.test/bounded", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });
    const result = await readBoundedRequestBody(request, bytes);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.byteLength, bytes);
      assert.deepEqual(JSON.parse(result.rawBody), { message: "£".repeat(20) });
    }
  });

  it("accepts the full 60-field contract at the exact 160 KiB wire ceiling", async () => {
    __resetBotChallengeForTest();
    const fields = Array.from({ length: 60 }, (_, index) => ({
      key: `field_${index}`,
      label: "L".repeat(120),
      value: "v".repeat(2_000),
      type: "text",
    }));
    const body = {
      siteKey: "aqua_public_milesymedia_v1",
      propertyId: "milesymedia",
      formName: "F".repeat(160),
      formId: "I".repeat(120),
      purpose: "contact",
      pageUrl: `https://milesymedia.com/${"p".repeat(400)}`,
      pagePath: `/${"q".repeat(299)}`,
      submittedAt: Date.now(),
      submissionId: "aqua_sub_maximumcontract001",
      fields,
      captchaToken: "maximum-contract-proof",
    };
    const serialized = JSON.stringify(body);
    const cap = 160 * 1_024;
    assert.ok(Buffer.byteLength(serialized) < cap);
    const exact = serialized + " ".repeat(cap - Buffer.byteLength(serialized));
    assert.equal(Buffer.byteLength(exact), cap);
    const response = await issueAquaTagAdmission(new NextRequest(
      "https://portal.example.test/api/public/aqua-tag-admission",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(cap),
          origin: "https://milesymedia.com",
          "x-forwarded-for": "198.51.100.254",
        },
        body: exact,
      },
    ));
    assert.equal(response.status, 201, await response.text());
    assert.equal(providerCalls, 1);
  });

  it("the primitive accepts exactly maxBytes but rejects one additional byte", async () => {
    const raw = JSON.stringify({ message: "£".repeat(50) });
    const bytes = new TextEncoder().encode(raw);
    const exact = await readBoundedRequestBody(new Request("https://portal.example.test/primitive", {
      method: "POST",
      body: bytes,
    }), bytes.byteLength);
    assert.equal(exact.ok, true);
    const oneShort = await readBoundedRequestBody(new Request("https://portal.example.test/primitive", {
      method: "POST",
      body: bytes,
    }), bytes.byteLength - 1);
    assert.deepEqual(oneShort, { ok: false, status: 413, reason: "request_body_too_large" });
  });

  for (const target of [
    { name: "Aqua Tag admission", path: "/api/public/aqua-tag-admission", handler: issueAquaTagAdmission },
    { name: "Aqua Tag capture", path: "/api/public/form-capture", handler: captureAquaTagForm },
    { name: "telemetry", path: "/api/telemetry/collect", handler: collectTelemetry },
  ] as const) {
    it(`${target.name} treats JSON null as an invalid object instead of throwing`, async () => {
      const request = new NextRequest(`https://portal.example.test${target.path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://site.example.test" },
        body: "null",
      });
      const response = await target.handler(request);
      assert.equal(response.status, 400);
    });
  }
});
