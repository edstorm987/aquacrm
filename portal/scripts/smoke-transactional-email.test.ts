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
  const oldToken = process.env.POSTMARK_SERVER_TOKEN;
  const oldFrom = process.env.MILESYMEDIA_FROM_EMAIL;
  delete process.env.POSTMARK_SERVER_TOKEN;
  delete process.env.MILESYMEDIA_FROM_EMAIL;
  try {
    const result = await sendTransactionalEmail(input);
    assert.deepEqual(result.delivered, false);
    assert.equal(result.via, "unconfigured");
  } finally {
    if (oldToken === undefined) delete process.env.POSTMARK_SERVER_TOKEN;
    else process.env.POSTMARK_SERVER_TOKEN = oldToken;
    if (oldFrom === undefined) delete process.env.MILESYMEDIA_FROM_EMAIL;
    else process.env.MILESYMEDIA_FROM_EMAIL = oldFrom;
  }
});

test("system email sends through Postmark when deployment credentials exist", async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.POSTMARK_SERVER_TOKEN;
  const oldFrom = process.env.MILESYMEDIA_FROM_EMAIL;
  process.env.POSTMARK_SERVER_TOKEN = "test-token";
  process.env.MILESYMEDIA_FROM_EMAIL = "portal@milesymedia.co.uk";
  let request: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ MessageID: "pm_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await sendTransactionalEmail(input);
    assert.deepEqual(result, { delivered: true, via: "postmark" });
    assert.equal(request?.url, "https://api.postmarkapp.com/email");
    assert.equal(
      new Headers(request?.init?.headers).get("X-Postmark-Server-Token"),
      "test-token",
    );
    const body = JSON.parse(String(request?.init?.body)) as { To: string; From: string };
    assert.equal(body.To, "client@example.com");
    assert.match(body.From, /portal@milesymedia\.co\.uk/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.POSTMARK_SERVER_TOKEN;
    else process.env.POSTMARK_SERVER_TOKEN = oldToken;
    if (oldFrom === undefined) delete process.env.MILESYMEDIA_FROM_EMAIL;
    else process.env.MILESYMEDIA_FROM_EMAIL = oldFrom;
  }
});
