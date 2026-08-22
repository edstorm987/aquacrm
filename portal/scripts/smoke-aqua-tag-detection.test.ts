import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let detection: typeof import("../src/lib/server/integrations/aquaTagDetection");
let safeFetch: typeof import("../src/lib/server/safeSiteFetch");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  detection = await import("../src/lib/server/integrations/aquaTagDetection");
  safeFetch = await import("../src/lib/server/safeSiteFetch");
});

const MASTER = "aqua_masterkey_ABC123";
const tagScript = (key: string) =>
  `<script src="https://portal.aqua.test/aqua-tag.js" data-site-key="${key}" defer></script>`;

describe("counting the forms a tag would capture", () => {
  it("counts an enquiry form (email field) as capturable", () => {
    const html = `<form><input type="email" name="email"><button>Send</button></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 1, capturable: 1 });
  });

  it("counts a phone-number form by field name too", () => {
    const html = `<form><input type="text" name="your-phone"></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 1, capturable: 1 });
  });

  it("does not capture a login form (has a password field)", () => {
    const html = `<form><input type="email" name="email"><input type="password" name="password"></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 1, capturable: 0 });
  });

  it("does not capture a bare search box", () => {
    const html = `<form><input type="search" name="q"></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 1, capturable: 0 });
  });

  it("captures a form the site explicitly marked, even without an email field", () => {
    const html = `<form data-aqua-form="Newsletter"><input type="text" name="name"></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 1, capturable: 1 });
  });

  it("honours data-aqua-ignore to opt a form out", () => {
    const html = `<form data-aqua-ignore><input type="email" name="email"></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 1, capturable: 0 });
  });

  it("counts several forms on one page", () => {
    const html = `
      <form><input type="email" name="email"></form>
      <form><input type="search" name="q"></form>
      <form data-aqua-capture><input name="msg"></form>`;
    assert.deepEqual(detection.scanFormsInHtml(html), { total: 3, capturable: 2 });
  });

  it("returns zeroes for a page with no forms", () => {
    assert.deepEqual(detection.scanFormsInHtml("<p>Just a page</p>"), { total: 0, capturable: 0 });
  });
});

describe("reading the tag off a page", () => {
  it("recognises our master tag and matches the key", () => {
    const html = `<html><head>${tagScript(MASTER)}</head><body><form><input type="email" name="email"></form></body></html>`;
    const analysis = detection.analyzeAquaTagHtml(html, MASTER);
    assert.equal(analysis.tagPresent, true);
    assert.equal(analysis.keyMatches, true);
    assert.equal(analysis.detectedSiteKey, MASTER);
    assert.equal(analysis.forms.capturable, 1);
  });

  it("sees a tag carrying a different key, and refuses to match it", () => {
    const html = `<body>${tagScript("aqua_someone_else")}</body>`;
    const analysis = detection.analyzeAquaTagHtml(html, MASTER);
    assert.equal(analysis.tagPresent, true);
    assert.equal(analysis.keyMatches, false);
    assert.equal(analysis.detectedSiteKey, "aqua_someone_else");
  });

  it("reports no tag on a page that hasn't installed one", () => {
    const html = `<body><script src="https://cdn.example.com/analytics.js"></script></body>`;
    const analysis = detection.analyzeAquaTagHtml(html, MASTER);
    assert.equal(analysis.tagPresent, false);
    assert.equal(analysis.keyMatches, false);
    assert.equal(analysis.detectedSiteKey, undefined);
  });

  it("is stable across repeated reads (global regex is reset)", () => {
    const html = `<body>${tagScript(MASTER)}</body>`;
    assert.equal(detection.analyzeAquaTagHtml(html, MASTER).tagPresent, true);
    assert.equal(detection.analyzeAquaTagHtml(html, MASTER).tagPresent, true);
  });
});

describe("presence is not execution — could a visitor LOAD the script?", () => {
  // The first real client run, 2026-08-21: the snippet was on the live page
  // with the right key, pointing at http://localhost:3032/aqua-tag.js. Every
  // visitor's browser refused the fetch, the tag never executed, and the
  // server-side check still said "verified" because the HTML did carry it.
  // These pin the half that sees the difference.
  const localSnippet = `<script src="http://localhost:3032/aqua-tag.js" data-site-key="${MASTER}" defer></script>`;

  it("records the src the snippet points at", () => {
    const analysis = detection.analyzeAquaTagHtml(`<body>${tagScript(MASTER)}</body>`, MASTER, "https://client.example/");
    assert.equal(analysis.scriptSrc, "https://portal.aqua.test/aqua-tag.js");
  });

  it("a localhost src on a live page is NOT loadable, and the reason names the env fix", () => {
    const analysis = detection.analyzeAquaTagHtml(`<body>${localSnippet}</body>`, MASTER, "https://beast-marks.example/");
    assert.equal(analysis.tagPresent, true);
    assert.equal(analysis.keyMatches, true, "this is exactly the trap: present, key matches, and still dead");
    assert.equal(analysis.scriptSrc, "http://localhost:3032/aqua-tag.js");
    assert.equal(analysis.scriptLoadable?.ok, false);
    assert.match(analysis.scriptLoadable?.reason ?? "", /only exists on the machine that generated it/);
    assert.match(analysis.scriptLoadable?.reason ?? "", /NEXT_PUBLIC_PORTAL_BASE_URL/, "the reason IS the fix — it must name it");
  });

  it("an http script on an https page is blocked as mixed content", () => {
    const html = `<body><script src="http://cdn.aqua-public.example/aqua-tag.js" data-site-key="${MASTER}"></script></body>`;
    const analysis = detection.analyzeAquaTagHtml(html, MASTER, "https://client.example/");
    assert.equal(analysis.scriptLoadable?.ok, false);
    assert.match(analysis.scriptLoadable?.reason ?? "", /mixed content/i);
  });

  it("an https script on a public host is presumed loadable", () => {
    const analysis = detection.analyzeAquaTagHtml(`<body>${tagScript(MASTER)}</body>`, MASTER, "https://client.example/");
    assert.deepEqual(analysis.scriptLoadable, { ok: true });
  });

  it("no tag, no verdict — both fields stay absent rather than guessing", () => {
    const analysis = detection.analyzeAquaTagHtml("<p>Just a page</p>", MASTER, "https://client.example/");
    assert.equal(analysis.scriptSrc, undefined);
    assert.equal(analysis.scriptLoadable, undefined);
  });
});

describe("the fetch stays SSRF-safe", () => {
  it("normalises a bare domain to https", () => {
    assert.equal(safeFetch.normalizeSiteUrl("cedar-dental.com").toString(), "https://cedar-dental.com/");
  });

  it("rejects a non-web scheme", () => {
    assert.throws(() => safeFetch.normalizeSiteUrl("file:///etc/passwd"), /http/);
  });

  it("rejects credentials embedded in the address", () => {
    assert.throws(() => safeFetch.normalizeSiteUrl("https://user:pass@example.com"), /username|password/i);
  });

  it("detect() returns an unreachable result (not a throw) for a reserved host", async () => {
    const result = await detection.detectAquaTag({ rawUrl: "http://localhost:8080", masterSiteKey: MASTER });
    assert.equal(result.reachable, false);
    assert.equal(result.tagPresent, false);
    assert.ok(result.error);
  });

  it("detect() refuses a private IP address", async () => {
    const result = await detection.detectAquaTag({ rawUrl: "http://169.254.169.254/latest/meta-data", masterSiteKey: MASTER });
    assert.equal(result.reachable, false);
    assert.match(result.error ?? "", /private|reserved/i);
  });
});
