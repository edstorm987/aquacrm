import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RESOLUTION_FOCUS_PARAM,
  RESOLUTION_PARAM,
  isResolutionFocus,
  resolutionCopy,
  withResolutionContext,
} from "../src/lib/inbox/resolutionContext";

// Pressing Resolve navigates away from the alert that explains itself. The
// destination must be able to say what you came to do and point at the
// control that does it, or you arrive with no memory of why.

describe("resolution context survives the navigation", () => {
  it("carries the alert id and focus in the URL, not in memory", () => {
    // Must survive a full page load, a refresh, a bookmark and a shared link.
    const href = withResolutionContext("/portal/agency/contacts/per_1", {
      alertId: "enquiry-classification:abc",
      focus: "classification",
    });
    const url = new URL(href, "https://aquacrm.local");
    assert.equal(url.pathname, "/portal/agency/contacts/per_1");
    assert.equal(url.searchParams.get(RESOLUTION_PARAM), "enquiry-classification:abc");
    assert.equal(url.searchParams.get(RESOLUTION_FOCUS_PARAM), "classification");
  });

  it("preserves query parameters already on the destination", () => {
    const href = withResolutionContext("/portal/clients/cli_1?tab=finance", {
      alertId: "invoice:1",
    });
    const url = new URL(href, "https://aquacrm.local");
    assert.equal(url.searchParams.get("tab"), "finance");
    assert.equal(url.searchParams.get(RESOLUTION_PARAM), "invoice:1");
  });

  it("omits focus when there is nothing specific to point at", () => {
    const href = withResolutionContext("/portal/agency/actions", { alertId: "task:1" });
    assert.equal(new URL(href, "https://aquacrm.local").searchParams.has(RESOLUTION_FOCUS_PARAM), false);
  });

  it("rejects a focus value it cannot act on", () => {
    // A junk value must not produce a highlight pointing nowhere.
    assert.equal(isResolutionFocus("classification"), true);
    assert.equal(isResolutionFocus("company"), true);
    assert.equal(isResolutionFocus("nonsense"), false);
    assert.equal(isResolutionFocus(undefined), false);
  });
});

describe("the announcement bar says what you came to do", () => {
  it("names the task and the person", () => {
    const copy = resolutionCopy("classification", "Edward Miles Hallam");
    assert.match(copy.task, /Set the relationship/);
    assert.match(copy.task, /Edward Miles Hallam/);
    assert.match(copy.hint, /highlighted below/);
  });

  it("works without a subject", () => {
    assert.equal(resolutionCopy("classification").task.includes("undefined"), false);
  });

  it("still says something useful for an unknown focus", () => {
    const copy = resolutionCopy(undefined);
    assert.ok(copy.task.length > 0);
    assert.ok(copy.hint.length > 0);
  });

  it("distinguishes the company question from the classification one", () => {
    assert.notEqual(resolutionCopy("company").task, resolutionCopy("classification").task);
  });
});
