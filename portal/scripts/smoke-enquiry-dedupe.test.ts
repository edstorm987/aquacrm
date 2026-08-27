import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enquiryIngestionComplete,
  enquirySubmissionId,
  normaliseAquaSubmissionId,
} from "../src/lib/enquiries/submissionIdentity";

const source = (...p: string[]) => (readFileSync(join(__dirname, "..", ...p), "utf-8") as string)
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a form submission does not become three enquiries", () => {
  const route = () => source("src", "app", "api", "public", "brand-enquiry", "route.ts");

  it("checks for a recent identical enquiry before inserting", () => {
    // A double-submit, a retry, or the Aqua Tag racing the form used to each
    // insert a fresh enquiry (and lead) — the "3x" Ed saw. The guard makes the
    // endpoint idempotent within a short window.
    const src = route();
    const guardAt = src.indexOf("DEDUPE_WINDOW_MS");
    const insertAt = src.indexOf("persistEnquiry(enquiryRow");
    assert.ok(guardAt > 0, "there is no dedupe guard");
    assert.ok(insertAt > 0, "the insert moved — re-point this test");
    assert.ok(guardAt < insertAt, "the guard must run before the insert, not after");
  });

  it("matches on the same brand and the same contact detail", () => {
    const src = route();
    assert.match(src, /\.eq\("brand_slug", brand\)/);
    assert.match(src, /return hasEmail \? recent\.eq\("email", email\) : recent\.eq\("phone", phone\)/);
  });

  it("returns the existing enquiry rather than a new one when it dedupes", () => {
    // Same success shape as a real submission, so the site cannot tell a
    // deduped submit from a first one.
    assert.match(route(), /submissionId: submissionId \|\| existingEnquiry\.id,[\s\S]*deduped: true/);
  });

  it("only dedupes when there is a contact detail to match on", () => {
    // With neither email nor phone there is nothing to match, so it must fall
    // through to the insert rather than merge unrelated submissions.
    assert.match(route(), /if \(hasEmail \|\| hasPhone\) \{/);
  });
});

describe("stable Aqua submission identity", () => {
  it("accepts only the generated public reference shape", () => {
    assert.equal(normaliseAquaSubmissionId(" aqua_sub_0123456789abcdef "), "aqua_sub_0123456789abcdef");
    assert.equal(normaliseAquaSubmissionId("row_123"), "");
    assert.equal(normaliseAquaSubmissionId("aqua_sub_short"), "");
  });

  it("distinguishes an incomplete held capture from completed ingestion", () => {
    const held = { submissionId: "aqua_sub_0123456789abcdef", captureOnly: true };
    const complete = { ...held, ingestionState: "complete", ingestionCompletedAt: "2026-08-25T12:00:00.000Z" };
    assert.equal(enquirySubmissionId(held), "aqua_sub_0123456789abcdef");
    assert.equal(enquiryIngestionComplete(held), false);
    assert.equal(enquiryIngestionComplete(complete), true);
  });
});
