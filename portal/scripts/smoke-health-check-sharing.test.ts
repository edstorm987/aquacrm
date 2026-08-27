import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const helperSource = readFileSync("public/health-check/hc-share.js", "utf8");
const pageSource = readFileSync("public/health-check/index.html", "utf8");

interface ShareApi {
  makeResumeUrl(location: { origin: string; pathname: string }, state: unknown, savedAt: string, email?: string): string | null;
  makeEmailDraftUrl(url: string): string;
  copyResultLink(url: string, clipboard?: { writeText(value: string): Promise<void> }): Promise<void>;
}

function shareApi(): ShareApi {
  const window = {} as { HCShare?: ShareApi };
  vm.runInNewContext(helperSource, {
    window,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    escape,
    unescape,
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
  });
  assert.ok(window.HCShare);
  return window.HCShare;
}

test("Health Check share URLs carry the completed state and optional captured email", () => {
  const api = shareApi();
  const state = { step: "results", type: "service", answers: { visibility: { raw: { q1: "yes" } } } };
  const savedAt = "2026-08-26T15:00:00.000Z";
  const url = api.makeResumeUrl({ origin: "https://aqua-crm.com", pathname: "/health-check/index.html" }, state, savedAt, "owner@example.test");
  assert.ok(url);
  const token = new URL(url).searchParams.get("resume");
  assert.ok(token);
  const payload = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as { savedAt: string; hcState: unknown; email: string };
  assert.equal(payload.savedAt, savedAt);
  assert.deepEqual(payload.hcState, state);
  assert.equal(payload.email, "owner@example.test");
});

test("email draft contains the real result URL and clipboard refusal is explicit", async () => {
  const api = shareApi();
  const resultUrl = "https://aqua-crm.com/health-check/index.html?resume=real-state";
  const draft = decodeURIComponent(api.makeEmailDraftUrl(resultUrl));
  assert.match(draft, /expires after seven days/);
  assert.match(draft, /resume=real-state/);
  assert.doesNotMatch(draft, /placeholder/i);

  let copied = "";
  await api.copyResultLink(resultUrl, { writeText: async value => { copied = value; } });
  assert.equal(copied, resultUrl);
  await assert.rejects(api.copyResultLink(resultUrl), /Clipboard access is unavailable/);
});

test("mounted result controls are truthful and offer manual copy after clipboard failure", () => {
  assert.ok(pageSource.indexOf('/health-check/hc-share.js') < pageSource.indexOf('var state ='));
  assert.match(pageSource, />📧 Open email draft</);
  assert.match(pageSource, />🔗 Copy result link</);
  assert.match(pageSource, />📄 Print \/ save as PDF</);
  assert.match(pageSource, /window\.HCShare\.makeResumeUrl\(location, state/);
  assert.match(pageSource, /Clipboard access was blocked\. Copy the selected result link manually\./);
  assert.match(pageSource, /data-hc-share-manual/);
  assert.doesNotMatch(pageSource, /\[results URL placeholder\]/);
});
