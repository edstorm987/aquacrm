// Smoke — Aqua Tag network throttling (BEHAVIOURAL).
// Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server'
// npx tsx --test scripts/*.test.ts
//
// § The editor's wifi control sends `aqua-explorer:throttle` and the tag wraps
// window.fetch / XMLHttpRequest with REAL latency, bandwidth pacing and
// offline failure. These tests VM-execute the actual `AQUA_TAG_SOURCE` (same
// harness family as smoke-aqua-tag-consent-injection.test.ts) and prove the
// wrap with a clock, not with source shapes:
//   1. LAZY — a page that is never throttled keeps its native fetch and XHR
//   2. latency is genuinely waited out; the ack reports what is in force
//   3. offline rejects the way a dead network rejects (TypeError / XHR error)
//   4. downKbps paces the response read in proportion to its size
//   5. re-apply replaces; clear restores the EXACT originals
//   6. the version gate and the normalizer keep junk out of the wrap
//
// What is deliberately NOT here: any claim about document/stylesheet/image
// loads. A parent page cannot throttle those (only DevTools can), the tag
// never pretends to, and no test should ever paper over that scope.
//
// Hermetic: no global mutation — every dependency is a local stub handed to
// the VM context. Timing assertions are lower bounds with margin, so a busy
// machine makes them MORE true, never flaky-false.

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { AQUA_TAG_SOURCE } from "../src/lib/integrations/aquaTagSource";

interface ThrottleProfile { latencyMs: number; downKbps: number; offline: boolean }

interface PostedReply { payload: { type?: string; version?: number; profile?: ThrottleProfile | null }; origin: string }

interface FetchCall { input: unknown; init: unknown; at: number }

interface FakeXhrInstance {
  events: string[];
  send(body: unknown): void;
}

interface TagHarness {
  window: Record<string, unknown>;
  replies: PostedReply[];
  fetchCalls: FetchCall[];
  pageFetch: (input: unknown, init?: unknown) => Promise<Response>;
  Xhr: { new (): FakeXhrInstance; prototype: FakeXhrInstance };
  /** Every body that REACHED the fake network through XHR, with when. */
  xhrSends: Array<{ xhr: FakeXhrInstance; body: unknown; at: number }>;
  originalXhrSend: (body: unknown) => void;
  /** Dispatch one message event into the page, as the editor's postMessage would land. */
  sendThrottle(profile: unknown, options?: { version?: number }): void;
  lastReply(): PostedReply | undefined;
}

function bootTag(options: { withoutFetch?: boolean; responseBody?: () => Response } = {}): TagHarness {
  const windowListeners = new Map<string, Array<(event: unknown) => void>>();
  const replies: PostedReply[] = [];
  const fetchCalls: FetchCall[] = [];

  const parent = {
    postMessage: (payload: PostedReply["payload"], origin: string) => { replies.push({ payload, origin }); },
  };

  // What the PAGE's own scripts call. Distinct from the config-endpoint stub
  // below so the test can tell "the page fetched" from "the tag booted".
  const pageFetch = (input: unknown, init?: unknown) => {
    fetchCalls.push({ input, init, at: Date.now() });
    return Promise.resolve(options.responseBody ? options.responseBody() : new Response("ok"));
  };

  const xhrSends: Array<{ xhr: FakeXhrInstance; body: unknown; at: number }> = [];
  class Xhr implements FakeXhrInstance {
    events: string[] = [];
    dispatchEvent(event: { type: string }) { this.events.push(event.type); return true; }
    send(body: unknown) { xhrSends.push({ xhr: this, body, at: Date.now() }); }
  }
  const originalXhrSend = Xhr.prototype.send;

  const window: Record<string, unknown> = {
    __aquaTagLoaded: false,
    parent,
    addEventListener: (type: string, callback: (event: unknown) => void) => {
      windowListeners.set(type, [...(windowListeners.get(type) ?? []), callback]);
    },
    dispatchEvent: () => true,
    XMLHttpRequest: Xhr,
  };
  if (!options.withoutFetch) window.fetch = pageFetch;

  const appendChild = (element: unknown) => element;
  const document = {
    currentScript: {
      src: "https://aqua-crm.com/aqua-tag.js",
      dataset: { siteKey: "aqua_public_aquacrm_v1", property: "aquacrm" },
    },
    title: "AquaCRM",
    referrer: "",
    readyState: "loading",
    createElement: (tag: string) => ({ tag, dataset: {}, setAttribute() {}, addEventListener() {} }),
    head: { appendChild },
    documentElement: { appendChild, dataset: {} },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  vm.runInNewContext(AQUA_TAG_SOURCE, {
    window,
    document,
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    location: { origin: "https://client-site.test", href: "https://client-site.test/", pathname: "/", protocol: "https:", host: "client-site.test" },
    navigator: { sendBeacon: () => true },
    performance: { getEntriesByType: () => [] },
    history: { pushState() {}, replaceState() {} },
    crypto: webcrypto,
    // The tag's own boot-time config fetch — not the page's fetch.
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    Blob, URL, JSON, Math, Date, Object, Boolean, String, Set, Number,
    // Host intrinsics on purpose, so the test can `instanceof` what the tag
    // builds and the tag can pace host Response bodies.
    TypeError, Response, ReadableStream, Event, Promise, Uint8Array,
    setTimeout, clearTimeout, queueMicrotask,
    CustomEvent: class { constructor(public type: string) {} },
    HTMLFormElement: class {},
    Element: class {},
  });

  const dispatch = (data: unknown) => {
    for (const callback of windowListeners.get("message") ?? []) {
      callback({ data, origin: "https://portal.aquacrm.test", source: parent });
    }
  };

  return {
    window,
    replies,
    fetchCalls,
    pageFetch,
    Xhr,
    xhrSends,
    originalXhrSend,
    sendThrottle: (profile, sendOptions = {}) =>
      dispatch({ type: "aqua-explorer:throttle", version: sendOptions.version ?? 1, profile }),
    lastReply: () => replies[replies.length - 1],
  };
}

const pageRequest = (tag: TagHarness, input = "https://client-site.test/api/data") =>
  (tag.window.fetch as typeof fetch)(input);

// --- 1. Lazy — never throttled means never touched ---------------------------
test("a page that is never throttled keeps its native fetch and XHR untouched", () => {
  const tag = bootTag();
  assert.equal(tag.window.fetch, tag.pageFetch, "fetch must not be wrapped before the first profile");
  assert.equal(tag.Xhr.prototype.send, tag.originalXhrSend, "XHR send must not be wrapped before the first profile");

  // Clearing a throttle that never existed is acknowledged and still touches nothing.
  tag.sendThrottle(null);
  assert.equal(tag.lastReply()?.payload.type, "aqua-explorer:throttle-applied");
  assert.equal(tag.lastReply()?.payload.profile, null);
  assert.equal(tag.window.fetch, tag.pageFetch);
  assert.equal(tag.Xhr.prototype.send, tag.originalXhrSend);
});

// --- 2. Latency is real waiting; the ack is the truth ------------------------
test("latency is genuinely waited out and the ack reports the profile in force", async () => {
  const tag = bootTag();
  tag.sendThrottle({ latencyMs: 60, downKbps: 0, offline: false });

  const reply = tag.lastReply();
  assert.equal(reply?.payload.type, "aqua-explorer:throttle-applied");
  assert.deepEqual({ ...reply?.payload.profile }, { latencyMs: 60, downKbps: 0, offline: false });
  // The reply goes to the origin the editor spoke from — never broadcast.
  assert.equal(reply?.origin, "https://portal.aquacrm.test");
  assert.notEqual(tag.window.fetch, tag.pageFetch, "fetch is wrapped once a profile is in force");

  const started = Date.now();
  const response = await pageRequest(tag);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 50, `a 60ms latency waited only ${elapsed}ms`);
  assert.equal(tag.fetchCalls.length, 1, "the real fetch still happened, after the wait");
  assert.equal(tag.fetchCalls[0]!.input, "https://client-site.test/api/data");
  assert.equal(await response.text(), "ok", "the response passes through unchanged");
});

// --- 3. Offline fails the way a dead network fails ---------------------------
test("offline rejects fetch with a TypeError and errors XHR without sending", async () => {
  const tag = bootTag();
  tag.sendThrottle({ latencyMs: 0, downKbps: 0, offline: true });
  assert.deepEqual({ ...tag.lastReply()?.payload.profile }, { latencyMs: 0, downKbps: 0, offline: true });

  await assert.rejects(
    () => pageRequest(tag),
    (error: unknown) => {
      assert.ok(error instanceof TypeError, "a dead network rejects with a TypeError, so the simulation must too");
      assert.equal((error as TypeError).message, "Failed to fetch");
      return true;
    },
  );
  assert.equal(tag.fetchCalls.length, 0, "offline means the request never leaves the page");

  const xhr = new tag.Xhr();
  xhr.send("payload");
  assert.equal(tag.xhrSends.length, 0, "offline XHR must never reach the network");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(xhr.events, ["error"], "the XHR errors the way the browser errors it");
  assert.equal(tag.xhrSends.length, 0);
});

// --- 4. Bandwidth pacing is proportional to what actually arrived ------------
test("downKbps paces the response read in proportion to its size", async () => {
  // 8000 bytes at 800 kbps is 8000*8/800 = 80ms of genuine pacing.
  const tag = bootTag({
    responseBody: () => new Response(new Uint8Array(8000), { status: 200, headers: { "x-parity": "kept" } }),
  });
  tag.sendThrottle({ latencyMs: 0, downKbps: 800, offline: false });

  const started = Date.now();
  const response = await pageRequest(tag);
  const bytes = await response.arrayBuffer();
  const elapsed = Date.now() - started;

  assert.ok(elapsed >= 60, `8000 bytes at 800kbps should take ~80ms, took ${elapsed}ms`);
  assert.equal(bytes.byteLength, 8000, "pacing must never drop or truncate the body");
  assert.equal(response.status, 200, "status survives the paced re-wrap");
  assert.equal(response.headers.get("x-parity"), "kept", "headers survive the paced re-wrap");
});

// --- 5. Idempotent replace; clear restores the very originals ----------------
test("re-applying replaces the profile in place and clearing restores the originals", async () => {
  const tag = bootTag();
  tag.sendThrottle({ latencyMs: 30, downKbps: 0, offline: false });
  const wrappedFetch = tag.window.fetch;
  const wrappedSend = tag.Xhr.prototype.send;

  // Replace with a different profile: same wrap, new behaviour.
  tag.sendThrottle({ latencyMs: 0, downKbps: 0, offline: true });
  assert.equal(tag.window.fetch, wrappedFetch, "re-applying must not stack a second wrap");
  assert.equal(tag.Xhr.prototype.send, wrappedSend);
  await assert.rejects(() => pageRequest(tag), TypeError);

  // Clear: identity restore, not a lookalike.
  tag.sendThrottle(null);
  assert.equal(tag.lastReply()?.payload.profile, null);
  assert.equal(tag.window.fetch, tag.pageFetch, "clearing restores the exact original fetch");
  assert.equal(tag.Xhr.prototype.send, tag.originalXhrSend, "clearing restores the exact original XHR send");
  const response = await pageRequest(tag);
  assert.equal(await response.text(), "ok", "the page is back to normal after clearing");
});

// --- 6. XHR latency ----------------------------------------------------------
test("XHR sends are delayed by the latency in force and then really sent", async () => {
  const tag = bootTag();
  tag.sendThrottle({ latencyMs: 50, downKbps: 0, offline: false });

  const xhr = new tag.Xhr();
  const started = Date.now();
  xhr.send("the-body");
  assert.equal(tag.xhrSends.length, 0, "the send waits out the latency first");

  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(tag.xhrSends.length, 1, "the real send happens after the wait");
  assert.equal(tag.xhrSends[0]!.body, "the-body");
  assert.equal(tag.xhrSends[0]!.xhr, xhr, "the delayed send keeps its own request object");
  assert.ok(tag.xhrSends[0]!.at - started >= 40, "the delay was genuinely waited out");
});

// --- 7. The version gate and the normalizer keep junk out --------------------
test("a wrong protocol version does nothing and junk profiles clear rather than half-apply", async () => {
  const tag = bootTag();

  // Wrong version: total silence — no wrap, no reply. Same rule as every message.
  tag.sendThrottle({ latencyMs: 500, downKbps: 0, offline: false }, { version: 99 });
  assert.equal(tag.replies.length, 0, "a wrong-version throttle must not be acknowledged");
  assert.equal(tag.window.fetch, tag.pageFetch, "a wrong-version throttle must not wrap anything");

  // A malformed profile after a real one CLEARS — it must never leave the old
  // profile silently in force while the editor believes something new applied.
  tag.sendThrottle({ latencyMs: 40, downKbps: 0, offline: false });
  assert.notEqual(tag.window.fetch, tag.pageFetch);
  tag.sendThrottle({ latencyMs: "soon", downKbps: "fast", offline: "kinda" });
  assert.equal(tag.lastReply()?.payload.profile, null, "junk normalizes to null and the ack says so");
  assert.equal(tag.window.fetch, tag.pageFetch, "junk clears the wrap entirely");

  // All-zeroes is not a throttle. It normalizes to null too.
  tag.sendThrottle({ latencyMs: 0, downKbps: 0, offline: false });
  assert.equal(tag.lastReply()?.payload.profile, null);
  assert.equal(tag.window.fetch, tag.pageFetch);

  // Negative numbers cannot smuggle a wrap in either.
  tag.sendThrottle({ latencyMs: -200, downKbps: -1, offline: false });
  assert.equal(tag.lastReply()?.payload.profile, null);
  assert.equal(tag.window.fetch, tag.pageFetch);
});

// --- 8. The ack never lies ---------------------------------------------------
test("a page whose window has no fetch answers null instead of pretending", () => {
  const tag = bootTag({ withoutFetch: true });
  tag.sendThrottle({ latencyMs: 2000, downKbps: 400, offline: false });
  assert.equal(tag.lastReply()?.payload.type, "aqua-explorer:throttle-applied");
  assert.equal(
    tag.lastReply()?.payload.profile,
    null,
    "no wrap could be installed, so the ack must say nothing is in force — the UI renders truth, not intent",
  );
});
