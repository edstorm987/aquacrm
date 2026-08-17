import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveAttentionAction } from "../src/lib/inbox/attentionResolution";

test("attention resolution sends each issue to its authoritative workspace", () => {
  assert.deepEqual(resolveAttentionAction(alert("support", "/portal/agency/inbox?view=support&thread=req_1")), {
    destination: "the support conversation",
    action: "Reply, record the outcome, or close the request.",
    opensInboxThread: true,
  });
  assert.equal(resolveAttentionAction(alert("money", "/portal/clients/cli_1?tab=finance")).destination, "this client's finance workspace");
  assert.equal(resolveAttentionAction(alert("development", "/portal/clients/cli_1?tab=systems")).destination, "the affected delivery system");
  assert.equal(resolveAttentionAction(alert("task", "/portal/agency/actions#task-task_1")).destination, "the exact task");
});

test("Needs Attention exposes visible resolve, reminder, and dismissal controls", () => {
  const inbox = readFileSync("src/app/portal/agency/inbox/_MasterInbox.tsx", "utf8");
  const alerts = readFileSync("src/lib/server/operationalAlerts.ts", "utf8");
  const actions = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  assert.match(inbox, />Resolve</);
  assert.match(inbox, /Remind later/);
  assert.match(inbox, />Dismiss</);
  assert.match(inbox, /The signal clears automatically once the underlying evidence is healthy/);
  assert.match(alerts, /actions#task-/);
  assert.match(alerts, /pipelines\/leads\?lead=/);
  assert.match(actions, /id=\{`task-\$\{task\.id\}`\}/);
  assert.match(actions, /promoteLinkedTask\(protectedWindow, linkedTaskId\)/);
  assert.match(actions, /setLinkedTaskId\(taskId\)/);
});

function alert(category: "support" | "money" | "development" | "task", href: string) {
  return { id: "alert_1", severity: "warning" as const, category, title: "Example", detail: "Example detail", href, occurredAt: Date.now() };
}
