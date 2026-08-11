import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createAutomationWorkflow,
  listAutomationRuns,
  processAutomationSweep,
  runAutomationWorkflow,
  updateAutomationWorkflow,
  validateAutomationGraph,
} from "../src/server/automations";
import { createCustomAI, deleteCustomAI, listCustomAIs, updateCustomAI } from "../src/server/customAIs";
import { getState, mutate } from "../src/server/storage";
import type { AutomationWorkflowNode } from "../src/server/types";

function automationNode(id: string, kind: AutomationWorkflowNode["kind"], config: AutomationWorkflowNode["config"]): AutomationWorkflowNode {
  return { id, kind, position: { x: 0, y: 0 }, config };
}

function cleanup(agencyId: string) {
  mutate(state => {
    for (const [id, workflow] of Object.entries(state.automationWorkflows)) if (workflow.agencyId === agencyId) delete state.automationWorkflows[id];
    for (const [id, run] of Object.entries(state.automationRuns)) if (run.agencyId === agencyId) delete state.automationRuns[id];
    for (const [id, task] of Object.entries(state.tasks)) if (task.agencyId === agencyId) delete state.tasks[id];
    for (const [id, record] of Object.entries(state.customAIs)) if (record.agencyId === agencyId) delete state.customAIs[id];
    state.activity = state.activity.filter(entry => entry.agencyId !== agencyId);
    delete state.agencies[agencyId];
  });
}

test("automation engine branches, creates real tasks, and records complete runs", async () => {
  const agencyId = `agency_automation_test_${Date.now()}`;
  const actor = "automation-test-owner";
  mutate(state => {
    state.agencies[agencyId] = { id: agencyId, name: "Automation Test", slug: agencyId, ownerEmail: "owner@example.test", status: "active", brand: { primaryColor: "#087f8c" }, createdAt: Date.now(), updatedAt: Date.now() };
  });
  try {
    const workflow = createAutomationWorkflow(agencyId, {
      name: "Qualified manual request",
      status: "active",
      nodes: [
        automationNode("trigger", "trigger", { label: "Manual", triggerType: "manual" }),
        automationNode("condition", "condition", { label: "Qualified?", conditionType: "event-field", field: "qualified", operator: "equals", value: "true" }),
        automationNode("task", "action", { label: "Create task", actionType: "create-task", taskTitle: "Call {{event.name}}", message: "Created from {{workflow.name}}", taskPriority: "high", dueInMinutes: 30 }),
      ],
      edges: [
        { id: "one", source: "trigger", target: "condition" },
        { id: "two", source: "condition", sourceHandle: "yes", target: "task" },
      ],
    }, actor);

    const run = await runAutomationWorkflow(agencyId, workflow.id, "live", actor, { qualified: true, name: "Aqua lead" });
    assert.equal(run.status, "succeeded");
    assert.equal(Object.values(getState().tasks).some(task => task.agencyId === agencyId && task.title === "Call Aqua lead"), true);
    assert.equal(run.logs.some(log => log.message.includes("Created task")), true);
    assert.equal(listAutomationRuns(agencyId).length, 1);

    const skippedPath = await runAutomationWorkflow(agencyId, workflow.id, "live", actor, { qualified: false, name: "Not ready" });
    assert.equal(skippedPath.status, "succeeded");
    assert.equal(Object.values(getState().tasks).some(task => task.agencyId === agencyId && task.title === "Call Not ready"), false);
  } finally {
    cleanup(agencyId);
  }
});

test("delayed runs resume once and dry-run email actions never send", async () => {
  const agencyId = `agency_automation_delay_${Date.now()}`;
  const actor = "automation-test-owner";
  mutate(state => {
    state.agencies[agencyId] = { id: agencyId, name: "Automation Delay Test", slug: agencyId, ownerEmail: "owner@example.test", status: "active", brand: { primaryColor: "#087f8c" }, createdAt: Date.now(), updatedAt: Date.now() };
  });
  try {
    const workflow = createAutomationWorkflow(agencyId, {
      name: "Delayed reminder",
      status: "active",
      nodes: [
        automationNode("trigger", "trigger", { label: "Manual", triggerType: "manual" }),
        automationNode("wait", "delay", { label: "Wait", delayMinutes: 15 }),
        automationNode("task", "action", { label: "Create reminder", actionType: "create-task", taskTitle: "Reply to {{event.name}}", message: "Reply now." }),
      ],
      edges: [{ id: "one", source: "trigger", target: "wait" }, { id: "two", source: "wait", target: "task" }],
    }, actor);
    const waiting = await runAutomationWorkflow(agencyId, workflow.id, "live", actor, { name: "Waiting lead" });
    assert.equal(waiting.status, "waiting");
    assert.ok(waiting.waitUntil && waiting.waitUntil > Date.now());

    mutate(state => { state.automationRuns[waiting.id].waitUntil = Date.now() - 1; });
    const stats = await processAutomationSweep(agencyId);
    assert.equal(stats.resumed, 1);
    assert.equal(getState().automationRuns[waiting.id].status, "succeeded");

    const emailWorkflow = createAutomationWorkflow(agencyId, {
      name: "Email dry run",
      nodes: [automationNode("trigger", "trigger", { label: "Manual", triggerType: "manual" }), automationNode("email", "action", { label: "Email owner", actionType: "send-email", recipient: "{{owner.email}}", subject: "Reminder for {{event.name}}", message: "Reply now." })],
      edges: [{ id: "email-edge", source: "trigger", target: "email" }],
    }, actor);
    const dryRun = await runAutomationWorkflow(agencyId, emailWorkflow.id, "test", actor, { name: "Dry run lead" });
    assert.equal(dryRun.status, "succeeded");
    assert.equal(dryRun.logs.some(log => log.message.includes("Would send")), true);
  } finally {
    cleanup(agencyId);
  }
});

test("active graphs reject loops and the custom AI registry stays tenant scoped", () => {
  const agencyId = `agency_automation_ai_${Date.now()}`;
  const actor = "automation-test-owner";
  try {
    const cyclicNodes = [
      automationNode("trigger", "trigger", { label: "Manual", triggerType: "manual" }),
      automationNode("task", "action", { label: "Task", actionType: "create-task" }),
    ];
    const errors = validateAutomationGraph({ nodes: cyclicNodes, edges: [{ id: "one", source: "trigger", target: "task" }, { id: "two", source: "task", target: "trigger" }] });
    assert.equal(errors.some(error => error.includes("loops")), true);

    const draft = createAutomationWorkflow(agencyId, { name: "Draft loop", nodes: cyclicNodes, edges: [{ id: "one", source: "trigger", target: "task" }, { id: "two", source: "task", target: "trigger" }] }, actor);
    assert.throws(() => updateAutomationWorkflow(agencyId, draft.id, { status: "active" }, actor), /loops/);

    const record = createCustomAI(agencyId, { name: "Proposal assistant", workspaceUrl: "https://example.com/workspace", docsUrl: "https://example.com/docs", status: "active", capabilities: ["Proposals", "Proposals", "Research"] }, actor);
    assert.equal(record.capabilities.length, 2);
    assert.equal(listCustomAIs(agencyId).length, 1);
    assert.equal(listCustomAIs("another-agency").length, 0);
    const updated = updateCustomAI(agencyId, record.id, { notes: "Owner reviews every output." }, actor);
    assert.equal(updated?.notes, "Owner reviews every output.");
    assert.throws(() => createCustomAI(agencyId, { name: "Unsafe", workspaceUrl: "javascript:alert(1)" }, actor), /valid http/);
    assert.equal(deleteCustomAI(agencyId, record.id, actor), true);
  } finally {
    cleanup(agencyId);
  }
});

test("automation control centre is mounted with real integrations and navigation", () => {
  const workspace = readFileSync("src/app/portal/agency/automations/_AutomationsWorkspace.tsx", "utf8");
  const page = readFileSync("src/app/portal/agency/automations/page.tsx", "utf8");
  const data = readFileSync("src/app/portal/agency/automations/_automationWorkspaceData.ts", "utf8");
  const marketing = readFileSync("src/app/portal/agency/marketing/page.tsx", "utf8");
  const route = readFileSync("src/app/api/portal/automations/route.ts", "utf8");
  const enquiry = readFileSync("src/app/api/public/brand-enquiry/route.ts", "utf8");
  const sweep = readFileSync("src/app/api/internal/sweep/route.ts", "utf8");
  const sidebar = readFileSync("src/lib/chrome/sidebarLayout.ts", "utf8");

  assert.match(workspace, /<ReactFlow/);
  assert.match(workspace, /Unanswered enquiry reminder/);
  assert.match(workspace, /Custom AI registry/);
  assert.match(workspace, /Run history/);
  assert.match(page, /redirect\("\/portal\/agency\/marketing\?view=automations"\)/);
  assert.match(data, /processAutomationSweep/);
  assert.match(marketing, /<AutomationsWorkspace \{\.\.\.automationData\} embedded/);
  assert.match(marketing, />Automations<\/MarketingTab>/);
  assert.match(route, /runAutomationWorkflow/);
  assert.match(enquiry, /website-enquiry\.received/);
  assert.match(sweep, /processAutomationSweep/);
  assert.doesNotMatch(sidebar, /id: "automations", label: "Automations"/);
});
