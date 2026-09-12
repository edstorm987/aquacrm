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
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";

const SITE_KEY = "1x00000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

let saved: Record<string, string | undefined> = {};

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
  __resetBotChallengeForTest();
});

after(() => {
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
});
