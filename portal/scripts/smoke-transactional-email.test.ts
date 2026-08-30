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

type TransactionalEmail = typeof import("../src/lib/server/email/transactionalEmail");
type Settings = typeof import("../src/server/agencySettings");

let sendTransactionalEmail: TransactionalEmail["sendTransactionalEmail"];
let updateAgencyWorkspaceSettings: Settings["updateAgencyWorkspaceSettings"];

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "transactional-email-smoke-vault-key-longer-than-thirty-two-characters";
  // The send path is founder-gated since 2026-08-30 (see the decision note in
  // transactionalEmail.ts). These tests exercise the FOUNDER path, so the
  // founder must actually exist: the gate resolves FOUNDER_EMAIL to a user
  // record and takes that record's agency.
  process.env.FOUNDER_EMAIL = "founder@smoke.test";
  ({ sendTransactionalEmail } = await import("../src/lib/server/email/transactionalEmail"));
  ({ updateAgencyWorkspaceSettings } = await import("../src/server/agencySettings"));
  const { mutate } = await import("../src/server/storage");
  mutate(state => {
    state.users["founder@smoke.test"] = {
      id: "user_founder_smoke",
      email: "founder@smoke.test",
      agencyId: "milesymedia",
      role: "agency-owner",
      name: "Smoke Founder",
      createdAt: 0,
      updatedAt: 0,
    } as never;
  });
});

const input = {
  to: "client@example.com",
  agencyId: "milesymedia",
  clientId: "client_1",
  externalRef: "customer-access:client_1",
  subject: "Your portal",
  bodyText: "Open your portal.",
  bodyHtml: "<p>Open your portal.</p>",
};

test("system email reports unconfigured without attempting delivery", async () => {
  const oldToken = process.env.RESEND_API_KEY;
  const oldFrom = process.env.MILESYMEDIA_FROM_EMAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.MILESYMEDIA_FROM_EMAIL;
  try {
    const result = await sendTransactionalEmail(input);
    assert.deepEqual(result.delivered, false);
    assert.equal(result.via, "unconfigured");
  } finally {
    if (oldToken === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldToken;
    if (oldFrom === undefined) delete process.env.MILESYMEDIA_FROM_EMAIL;
    else process.env.MILESYMEDIA_FROM_EMAIL = oldFrom;
  }
});

test("system email sends through Resend when deployment credentials exist", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.RESEND_API_KEY;
  const oldFrom = process.env.MILESYMEDIA_FROM_EMAIL;
  process.env.RESEND_API_KEY = "test-token";
  process.env.MILESYMEDIA_FROM_EMAIL = "portal@milesymedia.co.uk";
  let request: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ id: "re_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await sendTransactionalEmail(input);
    assert.deepEqual(result, { delivered: true, via: "resend" });
    assert.equal(request?.url, "https://api.resend.com/emails");
    assert.equal(
      new Headers(request?.init?.headers).get("authorization"),
      "Bearer test-token",
    );
    const body = JSON.parse(String(request?.init?.body)) as { to: string[]; from: string };
    assert.deepEqual(body.to, ["client@example.com"]);
    assert.match(body.from, /portal@milesymedia\.co\.uk/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldToken;
    if (oldFrom === undefined) delete process.env.MILESYMEDIA_FROM_EMAIL;
    else process.env.MILESYMEDIA_FROM_EMAIL = oldFrom;
  }
});

test("workspace identity supplies the fallback sender name and reply address", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.RESEND_API_KEY;
  const oldFrom = process.env.MILESYMEDIA_FROM_EMAIL;
  process.env.RESEND_API_KEY = "test-token";
  process.env.MILESYMEDIA_FROM_EMAIL = "verified-sender@example.com";
  updateAgencyWorkspaceSettings("milesymedia", {
    legalName: "Truthful Trading Ltd",
    supportEmail: "support@truthful.example",
  }, "owner");
  let request: { init?: RequestInit } | null = null;
  globalThis.fetch = async (_url, init) => {
    request = { init };
    return new Response(JSON.stringify({ id: "re_identity" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await sendTransactionalEmail(input);
    assert.equal(result.delivered, true);
    const body = JSON.parse(String(request?.init?.body)) as { from: string; reply_to?: string };
    assert.match(body.from, /^Truthful Trading Ltd <verified-sender@example\.com>$/);
    assert.equal(body.reply_to, "support@truthful.example");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldToken;
    if (oldFrom === undefined) delete process.env.MILESYMEDIA_FROM_EMAIL;
    else process.env.MILESYMEDIA_FROM_EMAIL = oldFrom;
  }
});

test("a NON-founder agency never inherits the deployment's credentials on SEND", async () => {
  // The decision of 2026-08-30, recorded where it can fail loudly. For months
  // the readiness check founder-gated the env values while the send path did
  // not — so the UI said "not connected" while a second company's mail left on
  // the founder's key, from his address, with his reply-to
  // (env-and-sellability.md §1.1, "deliberately unfixed"). Fixed the day the
  // scouting outreach work multiplied traffic through this path. If this test
  // is red, that leak is back.
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.RESEND_API_KEY;
  const oldFrom = process.env.MILESYMEDIA_FROM_EMAIL;
  process.env.RESEND_API_KEY = "founder-only-token";
  process.env.MILESYMEDIA_FROM_EMAIL = "founder@milesymedia.example";
  let attempted = false;
  globalThis.fetch = (async () => { attempted = true; return new Response("{}", { status: 200 }); }) as never;
  try {
    const result = await sendTransactionalEmail({
      ...input,
      agencyId: "some-other-agency",
      externalRef: "customer-access:other",
    });
    assert.equal(result.delivered, false);
    assert.equal(result.via, "unconfigured",
      "a non-founder agency was allowed to send on the deployment's credentials");
    assert.equal(attempted, false, "an HTTP send was attempted on the founder's key");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldToken;
    if (oldFrom === undefined) delete process.env.MILESYMEDIA_FROM_EMAIL;
    else process.env.MILESYMEDIA_FROM_EMAIL = oldFrom;
  }
});
