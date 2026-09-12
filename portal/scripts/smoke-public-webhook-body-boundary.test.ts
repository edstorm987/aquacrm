import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readBoundedPublicWebhookBody } from "../src/lib/server/portal/publicWebhookBody";

test("provider webhook reader preserves exact signed bytes within its boundary", async () => {
  const raw = JSON.stringify({ id: "evt_local", value: "£ and é" });
  const result = await readBoundedPublicWebhookBody(new Request("https://aqua.example.test/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  }), 1_024);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.rawBody, raw);
  assert.equal(result.ok && result.byteLength, new TextEncoder().encode(raw).byteLength);
});

test("declared and chunked oversized provider payloads fail 413", async () => {
  const declared = await readBoundedPublicWebhookBody(new Request("https://aqua.example.test/webhook", {
    method: "POST",
    headers: { "content-length": "9999" },
    body: "{}",
  }), 100);
  assert.equal(declared.ok, false);
  assert.equal(!declared.ok && declared.response.status, 413);

  const chunked = await readBoundedPublicWebhookBody(new Request("https://aqua.example.test/webhook", {
    method: "POST",
    body: "x".repeat(101),
  }), 100);
  assert.equal(chunked.ok, false);
  assert.equal(!chunked.ok && chunked.response.status, 413);
});

test("all six public provider handlers use the shared bounded raw-body reader", () => {
  const files = [
    "src/built-ins/modules/affiliates/src/api/handlers.ts",
    "src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts",
    "src/built-ins/modules/memberships/src/api/handlers.ts",
    "src/built-ins/modules/ecommerce/src/api/handlers.ts",
    "src/built-ins/modules/leads-pipeline/src/api/handlers.ts",
    "src/built-ins/modules/email-sender/src/api/handlers.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /readBoundedPublicWebhookBody\(req\)/, `${file} bypasses the bounded reader`);
  }
});
