// AUTH-001 — public contact + brand-enquiry admissions are gated by the
// managed bot-challenge (DECISIONS #13).
//
// Behavioural: drives the REAL exported POST handlers in-process. The challenge
// check sits after cheap validation/rate-limits and BEFORE any lead/enquiry is
// created, so a configured-but-untokened request is refused (403) without doing
// the heavy work. No provider network call happens on the missing-token path.
//
// Run: NODE_OPTIONS='--conditions react-server' node --import tsx --test \
//        scripts/smoke-public-forms-bot-challenge.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";

import { POST as contactPOST } from "../src/app/api/public/contact/route";
import { POST as brandPOST } from "../src/app/api/public/brand-enquiry/route";
import { POST as careersPOST } from "../src/app/api/public/careers/route";
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";
import { setContentScanner } from "../src/lib/server/security/contentTrust";
import { deletePrivateUpload } from "../src/lib/server/privateUploadStorage";
import { listPeopleApplications } from "../src/server/people";
import { reset } from "../src/server/storage";
import { createAgency, getAgencyBySlug } from "../src/server/tenants";
import { FOUNDER_AGENCY_SLUG } from "../src/lib/server/seeds/founderSeed";

const SITE_KEY = "1x00000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

let saved: Record<string, string | undefined> = {};
let realFetch: typeof fetch;

function jsonReq(url: string, body: unknown, ip: string): NextRequest {
  // No Origin header → treated as same-origin, so the cross-origin guards are
  // skipped and the request reaches the challenge check.
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

before(() => {
  saved = {
    site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    secret: process.env.TURNSTILE_SECRET_KEY,
  };
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (url.includes("challenges.cloudflare.com/turnstile")) {
      const params = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
      const token = params.get("response") ?? "";
      return new Response(JSON.stringify({
        success: token.startsWith("valid-"),
        action: token.startsWith("valid-brand-")
          ? "brand-enquiry"
          : token.startsWith("valid-careers-")
            ? "careers-application"
            : "public-contact",
        hostname: "localhost",
        challenge_ts: new Date().toISOString(),
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  __resetBotChallengeForTest();
});

async function careersReq(email: string, token: string | null, ip: string): Promise<NextRequest> {
  const form = new FormData();
  form.set("name", "Careers Applicant");
  form.set("email", email);
  form.set("roleInterest", "Engineering");
  form.set("cv", new File(["%PDF-1.7\n%%EOF"], "candidate.pdf", { type: "application/pdf" }));
  const cv = form.get("cv") as File;
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  return new NextRequest("http://localhost:3030/api/public/careers", {
    method: "POST",
    headers: {
      "content-type": encoded.headers.get("content-type") ?? "multipart/form-data",
      "content-length": String(body.byteLength),
      "x-forwarded-for": ip,
      "x-aqua-upload-size": String(cv.size),
      ...(token ? { "x-aqua-bot-token": token } : {}),
    },
    body,
  });
}

after(() => {
  setContentScanner(null);
  globalThis.fetch = realFetch;
  const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", saved.site);
  restore("TURNSTILE_SECRET_KEY", saved.secret);
});

describe("public /api/public/contact — bot-challenge gate", () => {
  const URL = "http://localhost:3030/api/public/contact";

  it("refuses a valid contact submission with NO token (403), before creating a lead", async () => {
    const res = await contactPOST(jsonReq(URL, {
      name: "Real Person",
      email: "person@example.com",
      contactMethod: "email",
      note: "Hello",
    }, "30.0.0.1"));
    assert.equal(res.status, 403);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /verification challenge/i);
  });

  it("still silently accepts a honeypot hit (200) — the honeypot precedes the challenge", async () => {
    const res = await contactPOST(jsonReq(URL, {
      name: "Bot",
      email: "bot@example.com",
      contactMethod: "email",
      website: "http://spam.example",
    }, "30.0.0.2"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("tokenless bots cannot burn a victim email quota before a verified request", async () => {
    const victim = "quota-victim@example.com";
    for (let i = 0; i < 4; i += 1) {
      const denied = await contactPOST(jsonReq(URL, {
        name: "Quota Victim",
        email: victim,
        contactMethod: "email",
        note: "Bot attempt",
      }, `30.0.2.${i + 1}`));
      assert.equal(denied.status, 403);
    }

    const allowed = await contactPOST(jsonReq(URL, {
      name: "Quota Victim",
      email: victim,
      contactMethod: "email",
      note: "Real verified enquiry",
      captchaToken: "valid-victim-token",
    }, "30.0.2.99"));
    assert.notEqual(allowed.status, 429, "unverified attempts must not spend the victim's quota");
    const payload = (await allowed.json()) as { error?: string };
    assert.ok(
      allowed.status === 200 || allowed.status === 503,
      `verified request should reach normal capture readiness, got ${allowed.status}: ${payload.error ?? ""}`,
    );
  });
});

describe("public /api/public/brand-enquiry — bot-challenge gate", () => {
  const URL = "http://localhost:3030/api/public/brand-enquiry";

  it("refuses a valid brand enquiry with NO token (403), before capturing it", async () => {
    const res = await brandPOST(jsonReq(URL, {
      brand: "milesymedia",
      name: "Real Person",
      email: "person@example.com",
      contactMethod: "email",
      consent: true,
      message: "Interested in a website.",
    }, "30.0.1.1"));
    assert.equal(res.status, 403);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /verification challenge/i);
  });

  it("tokenless bots cannot burn a victim contact quota before a verified request", async () => {
    const payload = {
      brand: "milesymedia",
      name: "Quota Victim",
      email: "brand-quota-victim@example.com",
      contactMethod: "email",
      consent: true,
      message: "A real enquiry",
    };
    for (let i = 0; i < 5; i += 1) {
      const denied = await brandPOST(jsonReq(URL, payload, `30.0.3.${i + 1}`));
      assert.equal(denied.status, 403);
    }
    const allowed = await brandPOST(jsonReq(URL, {
      ...payload,
      captchaToken: "valid-brand-victim-token",
    }, "30.0.3.99"));
    assert.notEqual(allowed.status, 429, "unverified attempts must not spend the victim's quota");
    assert.ok(
      allowed.status === 200 || allowed.status === 503,
      `verified request should reach normal capture readiness, got ${allowed.status}`,
    );
  });
});

describe("public /api/public/careers — proof before identity and file work", () => {
  it("rejects and cancels an indeterminate chunked body before proof or multipart parsing", async () => {
    let produced = 0;
    let cancelled = false;
    const chunkBytes = 256 * 1024;
    const totalBytes = 8 * 1024 * 1024 + 256 * 1024;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= totalBytes) return controller.close();
        const size = Math.min(chunkBytes, totalBytes - produced);
        produced += size;
        controller.enqueue(new Uint8Array(size));
      },
      cancel() { cancelled = true; },
    });
    const response = await careersPOST(new NextRequest("http://localhost:3030/api/public/careers", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=tokenless",
        "transfer-encoding": "chunked",
        "x-aqua-bot-token": "valid-careers-chunked",
        "x-forwarded-for": "30.0.4.2",
        "x-aqua-upload-size": String(8 * 1024 * 1024),
      },
      body: stream,
      duplex: "half",
    } as RequestInit));
    assert.equal(response.status, 413);
    assert.equal(cancelled, true, "the unread attacker stream must be cancelled");
    assert.ok(produced < totalBytes, `the body was drained (${produced}/${totalBytes} bytes)`);
  });

  it("refuses a complete application without a challenge before creating tenant or upload state", async () => {
    await reset();
    process.env.FOUNDER_PASSWORD = "configured-but-public-must-not-seed";
    const response = await careersPOST(await careersReq("candidate@example.com", null, "30.0.4.1"));
    assert.equal(response.status, 403);
    assert.equal(getAgencyBySlug(FOUNDER_AGENCY_SLUG), null, "an anonymous careers request must never seed a founder tenant");
  });

  it("tokenless callers cannot burn a victim email quota", async () => {
    await reset();
    const email = "careers-quota-victim@example.com";
    for (let index = 0; index < 3; index += 1) {
      const denied = await careersPOST(await careersReq(email, null, `30.0.5.${index + 1}`));
      assert.equal(denied.status, 403);
    }
    const verified = await careersPOST(await careersReq(email, "valid-careers-victim", "30.0.5.99"));
    assert.notEqual(verified.status, 429, "unverified attempts must not spend the victim address budget");
    assert.equal(verified.status, 503, "without an existing configured tenant, the public route must fail closed rather than bootstrap one");
  });

  it("persists scanner-clean release and a secret/PII-free initial audit only after the owner transaction", async () => {
    await reset();
    const agency = createAgency({ name: "Careers security test", slug: FOUNDER_AGENCY_SLUG });
    setContentScanner(async input => {
      assert.equal((await input.file.arrayBuffer()).byteLength, input.sizeBytes, "the injected scanner must receive the complete CV");
      return { malicious: false };
    });
    try {
      const response = await careersPOST(await careersReq("careers-audit@example.com", "valid-careers-audit", "30.0.5.100"));
      assert.equal(response.status, 201);
      const applications = listPeopleApplications(agency.id);
      assert.equal(applications.length, 1);
      const application = applications[0]!;
      assert.equal(application.cv.contentTrust?.scannerVerdict, "clean");
      assert.equal(application.cv.contentTrust?.quarantineStatus, "released");
      const audit = application.cv.securityAudit?.at(-1);
      assert.equal(audit?.event, "initial-assessment");
      assert.equal(audit?.actorRef, "system:public-careers-admission");
      assert.match(audit?.scanId ?? "", /^[0-9a-f-]{36}$/);
      assert.match(audit?.objectVersion ?? "", /^[0-9a-f]{64}$/);
      assert.match(audit?.digest ?? "", /^[0-9a-f]{64}$/);
      assert.doesNotMatch(JSON.stringify(audit), /careers-audit@example|candidate\.pdf|valid-careers-audit|Bearer/i);
      const removed = await deletePrivateUpload({
        storageProvider: application.cv.storageProvider,
        storageKey: application.cv.storageKey,
        localDirectory: "people-cvs",
      });
      assert.equal(removed.ok, true);
    } finally {
      setContentScanner(null);
      await reset();
    }
  });
});
