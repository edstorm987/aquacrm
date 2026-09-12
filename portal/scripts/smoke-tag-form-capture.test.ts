import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

import { AQUA_TAG_SOURCE } from "../src/lib/integrations/aquaTagSource";

/**
 * What the tag does to a real form, run rather than read.
 *
 * This code executes inside the submit handler of somebody else's website, so
 * the questions that matter are behavioural: what does it refuse to touch, and
 * what happens when the page is not shaped the way it expects.
 */

interface FakeField {
  name: string;
  value?: string;
  type?: string;
  tagName?: string;
  id?: string;
  checked?: boolean;
  disabled?: boolean;
  autocomplete?: string;
  selectedOptions?: Array<{ textContent: string; value: string }>;
  multiple?: boolean;
  closest?: (selector: string) => unknown;
  getAttribute?: (name: string) => string | null;
}

function field(input: FakeField): FakeField {
  return {
    type: "text", tagName: "INPUT", value: "", checked: false, disabled: false,
    closest: () => null, getAttribute: () => null,
    ...input,
  };
}

function runTag(form: Record<string, unknown>, options: {
  captureResults?: boolean[];
  receiptIds?: Array<string | null>;
  admissionOk?: boolean;
  admissionId?: string;
  captchaToken?: string;
  onAdmission?: (payload: Record<string, unknown>) => void;
} = {}) {
  const captures: Array<Record<string, unknown>> = [];
  let captureAttempt = 0;
  const documentListeners = new Map<string, Array<(event: unknown) => void>>();
  class FakeCustomEvent { constructor(public type: string, public init: { detail?: unknown } = {}) {} get detail() { return this.init.detail; } }
  class FakeForm {}
  const storage = new Map<string, string>();
  const window = {
    __aquaTagLoaded: false,
    addEventListener: () => {},
    dispatchEvent: () => true,
    turnstile: {
      render: (_element: unknown, config: { action?: string; callback?: (token: string) => void }) => {
        assert.equal(config.action, "aqua-tag-form-capture");
        config.callback?.(options.captchaToken ?? "captcha-proof-token");
        return "widget-form-capture";
      },
      reset: () => {},
    },
  } as Record<string, unknown>;

  vm.runInNewContext(AQUA_TAG_SOURCE, {
    window,
    document: {
      currentScript: { src: "https://aqua-crm.com/aqua-tag.js", dataset: { siteKey: "aqua_public_aquacrm_v1", property: "aquacrm" } },
      title: "AquaCRM", referrer: "", readyState: "complete",
      createElement: () => ({ dataset: {}, textContent: "", setAttribute() {} }),
      head: { appendChild() {} },
      querySelectorAll: (selector: string) => selector === "form" ? [form] : [],
      querySelector: () => null,
      addEventListener: (type: string, callback: (event: unknown) => void) => {
        documentListeners.set(type, [...(documentListeners.get(type) ?? []), callback]);
      },
    },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    sessionStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    location: { origin: "https://aqua-crm.com", href: "https://aqua-crm.com/careers", pathname: "/careers", protocol: "https:" },
    navigator: { sendBeacon: () => true },
    performance: { getEntriesByType: () => [] },
    history: { pushState() {}, replaceState() {} },
    crypto: webcrypto,
    fetch: (url: string, request: { body: string }) => {
      if (String(url).includes("aqua-tag-admission")) {
        const sent = JSON.parse(request.body) as Record<string, unknown>;
        options.onAdmission?.(sent);
        const ok = options.admissionOk ?? true;
        return Promise.resolve({
          ok,
          json: async () => ({
            ok,
            admission: "signed-form-admission",
            submissionId: options.admissionId ?? sent.submissionId,
          }),
        });
      }
      if (String(url).includes("bot-challenge/config")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ enabled: true, required: true, siteKey: "turnstile-public-key" }),
        });
      }
      if (String(url).includes("form-capture")) {
        const sent = JSON.parse(request.body) as Record<string, unknown>;
        captures.push(sent);
        const ok = options.captureResults?.[captureAttempt] ?? true;
        // A real receipt names the submission it persisted. `receiptIds` lets a
        // test answer ok:true for some OTHER id, which the tag must not accept.
        const receiptId = options.receiptIds && captureAttempt < options.receiptIds.length
          ? options.receiptIds[captureAttempt]
          : sent.submissionId;
        captureAttempt += 1;
        return Promise.resolve({ ok, json: async () => ({ ok, submissionId: receiptId }) });
      }
      return Promise.resolve({ ok: true });
    },
    Blob, URL, JSON, Math, Date, Object, Boolean, String, Set, Map, Array, Number,
    CSS: { escape: (value: string) => value },
    CustomEvent: FakeCustomEvent,
    HTMLFormElement: FakeForm,
    Element: class {},
    queueMicrotask,
    setTimeout: (callback: () => void) => { queueMicrotask(callback); return 1; },
  });

  Object.setPrototypeOf(form, FakeForm.prototype);
  const submit = () => {
    for (const callback of documentListeners.get("submit") ?? []) callback({ target: form });
  };
  const afterChallenge = (remaining: number) => queueMicrotask(() => remaining > 0 ? afterChallenge(remaining - 1) : submit());
  afterChallenge(10);
  return captures;
}

async function settle() {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
}

const enquiryForm = (extra: Record<string, unknown> = {}) => ({
  dataset: { aquaForm: "Careers application" },
  id: "careers",
  getAttribute: () => null,
  closest: () => null,
  querySelector: () => null,
  appendChild: () => {},
  elements: [
    field({ name: "name", value: "Tom Innes" }),
    field({ name: "email", type: "email", value: "tom@example.com" }),
    field({ name: "salary", value: "£45,000" }),
  ],
  ...extra,
});

test("captures every answer the form actually collected", async () => {
  // The old path kept a fixed dozen keys and dropped the rest, so "what did
  // they say?" could only be answered on the website's own inbox.
  const captures = runTag(enquiryForm());
  await settle();
  const [capture] = captures;
  assert.ok(capture, "a marked enquiry form was not captured");
  assert.deepEqual((capture.fields as Array<{ key: string }>).map(f => f.key), ["name", "email", "salary"]);
  assert.equal(capture.formName, "Careers application");
  assert.equal(capture.pagePath, "/careers");
  assert.match(String(capture.submissionId), /^aqua_sub_[a-z0-9]{12,100}$/);
});

test("stamps the same submission id into the host form before its handler runs", async () => {
  let hidden: Record<string, unknown> | null = null;
  const form = enquiryForm({
    querySelector: (selector: string) => selector.includes("aquaSubmissionId") && hidden?.name === "aquaSubmissionId" ? hidden : null,
    appendChild: (input: Record<string, unknown>) => { if (input.name === "aquaSubmissionId") hidden = input; },
  });
  const captures = runTag(form);
  await settle();
  const [capture] = captures;
  assert.ok(hidden, "the capture-phase listener did not add the host form reference");
  assert.equal(hidden?.name, "aquaSubmissionId");
  assert.equal(hidden?.value, capture.submissionId);
});

test("retries a rejected capture with the exact same stable id", async () => {
  const captures = runTag(enquiryForm(), { captureResults: [false, false, true] });
  await settle();
  assert.equal(captures.length, 3);
  assert.equal(new Set(captures.map(capture => capture.submissionId)).size, 1);
});

test("stops retrying only on a receipt that names the id it sent", async () => {
  // ok:true for SOME OTHER submission — a proxy, a cached answer, a mismatched
  // endpoint — is not proof that this submission was persisted. The tag keeps
  // retrying with the same id until a receipt names it, or its attempts run
  // out; it never treats a foreign receipt as success. → issues #87
  const foreign = runTag(enquiryForm(), { receiptIds: ["aqua_sub_someoneelse0000000000", null, "aqua_sub_someoneelse0000000000"] });
  await settle();
  assert.equal(foreign.length, 3, "a foreign or missing receipt id must be retried like a rejection");
  assert.equal(new Set(foreign.map(capture => capture.submissionId)).size, 1);

  const matched = runTag(enquiryForm(), { receiptIds: ["aqua_sub_someoneelse0000000000"] });
  await settle();
  assert.equal(matched.length, 2, "the first receipt named another id; the second named ours and ended the retries");
});

test("a refused or mismatched signed admission never reaches the mutation endpoint", async () => {
  const refused = runTag(enquiryForm(), { admissionOk: false });
  const mismatched = runTag(enquiryForm(), { admissionId: "aqua_sub_someoneelse0000000000" });
  await settle();
  assert.equal(refused.length, 0, "a stale caller bypassed a refused admission");
  assert.equal(mismatched.length, 0, "a foreign admission was attached to this form capture");
});

test("never sends a password, payment or token field", async () => {
  let admission: Record<string, unknown> | null = null;
  const captures = runTag(enquiryForm({
    elements: [
      field({ name: "email", type: "email", value: "tom@example.com" }),
      field({ name: "password", type: "password", value: "hunter2" }),
      field({ name: "csrf_token", type: "hidden", value: "SECRET" }),
      field({ name: "cc-number", autocomplete: "cc-number", value: "4111111111111111" }),
      field({ name: "card_cvv", value: "123" }),
      field({ name: "cf-turnstile-response", value: "must-not-be-captured" }),
    ],
  }), { captchaToken: "managed-proof-only", onAdmission: payload => { admission = payload; } });
  await settle();
  const [capture] = captures;
  const keys = (capture.fields as Array<{ key: string }>).map(f => f.key);
  assert.deepEqual(keys, ["email"], `sensitive fields leaked: ${keys.join(", ")}`);
  assert.equal(admission?.captchaToken, "managed-proof-only", "proof did not reach the admission exchange");
  assert.equal(Object.hasOwn(capture, "captchaToken"), false, "proof leaked from admission into the persisted capture");
  assert.doesNotMatch(JSON.stringify(capture), /managed-proof-only|must-not-be-captured/);
});

test("leaves a login form alone entirely", () => {
  // A login form is not an enquiry, however many email inputs it has.
  const captures = runTag({
    dataset: {}, id: "login", getAttribute: () => null, closest: () => null,
    querySelector: (selector: string) => selector.includes("password") ? {} : null,
    elements: [field({ name: "email", type: "email", value: "admin@example.com" })],
  });
  assert.equal(captures.length, 0);
});

test("leaves an unmarked form with no way to reply alone", () => {
  // Capturing every form on a site would collect far more than anybody
  // consented to hand over.
  const captures = runTag({
    dataset: {}, id: "filter", getAttribute: () => null, closest: () => null,
    querySelector: () => null,
    elements: [field({ name: "sort_by", value: "price" })],
  });
  assert.equal(captures.length, 0);
});

test("honours an explicit opt-out", () => {
  const captures = runTag(enquiryForm({ dataset: { aquaForm: "Careers", aquaIgnore: "" } }));
  assert.equal(captures.length, 0);
});

test("never throws inside the website's own submit", () => {
  // A tag that can take down a client's contact form is worse than no tag.
  // The harness form has none of the DOM helpers the capture reaches for.
  assert.doesNotThrow(() => runTag({ dataset: { aquaForm: "Bare" }, getAttribute: () => null }));
});

test("keeps the whole answer when several inputs share a name", async () => {
  const captures = runTag(enquiryForm({
    elements: [
      field({ name: "email", type: "email", value: "tom@example.com" }),
      field({ name: "services", type: "checkbox", checked: true, value: "Design" }),
      field({ name: "services", type: "checkbox", checked: true, value: "Build" }),
    ],
  }));
  await settle();
  const [capture] = captures;
  const services = (capture.fields as Array<{ key: string; value: string }>).find(f => f.key === "services");
  assert.equal(services?.value, "Design, Build");
});

test("records a checkbox as a readable answer, not 'on'", async () => {
  const captures = runTag(enquiryForm({
    elements: [
      field({ name: "email", type: "email", value: "tom@example.com" }),
      field({ name: "consent", type: "checkbox", checked: true, value: "on" }),
    ],
  }));
  await settle();
  const [capture] = captures;
  const consent = (capture.fields as Array<{ key: string; value: string }>).find(f => f.key === "consent");
  assert.equal(consent?.value, "Yes");
});

test("skips a question nobody answered", async () => {
  const captures = runTag(enquiryForm({
    elements: [
      field({ name: "email", type: "email", value: "tom@example.com" }),
      field({ name: "budget", value: "   " }),
    ],
  }));
  await settle();
  const [capture] = captures;
  assert.equal((capture.fields as Array<{ key: string }>).some(f => f.key === "budget"), false);
});
