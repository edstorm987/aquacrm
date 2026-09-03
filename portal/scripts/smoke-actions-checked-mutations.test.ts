import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CheckedMutationError, checkedJsonMutation } from "../src/lib/client/checkedMutation";
import {
  isAttentionCompletionResult,
  alertOccurrenceKey,
  isAlertActionResult,
  isTaskDeleteResult,
  isTaskMutationResult,
} from "../src/lib/client/actionsMutationTruth";

const response = (body: unknown, status = 200): typeof fetch => async () => Response.json(body, { status });

test("Actions validators require authoritative operation identity and complete payloads", () => {
  const task = (id: string, status = "todo") => ({ id, title: "Task", status, createdAt: 1, updatedAt: 2, revision: 0 });
  assert.equal(isTaskDeleteResult({ ok: true, taskId: "task_a", operationId: "op", tasks: [task("task_b")] }, "task_a"), true);
  assert.equal(isTaskDeleteResult({ ok: true, taskId: "task_b" }, "task_a"), false);
  assert.equal(isTaskDeleteResult({ ok: false }, "task_a"), false);
  assert.equal(isTaskMutationResult({ ok: true, task: task("task_a"), tasks: [task("task_a")] }, "task_a"), true);
  assert.equal(isTaskMutationResult({ ok: true, task: { id: "task_b" } }, "task_a"), false);
  const completed = { id: "done_a", agencyId: "agency_a", sourceId: "alert_a", title: "Done", outcome: "resolved", completedAt: 3 };
  assert.equal(isAttentionCompletionResult({ ok: true, replayed: false, entry: completed, completed: [completed] }, "alert_a"), true);
  assert.equal(isAttentionCompletionResult({ ok: true, replayed: false, entry: { ...completed, outcome: "dismissed" }, completed: [{ ...completed, outcome: "dismissed" }] }, "alert_a"), false);
  assert.equal(isAttentionCompletionResult({ ok: true, entry: completed, completed: [completed] }, "alert_a"), false);
  assert.equal(isAttentionCompletionResult({ ok: true, replayed: false, entry: completed, completed: [] }, "alert_a"), false);
  assert.equal(isAttentionCompletionResult({ ok: true, replayed: false, entry: completed, completed: [completed] }, "alert_b"), false);
  const alert = { id: "alert_a", title: "Alert", detail: "Detail", href: "/x", state: "read", attention: false, category: "task", severity: "warning", occurredAt: 1, causalVersion: 1 };
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "read", replayed: false, alerts: [alert] }, { operationId: "op", alertId: "alert_a", action: "read", expectedVersion: 0 }), true);
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "read", replayed: false, alerts: [{ ...alert, causalVersion: 2 }] }, { operationId: "op", alertId: "alert_a", action: "read", expectedVersion: 0 }), false);
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "park", replayed: false, alerts: [{ ...alert, state: "parked", parkedUntil: 200 }] }, { operationId: "op", alertId: "alert_a", action: "park", expectedVersion: 0, parkedUntil: 100 }), false);
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "read", alerts: [alert] }, { operationId: "op", alertId: "alert_a", action: "read" }), false);
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "read", replayed: false, alerts: [] }, { operationId: "op", alertId: "alert_a", action: "read" }), false);
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "read", replayed: true, alerts: [{ ...alert, state: "parked", attention: false }] }, { operationId: "op", alertId: "alert_a", action: "read" }), true);
  assert.equal(isAlertActionResult({ ok: true, operationId: "op", alertId: "alert_a", action: "dismiss", replayed: true, alerts: [{ ...alert, state: "unread", attention: true }] }, { operationId: "op", alertId: "alert_a", action: "dismiss" }), true);
});

test("task completion contract binds a monotonic revision and rejects stale or incomplete success", () => {
  const task = { id: "task_a", title: "Task", status: "done", createdAt: 100, updatedAt: 100, revision: 8 };
  const operationId = "task-complete:task_a:7";
  assert.equal(isTaskMutationResult({ ok: true, task, tasks: [task], operationId, replayed: true }, "task_a", { status: "done", operationId, expectedRevision: 7 }), true);
  assert.equal(isTaskMutationResult({ ok: true, task: { ...task, status: "todo" }, tasks: [{ ...task, status: "todo" }], operationId, replayed: true }, "task_a", { status: "done", operationId, expectedRevision: 7 }), false);
  assert.equal(isTaskMutationResult({ ok: true, task: { ...task, revision: 9 }, tasks: [{ ...task, revision: 9 }], operationId, replayed: true }, "task_a", { status: "done", operationId, expectedRevision: 7 }), false);
  assert.equal(isTaskMutationResult({ ok: true, task: { ...task, revision: undefined }, tasks: [{ ...task, revision: undefined }], operationId, replayed: true }, "task_a", { status: "done", operationId, expectedRevision: 7 }), false);
  assert.equal(isTaskMutationResult({ ok: true, task, tasks: [task] }, "task_a", { status: "done", operationId, expectedRevision: 7 }), false);
  assert.equal(isTaskMutationResult({ ok: true, task }, "task_a"), false);
  assert.equal(isTaskMutationResult({ ok: true, task, tasks: [task, { id: "legacy", title: "Legacy", status: "todo", createdAt: 1, updatedAt: 1 }] }, "task_a"), true);
});

test("checked Actions mutations reject failure and malformed 2xx without granting UI success", async () => {
  for (const fetcher of [
    async () => { throw new TypeError("offline"); },
    async () => new Response("not json", { status: 200 }),
    response({ ok: false, error: "refused" }),
    response({ ok: true, task: { id: "wrong" } }),
  ] satisfies Array<typeof fetch>) {
    await assert.rejects(
      checkedJsonMutation("/api/portal/tasks", { method: "PATCH" }, {
        fallback: "save failed",
        fetcher,
        validate: payload => isTaskMutationResult(payload, "task_a"),
      }),
      CheckedMutationError,
    );
  }
});

test("mounted Actions keeps failed deletes and partial completions visible with retry reconciliation", () => {
  const source = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  const patchSlice = source.slice(source.indexOf("async function patchTask"), source.indexOf("async function deleteTask"));
  assert.ok(patchSlice.indexOf("beginTaskMutation") < patchSlice.indexOf("checkedJsonMutation"));
  assert.match(patchSlice, /finally[\s\S]{0,100}?finishTaskMutation\(id\)/);
  const deleteSlice = source.slice(source.indexOf("async function deleteTask"), source.indexOf("async function requestAdvisorReview"));
  assert.ok(deleteSlice.indexOf("beginTaskMutation") < deleteSlice.indexOf("checkedJsonMutation"));
  assert.match(deleteSlice, /checkedJsonMutation/);
  assert.match(deleteSlice, /setTasks\(result\.tasks as AgencyTask\[\]\)/);
  assert.ok(deleteSlice.indexOf("checkedJsonMutation") < deleteSlice.indexOf("setTasks(result.tasks"));
  assert.match(deleteSlice, /setTaskError\(mutationErrorMessage/);

  const completionSlice = source.slice(source.indexOf("async function markAttentionDone"), source.indexOf("async function postponeTask"));
  assert.match(completionSlice, /alertDoneOperationId\(alertId, occurrenceKey, dismissAlert, expectedVersion\)/);
  assert.match(completionSlice, /action\.alertOccurrenceKey\s*\?\?/);
  assert.match(completionSlice, /expectedOccurrenceKey/);
  assert.match(completionSlice, /isAttentionCompletionResult/);
  assert.doesNotMatch(completionSlice, /updateAlert\(alertId, "dismiss"\)/);
  assert.ok(completionSlice.indexOf("checkedJsonMutation") < completionSlice.indexOf("setCrmIntake(current => current.filter"));
  assert.match(source, /acceptanceError \? <p role="alert"/);
  const alertMutationSlice = source.slice(source.indexOf("async function handleAttentionAction"), source.indexOf("async function markAttentionDone"));
  assert.match(alertMutationSlice, /updateAlert\(alertId, kind, until, \{/);
  assert.match(alertMutationSlice, /occurrenceKey,/);
  assert.match(alertMutationSlice, /causalVersion: action\.causalVersion \?\? 0/);
  assert.match(alertMutationSlice, /finally[\s\S]{0,120}?finishAttentionMutation\(alertId\)/);
  assert.match(source, /busy=\{busyTaskIds\.has\((?:task|item)\.id\)\}/);
  assert.match(source, /busy && !deleting \? "Saving…" : "Save changes"/);
  const calendarCompletionSlice = source.slice(source.indexOf("async function completeItem"), source.indexOf("return <section", source.indexOf("async function completeItem")));
  assert.ok(calendarCompletionSlice.indexOf("completingItemIds.current.has(item.id)") < calendarCompletionSlice.indexOf("checkedJsonMutation"));
  assert.match(calendarCompletionSlice, /onTasksChange\(result\.tasks as AgencyTask\[\]\)/);
  assert.match(calendarCompletionSlice, /finally[\s\S]{0,180}?completingItemIds\.current\.delete\(item\.id\)/);
  assert.match(source, /busy=\{busyCompletionIds\.has\((?:task|entry)\.id\)\}/);
  assert.match(source, /aria-busy=\{busy\}[\s\S]{0,300}?LoaderCircle/);
  assert.equal(
    (source.match(/<AttentionControls[\s\S]{0,260}?busy=\{accepting\}/g) ?? []).length,
    2,
    "Accept and attention mutations must be mutually exclusive on both inbox card variants",
  );

  const taskRoute = readFileSync("src/app/api/portal/tasks/route.ts", "utf8");
  // The ownership and both client-association checks moved INSIDE the transaction on
  // 2026-09-03, so the completion record sits further from the lock than before.
  assert.match(taskRoute, /withPortalStateTransaction[\s\S]{0,3200}?recordCompletedAction/);
  assert.match(taskRoute, /matchingActionReceipt/);
  assert.match(taskRoute, /taskId: id, operationId, replayed:/);
  const completedRoute = readFileSync("src/app/api/portal/attention/completed/route.ts", "utf8");
  assert.match(completedRoute, /withPortalStateTransaction[\s\S]{0,2800}?recordCompletedAction[\s\S]{0,800}?setOperationalAlertPreference[\s\S]{0,500}?recordActionReceipt/);
  assert.match(completedRoute, /alertOccurrenceKey\(alert\) !== expectedOccurrenceKey/);
  const actionsPage = readFileSync("src/app/portal/agency/actions/_ActionsPage.tsx", "utf8");
  assert.match(actionsPage, /alertOccurrenceKey:\s*alertOccurrenceKey\(alert\)/);
  const provider = readFileSync("src/components/chrome/NotificationAttentionProvider.tsx", "utf8");
  assert.match(provider, /checkedJsonMutation[\s\S]{0,800}?isAlertActionResult\(result, \{ operationId, alertId, action, expectedVersion, parkedUntil \}\)/);
  assert.match(provider, /if \(!targetAlert && !expectation\) \{[\s\S]{0,120}?await refreshAlerts\(\)/);
  assert.match(provider, /expectation\?\.occurrenceKey \?\? alertOccurrenceKey/);
  const controls = readFileSync("src/components/attention/AttentionControls.tsx", "utf8");
  assert.match(controls, /"Marking done…"/);
  assert.match(controls, /"Dismissing…"/);
  assert.match(controls, /"Saving reminder…"/);
  assert.match(controls, /aria-disabled=\{disabled\}/);
  assert.match(controls, /disabled=\{mutationBusy\}/);
  assert.match(controls, /aria-disabled=\{mutationBusy\}/);
});

test("alert occurrence keys use the durable occurrence timestamp for every alert kind", () => {
  const unavailable = { id: "source-unavailable:website-enquiries", title: "Unavailable", detail: "Retry", href: "/inbox", occurredAt: 1 };
  assert.notEqual(alertOccurrenceKey(unavailable), alertOccurrenceKey({ ...unavailable, occurredAt: 999_999 }));
  assert.notEqual(alertOccurrenceKey(unavailable), alertOccurrenceKey({ ...unavailable, detail: "Different failure" }));
  const normal = { ...unavailable, id: "invoice:one" };
  assert.notEqual(alertOccurrenceKey(normal), alertOccurrenceKey({ ...normal, occurredAt: 2 }));
  assert.notEqual(
    alertOccurrenceKey({ ...normal, title: "a|b", detail: "c" }),
    alertOccurrenceKey({ ...normal, title: "a", detail: "b|c" }),
  );
  assert.notEqual(alertOccurrenceKey(normal), alertOccurrenceKey({ ...normal, severity: "critical" }));
});

test("every mounted task-completion entry point sends the revision-bound checked contract", () => {
  for (const path of [
    "src/app/portal/agency/actions/_ActionsWorkspace.tsx",
    "src/app/portal/agency/_DashboardCommandCenter.tsx",
    "src/app/portal/team/_TeamWorkspace.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /taskCompleteOperationId/);
    assert.match(source, /expectedRevision/);
    assert.match(source, /isTaskMutationResult/);
    assert.match(
      source,
      /(?:onTasksChange|setTaskRows|setTasks)\(result\.tasks(?: as AgencyTask\[\])?\)/,
      `${path} must apply the authoritative task snapshot so recurring successors appear`,
    );
  }
  const route = readFileSync("src/app/api/portal/tasks/route.ts", "utf8");
  assert.match(route, /current\?\.status === "done"[\s\S]{0,180}?already complete/);
  assert.match(route, /current\.revision \?\? 0\) !== expectedRevision/);
});
