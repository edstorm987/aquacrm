// Real content-scanner adapter (Item 7) — behavioural.
//
// buildEnvContentScanner is the ONLY path that turns PORTAL_AV_SCANNER_URL into a
// live scanner: it POSTs the uploaded bytes through the audited egress broker and
// maps the JSON verdict. It is a fail-CLOSED control — a scanner outage, a non-2xx
// response, an unparseable body, or an egress refusal must all surface as an ERROR
// (→ quarantine in production), never a fabricated "clean". It had NO test at all,
// and it depends on the outbound broker whose IP-pin was found broken during the
// adversarial pass — so a "wired" scanner could have thrown on every scan while the
// readiness gate showed green. These tests drive the real adapter logic with
// controlled scanner responses (broker injected) plus one real-broker fail-closed
// integration check.

import assert from "node:assert/strict";
import test from "node:test";

import { buildEnvContentScanner } from "../src/lib/server/security/contentScannerAdapter";
import { OutboundBlockedError, type OutboundRequest, type OutboundResponse } from "../src/lib/server/net/outboundBroker";
import type { brokeredFetch } from "../src/lib/server/net/outboundBroker";

const SAMPLE = { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), digest: "deadbeef", declaredType: "application/pdf", sizeBytes: 4 };

function okResponse(bodyText: string, status = 200): OutboundResponse {
  return { status, finalUrl: "https://scanner.example/scan", headers: {}, bodyText, bytes: bodyText.length, redirectCount: 0, pinnedAddresses: ["203.0.113.5"] };
}

/** A fake broker that records the request and returns a scripted response. */
function fakeBroker(handler: (req: OutboundRequest) => OutboundResponse | Promise<OutboundResponse>): { fn: typeof brokeredFetch; last: () => OutboundRequest | undefined } {
  let last: OutboundRequest | undefined;
  const fn = (async (req: OutboundRequest) => { last = req; return handler(req); }) as typeof brokeredFetch;
  return { fn, last: () => last };
}

const ENV = { PORTAL_AV_SCANNER_URL: "https://scanner.example/scan" } as NodeJS.ProcessEnv;

test("no PORTAL_AV_SCANNER_URL → no scanner is built (stays fail-closed / unverified)", () => {
  assert.equal(buildEnvContentScanner({} as NodeJS.ProcessEnv), null);
  assert.equal(buildEnvContentScanner({ PORTAL_AV_SCANNER_URL: "   " } as NodeJS.ProcessEnv), null);
});

test("a clean verdict maps to malicious:false and POSTs the real bytes + provenance headers", async () => {
  const broker = fakeBroker(() => okResponse('{"malicious":false,"detail":"clean"}'));
  const scan = buildEnvContentScanner(ENV, broker.fn);
  assert.ok(scan, "scanner must be built when the URL is set");
  const verdict = await scan!(SAMPLE);
  assert.deepEqual(verdict, { malicious: false, detail: "clean" });
  const req = broker.last()!;
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://scanner.example/scan");
  assert.equal(req.purpose, "content-trust.scan");
  assert.deepEqual(req.body, SAMPLE.bytes, "the FULL bytes must be posted, not a head");
  assert.equal(req.headers?.["x-content-digest"], "deadbeef");
  assert.equal(req.headers?.["x-declared-type"], "application/pdf");
  assert.equal(req.headers?.["x-content-length"], "4");
});

test("a malicious verdict maps to malicious:true", async () => {
  const broker = fakeBroker(() => okResponse('{"malicious":true,"detail":"EICAR-Test"}'));
  const verdict = await buildEnvContentScanner(ENV, broker.fn)!(SAMPLE);
  assert.deepEqual(verdict, { malicious: true, detail: "EICAR-Test" });
});

test("the bearer token is sent only when configured", async () => {
  const withToken = fakeBroker(() => okResponse('{"malicious":false}'));
  await buildEnvContentScanner({ ...ENV, PORTAL_AV_SCANNER_TOKEN: "s3cr3t" } as NodeJS.ProcessEnv, withToken.fn)!(SAMPLE);
  assert.equal(withToken.last()!.headers?.authorization, "Bearer s3cr3t");

  const noToken = fakeBroker(() => okResponse('{"malicious":false}'));
  await buildEnvContentScanner(ENV, noToken.fn)!(SAMPLE);
  assert.equal(noToken.last()!.headers?.authorization, undefined, "no Authorization header without a token");
});

test("a non-2xx response FAILS CLOSED (throws, never 'clean')", async () => {
  const broker = fakeBroker(() => okResponse("upstream boom", 502));
  await assert.rejects(buildEnvContentScanner(ENV, broker.fn)!(SAMPLE), /scanner returned HTTP 502/);
});

test("an unparseable or malicious-less body FAILS CLOSED", async () => {
  const garbage = fakeBroker(() => okResponse("<html>not json</html>"));
  await assert.rejects(buildEnvContentScanner(ENV, garbage.fn)!(SAMPLE), /unparseable verdict/);
  const noBool = fakeBroker(() => okResponse('{"detail":"missing the boolean"}'));
  await assert.rejects(buildEnvContentScanner(ENV, noBool.fn)!(SAMPLE), /unparseable verdict/);
});

test("an egress refusal FAILS CLOSED with a policy-shaped error (no silent clean)", async () => {
  const refusing = fakeBroker(() => { throw new OutboundBlockedError("private-address", "blocked"); });
  await assert.rejects(buildEnvContentScanner(ENV, refusing.fn)!(SAMPLE), /refused by egress policy: private-address/);
});

test("real broker integration: a private/loopback scanner URL is refused end-to-end (fail closed)", async () => {
  // DEFAULT broker (no injection) — proves the real wiring refuses an SSRF-unsafe
  // scanner destination rather than posting to it, and surfaces it as an error.
  const scan = buildEnvContentScanner({ PORTAL_AV_SCANNER_URL: "http://127.0.0.1:9/scan" } as NodeJS.ProcessEnv);
  await assert.rejects(scan!(SAMPLE), /refused by egress policy|scanner request failed/);
});
