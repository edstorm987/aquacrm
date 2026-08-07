import assert from "node:assert/strict";
import test from "node:test";
import { sendTransactionalEmail } from "../src/lib/server/transactionalEmail";

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
