import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESOLUTION_RECORD_PARAM, withResolutionContext } from "../src/lib/inbox/resolutionContext";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf-8");

const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");
const inbox = read("src", "app", "portal", "agency", "inbox", "_MasterInbox.tsx");
const page = read("src", "app", "portal", "agency", "actions", "_ActionsPage.tsx");

describe("attention items carry the same controls wherever they appear", () => {
  // Two implementations of the same four buttons drift: one gains a reminder
  // preset, the other keeps a stale tooltip, and the operator learns that "the
  // same" control behaves differently depending on the screen.
  it("Actions uses the shared control component, not a lookalike", () => {
    assert.match(workspace, /AttentionControls/, "Actions must render the shared controls");
  });

  it("both rows offer resolve, remind later and dismiss", () => {
    const controls = read("src", "components", "attention", "AttentionControls.tsx");
    for (const label of ["Resolve", "Remind later", "Dismiss", "Evidence"]) {
      assert.ok(controls.includes(label), `shared controls must offer ${label}`);
    }
  });

  it("parking in Actions goes through the same store as the inbox", () => {
    // Separate stores would let the same alert be live in one place and
    // parked in the other.
    assert.match(workspace, /notificationAttention\?\.updateAlert/);
    assert.match(inbox, /updateAlert/);
  });

  it("only drops a row once the server confirms", () => {
    // Optimistically hiding it makes a failed call look like success, and the
    // item silently returns on the next refresh.
    assert.match(workspace, /if \(ok\) setCrmIntake/);
  });
});

describe("evidence lands on the record, not the list", () => {
  it("carries the record id in the link", () => {
    const href = withResolutionContext("/portal/agency/actions", {
      alertId: "task:task_1",
      focus: "task",
      record: "task_1",
    });
    assert.equal(new URL(href, "https://x.local").searchParams.get(RESOLUTION_RECORD_PARAM), "task_1");
  });

  it("Actions builds evidence links from the alert's own record", () => {
    assert.match(page, /record: alert\.id\.split\(":"\)\.pop\(\)/,
      "the trailing segment of an alert id is the record that tripped it");
  });

  it("rows declare their record id so a link can land on them", () => {
    assert.match(workspace, /data-resolution-record=\{action\.id\}/);
  });

  it("the spotlight prefers the exact record over the section", () => {
    const spotlight = read("src", "components", "attention", "ResolutionSpotlight.tsx");
    // Being shown the row beats being shown the list it is somewhere inside.
    const recordIndex = spotlight.indexOf("data-resolution-record");
    const focusIndex = spotlight.indexOf('data-resolution-focus="${focus}"');
    assert.ok(recordIndex > 0 && recordIndex < focusIndex,
      "the record lookup must be tried before the section lookup");
  });

  it("scrolls a named record to the top, not the centre", () => {
    const spotlight = read("src", "components", "attention", "ResolutionSpotlight.tsx");
    assert.match(spotlight, /block: record \? "start" : "center"/,
      "supporting rows beneath the record should stay visible");
  });
});
