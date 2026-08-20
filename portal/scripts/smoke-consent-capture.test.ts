import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { AQUA_TAG_SOURCE } from "../src/lib/integrations/aquaTagSource";

test("Aqua Tag sends only consented, non-personal telemetry", async () => {
  const storage = new Map<string, string>();
  const windowListeners = new Map<string, Array<(event: unknown) => void>>();
  const documentListeners = new Map<string, Array<(event: unknown) => void>>();
  const beacons: Blob[] = [];

  class FakeCustomEvent {
    constructor(public type: string, public init: { detail?: unknown } = {}) {}
    get detail() { return this.init.detail; }
  }
  class FakeForm {
    dataset = { aquaForm: "Private enquiry" };
    id = "private-form";
    getAttribute() { return null; }
  }
  class FakeElement {}

  const on = (map: Map<string, Array<(event: unknown) => void>>, type: string, callback: (event: unknown) => void) => {
    map.set(type, [...(map.get(type) ?? []), callback]);
  };
  const window = {
    __aquaTagLoaded: false,
    addEventListener: (type: string, callback: (event: unknown) => void) => on(windowListeners, type, callback),
    dispatchEvent: (event: FakeCustomEvent) => {
      for (const callback of windowListeners.get(event.type) ?? []) callback(event);
      return true;
    },
  } as Record<string, unknown>;
  const document = {
    currentScript: {
      src: "https://aqua-crm.com/aqua-tag.js",
      dataset: { siteKey: "aqua_public_aquacrm_v1", property: "aquacrm" },
    },
    title: "AquaCRM",
    referrer: "https://search.example/results?private=yes",
    readyState: "loading",
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { appendChild() {} },
    querySelectorAll: () => [],
    addEventListener: (type: string, callback: (event: unknown) => void) => on(documentListeners, type, callback),
  };
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const sessionStorage = {
    getItem: (key: string) => storage.get(`session:${key}`) ?? null,
    setItem: (key: string, value: string) => storage.set(`session:${key}`, value),
  };

  vm.runInNewContext(AQUA_TAG_SOURCE, {
    window,
    document,
    localStorage,
    sessionStorage,
    location: { origin: "https://aqua-crm.com", href: "https://aqua-crm.com/contact?email=private@example.com#secret", pathname: "/contact", protocol: "https:" },
    navigator: { sendBeacon: (_url: string, blob: Blob) => { beacons.push(blob); return true; } },
    performance: { getEntriesByType: () => [] },
    history: { pushState() {}, replaceState() {} },
    crypto: webcrypto,
    Blob,
    URL,
    JSON,
    Math,
    Date,
    Object,
    Boolean,
    String,
    Set,
    CustomEvent: FakeCustomEvent,
    HTMLFormElement: FakeForm,
    Element: FakeElement,
    queueMicrotask,
  });

  const aqua = window.Aqua as {
    track(type: string, data?: Record<string, unknown>, options?: { category?: string }): boolean;
    consent: { set(value: Record<string, boolean>): boolean };
  };
  const form = new FakeForm();
  for (const callback of documentListeners.get("submit") ?? []) callback({ target: form });
  assert.equal(beacons.length, 0, "nothing is sent before a privacy choice");

  aqua.consent.set({ preferences: false, analytics: false, marketing: false });
  assert.equal(beacons.length, 1, "the necessary consent audit is recorded");
  for (const callback of documentListeners.get("submit") ?? []) callback({ target: form });
  assert.equal(beacons.length, 1, "form analytics stays blocked after rejection");
  assert.equal(aqua.track("conversion", {}, { category: "marketing" }), false);

  aqua.consent.set({ preferences: false, analytics: true, marketing: false });
  for (const callback of documentListeners.get("submit") ?? []) callback({ target: form });
  assert.equal(aqua.track("conversion", {}, { category: "marketing" }), false);
  aqua.track("error", {
    message: "Contact private@example.com or +44 7700 900123 at https://aqua-crm.com/problem?token=secret",
    email: "must-not-leave-browser@example.com",
    siteKey: "cannot-override",
    consentAnalytics: false,
  });

  const payloads = await Promise.all(beacons.map(async blob => JSON.parse(await blob.text()) as Record<string, unknown>));
  const formPayload = payloads.find(payload => payload.type === "form");
  const errorPayload = payloads.find(payload => payload.type === "error");
  assert.equal(formPayload?.formName, "Private enquiry");
  assert.equal(Object.hasOwn(formPayload ?? {}, "email"), false, "form values are never captured");
  assert.equal(errorPayload?.siteKey, "aqua_public_aquacrm_v1", "protected fields cannot be overridden");
  assert.equal(errorPayload?.consentAnalytics, true, "saved consent remains authoritative");
  assert.equal(Object.hasOwn(errorPayload ?? {}, "email"), false, "unknown personal fields are dropped");
  assert.equal(errorPayload?.message, "Contact [email removed] or [phone removed] at https://aqua-crm.com/problem");
  assert.equal(errorPayload?.url, "https://aqua-crm.com/contact");
  assert.equal(errorPayload?.referrer, "https://search.example/results");
});
