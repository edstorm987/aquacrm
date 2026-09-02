import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const today = read("src", "app", "portal", "agency", "actions", "_TodayView.tsx");
const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");

// Phase 2: fuse "Needs attention" with the day actions — ONE glance (the
// Actions Today view) shows attention alerts alongside today/overdue actions,
// while keeping BOTH resolution paths (alert store vs task complete/postpone).

describe("Today receives the needs-attention alerts", () => {
  it("takes a dedicated attention prop, not only tasks + entries", () => {
    // Without a distinct prop the alerts would have to be forced into the task
    // model, losing their own resolution path.
    assert.match(today, /attentionActions\??:\s*GeneratedAction\[\]/);
  });

  it("is passed the alerts from the workspace, filtered to inbox-origin", () => {
    assert.match(workspace, /attentionActions=\{crmIntake\.filter\(action => action\.origin === "inbox"\)\}/);
  });
});

describe("Today renders alerts with their OWN controls", () => {
  it("imports and renders AttentionControls, not a task checkbox, for alerts", () => {
    assert.match(today, /import \{ AttentionControls, type AttentionBusyAction \} from "@\/components\/attention\/AttentionControls"/);
    assert.match(today, /<AttentionControls/);
  });

  it("iterates the attention alerts into rows", () => {
    assert.match(today, /attentionActions\.map\(action =>/);
  });

  it("labels the combined group as needs-attention", () => {
    assert.match(today, /Needs attention/);
  });
});

describe("both resolution paths stay intact", () => {
  it("alerts clear through the operational-alert store (park/dismiss/mark done)", () => {
    // These wire to the same handlers Master Inbox and the Actions queue use,
    // NOT the task Complete/Postpone path.
    assert.match(workspace, /onAttentionAction=\{handleAttentionAction\}/);
    assert.match(workspace, /onMarkAttentionDone=\{markAttentionDone\}/);
    // The alert park/dismiss goes to the operational-alert provider.
    assert.match(workspace, /notificationAttention\?\.updateAlert\(alertId, kind, until, \{/);
    assert.match(workspace, /occurrenceKey,[\s\S]{0,80}causalVersion:/);
  });

  it("tasks still clear their own way (complete / postpone)", () => {
    // The day actions keep the task model — the fusion must not replace it.
    assert.match(workspace, /onComplete=\{task => void completeTask\(task\)\}/);
    assert.match(workspace, /onPostpone=\{\(task, until\) => void postponeTask\(task, until\)\}/);
    assert.match(today, /onComplete\(task\)/);
    assert.match(today, /onPostpone\(task, until\)/);
  });

  it("does not convert an alert into a task to show it in Today", () => {
    // An alert row must never call the task completion handler.
    assert.doesNotMatch(today, /onComplete\(action\)/);
  });
});

describe("the day tasks and diary entries still render", () => {
  it("keeps the today/overdue task list", () => {
    assert.match(today, /due\.map\(task =>/);
    assert.match(today, /carried over/);
  });

  it("keeps the diary entries block", () => {
    assert.match(today, /todaysEntries\.map\(entry =>/);
    assert.match(today, /sameDay\(entry\.startsAt, now\)/);
  });
});

describe("no double count between an alert and its accepted task", () => {
  it("relies on the upstream acceptedSourceIds dedupe (attention:<id>)", () => {
    // _ActionsPage drops any alert already accepted as a task before it ever
    // reaches crmIntake, so the same job cannot show as both an alert and a
    // task in Today.
    const page = read("src", "app", "portal", "agency", "actions", "_ActionsPage.tsx");
    assert.match(page, /acceptedSourceIds\.has\(`attention:\$\{alert\.id\}`\)/);
  });
});
