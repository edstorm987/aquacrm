// Smoke — Aqua Tag injection consent gate (BEHAVIOURAL).
// Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server'
// npx tsx --test scripts/*.test.ts
//
// § The auditor asked for this one twice: the injection gate was only ever
// proved by source-shape assertions (smoke-aqua-tag-injections.test.ts), which
// cannot show that a tag actually STAYS OUT of the page until consent. This
// VM-executes the real `AQUA_TAG_SOURCE` (same harness as
// smoke-consent-capture.test.ts) against a fake DOM and a stubbed config
// endpoint, and asserts on what reaches `document.head`:
//   1. analytics injection + NO consent  → nothing injected
//   2. applyPreferences granting analytics → injected retroactively
//   3. rejection keeps it out; marketing stays out when only analytics granted
//   4. fail-CLOSED: a category-less / unknown-category item is never injected
//
// Hermetic: no global process.env / globalThis.fetch mutation (the suite runs
// files concurrently in one shared process) — every dependency is a local
// stub handed to the VM context.

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { AQUA_TAG_SOURCE } from "../src/lib/integrations/aquaTagSource";

interface Injection { kind: string; value: string; consentCategory?: string }

interface FakeScript { tag: string; src?: string; attrs: Record<string, string> }

interface TagHarness {
  aqua: { consent: { set(value: Record<string, boolean>): boolean } };
  window: Record<string, unknown>;
  /** Every element appended to document.head / documentElement, in order. */
  appended: FakeScript[];
  /** Just the `src`s of appended <script> elements. */
  scriptSrcs(): string[];
  injectedFrom(host: string): string[];
  configRequests: string[];
  settle(): Promise<void>;
}

// Boots the real tag in a fresh VM realm with `injections` served by a stubbed
// /api/public/aqua-tag-config, and `storedPreferences` (if any) in localStorage.
async function bootTag(
  injections: Injection[],
  storedPreferences?: Record<string, unknown>,
): Promise<TagHarness> {
  const storage = new Map<string, string>();
  if (storedPreferences) storage.set("aqua-cookie-preferences", JSON.stringify(storedPreferences));

  const windowListeners = new Map<string, Array<(event: unknown) => void>>();
  const appended: FakeScript[] = [];
  const configRequests: string[] = [];

  class FakeCustomEvent {
    constructor(public type: string, public init: { detail?: unknown } = {}) {}
    get detail() { return this.init.detail; }
  }
  class FakeForm { dataset = {}; getAttribute() { return null; } }
  class FakeElement {}

  const window = {
    __aquaTagLoaded: false,
    addEventListener: (type: string, callback: (event: unknown) => void) => {
      windowListeners.set(type, [...(windowListeners.get(type) ?? []), callback]);
    },
    dispatchEvent: (event: FakeCustomEvent) => {
      for (const callback of windowListeners.get(event.type) ?? []) callback(event);
      return true;
    },
  } as Record<string, unknown>;

  const makeElement = (tag: string): FakeScript & Record<string, unknown> => ({
    tag,
    attrs: {},
    dataset: {},
    textContent: "",
    setAttribute(this: FakeScript, name: string, value: string) { this.attrs[name] = value; },
    addEventListener() {},
  }) as unknown as FakeScript & Record<string, unknown>;

  const appendChild = (element: FakeScript) => { appended.push(element); return element; };
  const document = {
    currentScript: {
      src: "https://aqua-crm.com/aqua-tag.js",
      dataset: { siteKey: "aqua_public_aquacrm_v1", property: "aquacrm" },
    },
    title: "AquaCRM",
    referrer: "",
    readyState: "loading",
    createElement: (tag: string) => makeElement(tag),
    head: { appendChild },
    documentElement: { appendChild },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const fetchStub = (url: string) => {
    if (String(url).includes("/api/public/aqua-tag-config")) {
      configRequests.push(String(url));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ injections }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };

  vm.runInNewContext(AQUA_TAG_SOURCE, {
    window,
    document,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(`session:${key}`) ?? null,
      setItem: (key: string, value: string) => storage.set(`session:${key}`, value),
    },
    location: { origin: "https://luvandker.com", href: "https://luvandker.com/", pathname: "/", protocol: "https:", host: "luvandker.com" },
    navigator: { sendBeacon: () => true },
    performance: { getEntriesByType: () => [] },
    history: { pushState() {}, replaceState() {} },
    crypto: webcrypto,
    fetch: fetchStub,
    Blob, URL, JSON, Math, Date, Object, Boolean, String, Set,
    CustomEvent: FakeCustomEvent,
    HTMLFormElement: FakeForm,
    Element: FakeElement,
    queueMicrotask,
  });

  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  await settle(); // let the config fetch + its .then chain run

  return {
    aqua: window.Aqua as TagHarness["aqua"],
    window,
    appended,
    scriptSrcs: () => appended.filter(el => el.tag === "script").map(el => String(el.src ?? "")),
    injectedFrom(host: string) {
      return appended.filter(el => el.tag === "script" && String(el.src ?? "").includes(host)).map(el => String(el.src));
    },
    configRequests,
    settle,
  };
}

const GA4: Injection = { kind: "ga4", value: "G-ANALYTICS1", consentCategory: "analytics" };
const PIXEL: Injection = { kind: "meta-pixel", value: "1234567890", consentCategory: "marketing" };
const GSC: Injection = { kind: "gsc-verification", value: "token-abc", consentCategory: "necessary" };

// --- 1. The gate: held with NO consent, injected retroactively on opt-in ----
test("an analytics injection is HELD until consent, then fires retroactively", async () => {
  const tag = await bootTag([GA4]);

  // The tag DID fetch its config — so "not injected" is a real gate, not a
  // missing config (this is what a source-shape test can never prove).
  assert.equal(tag.configRequests.length, 1, "the tag fetched its injection config");

  // (a) No consent yet → nothing injected.
  assert.deepEqual(tag.injectedFrom("googletagmanager.com"), [], "GA4 must NOT load before consent");
  assert.equal(tag.window.gtag, undefined, "no gtag shim before consent");
  // Nothing injectable reached the page at all. (The tag always appends its own
  // visual-explorer <style> at boot — that is not a tracking tool, so the claim
  // is specifically "no script and no meta".)
  assert.deepEqual(
    tag.appended.filter(el => el.tag === "script" || el.tag === "meta"),
    [],
    "no injected script or meta reached the page before consent",
  );

  // (b) Grant analytics → the held tool fires now, without a re-fetch.
  assert.equal(tag.aqua.consent.set({ preferences: false, analytics: true, marketing: false }), true);
  await tag.settle();

  const loaded = tag.injectedFrom("googletagmanager.com");
  assert.equal(loaded.length, 1, "GA4 IS injected once analytics consent is granted");
  assert.match(loaded[0]!, /gtag\/js\?id=G-ANALYTICS1/);
  assert.equal(typeof tag.window.gtag, "function", "gtag shim is installed on opt-in");
  assert.equal(tag.configRequests.length, 1, "retroactive injection reuses the fetched config");
});

// --- 2. Rejection keeps it out; a granted category doesn't grant the others -
test("rejecting consent keeps the tag out; analytics consent doesn't unlock marketing", async () => {
  const rejected = await bootTag([GA4, PIXEL]);
  assert.equal(rejected.aqua.consent.set({ preferences: false, analytics: false, marketing: false }), true);
  await rejected.settle();
  assert.deepEqual(rejected.injectedFrom("googletagmanager.com"), [], "GA4 stays out after rejection");
  assert.deepEqual(rejected.injectedFrom("connect.facebook.net"), [], "pixel stays out after rejection");

  const analyticsOnly = await bootTag([GA4, PIXEL]);
  analyticsOnly.aqua.consent.set({ preferences: false, analytics: true, marketing: false });
  await analyticsOnly.settle();
  assert.equal(analyticsOnly.injectedFrom("googletagmanager.com").length, 1, "analytics tool fires");
  assert.deepEqual(analyticsOnly.injectedFrom("connect.facebook.net"), [], "marketing tool still held");
  assert.equal(analyticsOnly.window.fbq, undefined, "no fbq shim without marketing consent");

  // …and granting marketing later releases exactly that one.
  analyticsOnly.aqua.consent.set({ preferences: false, analytics: true, marketing: true });
  await analyticsOnly.settle();
  assert.equal(analyticsOnly.injectedFrom("connect.facebook.net").length, 1, "pixel fires on marketing opt-in");
  assert.equal(analyticsOnly.injectedFrom("googletagmanager.com").length, 1, "analytics tool is not re-injected (idempotent)");
});

// --- 3. `necessary` still fires immediately (the gate isn't a blanket block) -
test("a necessary injection fires with no consent choice at all", async () => {
  const tag = await bootTag([GSC, GA4]);
  const metas = tag.appended.filter(el => el.tag === "meta");
  assert.equal(metas.length, 1, "the necessary GSC verification meta is written immediately");
  assert.equal(metas[0]!.attrs.name, "google-site-verification");
  assert.equal(metas[0]!.attrs.content, "token-abc");
  assert.deepEqual(tag.injectedFrom("googletagmanager.com"), [], "…while the analytics tool is still held");
});

// --- 4. FAIL-CLOSED: unlabelled / unknown categories are held, not defaulted -
test("an injection with no (or an unknown) consent category is never injected", async () => {
  const tag = await bootTag([
    { kind: "ga4", value: "G-NOCATEGRY" },                              // category missing
    { kind: "ga4", value: "G-BOGUSCAT1", consentCategory: "tracking" },  // unknown category
    { kind: "ga4", value: "G-EMPTYCAT1", consentCategory: "" },          // empty category
  ]);

  assert.deepEqual(tag.injectedFrom("googletagmanager.com"), [], "unlabelled tools are held, not treated as necessary");

  // Even full consent must not release them — the category is unknown, so the
  // visitor has never consented to whatever it is.
  tag.aqua.consent.set({ preferences: true, analytics: true, marketing: true });
  await tag.settle();
  assert.deepEqual(
    tag.injectedFrom("googletagmanager.com"),
    [],
    "an unknown consent category is held even under full consent (fail-closed)",
  );
});

// --- 5. Source guardrail — pin the fail-closed shape against regression -----
test("runInjections has no fail-open category default", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/integrations/aquaTagSource.ts", "utf8");
  assert.match(src, /if \(!permitted\(item\.consentCategory\)\) continue;/);
  assert.doesNotMatch(
    src,
    /permitted\(item\.consentCategory \|\| /,
    "a `|| \"necessary\"` default would make an unlabelled tool fail OPEN",
  );
});
