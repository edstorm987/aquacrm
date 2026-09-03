// Checked Actions mutations — authenticated route and recovery behaviour.
//
// The smaller contract tests prove the client validators. This file drives the
// real completed/notification handlers in a genuine Next request scope so the
// state transition, receipt, response and rollback are proved together.

process.env.PORTAL_BACKEND = "memory";
process.env.NODE_ENV = "test";
process.env.PORTAL_SESSION_SECRET = "actions-route-recovery-smoke-secret";

// This import must precede anything from next/. See the helper's load-order
// note: it installs the real AsyncLocalStorage used by next/headers.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

// Inject a failure at the real atomic commit boundary, after the route has
// assembled its completion/preference/receipt working tree but before publish.
// The real storage implementation still performs the rollback; this wrapper
// only supplies the deterministic failure point.
const storageId = require.resolve("../src/server/storage");
const realStorage = require("../src/server/storage") as typeof import("../src/server/storage");
let failNextCommit = false;
require.cache[storageId]!.exports = {
  ...realStorage,
  withAtomicPortalStateMutation<T>(
    operation: () => T | Promise<T>,
    options: { beforeCommit?: () => void | Promise<void> } = {},
  ): Promise<T> {
    return realStorage.withAtomicPortalStateMutation(operation, {
      ...options,
      beforeCommit: async () => {
        await options.beforeCommit?.();
        if (failNextCommit) {
          failNextCommit = false;
          throw new Error("injected_actions_commit_failure");
        }
      },
    });
  },
};

// A controllable pause at the task/client boundary. PATCH must reach this
// while already holding the task transaction: if it reaches here beforehand,
// an owner can reassign the task and the stale staff request can still write.
const clientAssociationId = require.resolve("../src/lib/server/access/clientAssociationElement");
const realClientAssociation = require(clientAssociationId) as typeof import("../src/lib/server/access/clientAssociationElement");
interface ClientAssociationBarrier {
  clientId: string;
  hit: boolean;
  reached: Promise<void>;
  signalReached: () => void;
  release: Promise<void>;
  signalRelease: () => void;
}
let clientAssociationBarrier: ClientAssociationBarrier | null = null;

function createClientAssociationBarrier(clientId: string): ClientAssociationBarrier {
  let signalReached!: () => void;
  let signalRelease!: () => void;
  return {
    clientId,
    hit: false,
    reached: new Promise<void>(resolve => { signalReached = resolve; }),
    signalReached,
    release: new Promise<void>(resolve => { signalRelease = resolve; }),
    signalRelease,
  };
}

require.cache[clientAssociationId]!.exports = {
  ...realClientAssociation,
  async requireClientAssociation(
    ...args: Parameters<typeof realClientAssociation.requireClientAssociation>
  ): Promise<void> {
    const barrier = clientAssociationBarrier;
    if (barrier && !barrier.hit && args[1] === barrier.clientId) {
      barrier.hit = true;
      barrier.signalReached();
      await barrier.release;
    }
    await realClientAssociation.requireClientAssociation(...args);
  },
};

const completedRoute = require("../src/app/api/portal/attention/completed/route") as typeof import("../src/app/api/portal/attention/completed/route");
const notificationRoute = require("../src/app/api/portal/notifications/route") as typeof import("../src/app/api/portal/notifications/route");
const tasksRoute = require("../src/app/api/portal/tasks/route") as typeof import("../src/app/api/portal/tasks/route");
const { NextRequest } = require("next/server") as typeof import("next/server");
const auth = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const tenants = require("../src/server/tenants") as typeof import("../src/server/tenants");
const users = require("../src/server/users") as typeof import("../src/server/users");
const tasks = require("../src/server/tasks") as typeof import("../src/server/tasks");
const people = require("../src/server/people") as typeof import("../src/server/people");
const activity = require("../src/server/activity") as typeof import("../src/server/activity");
const alerts = require("../src/lib/server/inbox/operationalAlerts") as typeof import("../src/lib/server/inbox/operationalAlerts");
const preferences = require("../src/lib/server/inbox/operationalAlertPreferences") as typeof import("../src/lib/server/inbox/operationalAlertPreferences");
const completed = require("../src/server/completedActions") as typeof import("../src/server/completedActions");
const truth = require("../src/lib/client/actionsMutationTruth") as typeof import("../src/lib/client/actionsMutationTruth");

interface Actor {
  id: string;
  token: string;
}

interface World {
  agencyId: string;
  owner: Actor;
  manager: Actor;
  taskId: string;
  alert: Awaited<ReturnType<typeof alerts.listOperationalAlerts>>[number];
}

let sequence = 0;

function actorToken(user: ReturnType<typeof users.createUser>, agencyId: string): string {
  return auth.issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
}

async function seedWorld(): Promise<World> {
  await realStorage.reset();
  sequence += 1;
  const agency = tenants.createAgency({ name: `Actions recovery ${sequence}`, slug: `actions-recovery-${sequence}` });
  const ownerUser = users.createUser({
    email: `actions-owner-${sequence}@example.test`,
    password: "Actions-recovery-1!",
    role: "agency-owner",
    agencyId: agency.id,
  });
  const managerUser = users.createUser({
    email: `actions-manager-${sequence}@example.test`,
    password: "Actions-recovery-1!",
    role: "agency-manager",
    agencyId: agency.id,
  });
  const task = tasks.createAgencyTask({
    agencyId: agency.id,
    title: `Overdue checked action ${sequence}`,
    priority: "high",
    dueAt: Date.now() - 60_000,
    createdBy: ownerUser.id,
  });
  const live = await alerts.listOperationalAlerts(agency.id);
  const alert = live.find(item => item.id === `task:${task.id}`);
  assert.ok(alert, "fixture must produce the persistent task alert used by the real routes");
  return {
    agencyId: agency.id,
    owner: { id: ownerUser.id, token: actorToken(ownerUser, agency.id) },
    manager: { id: managerUser.id, token: actorToken(managerUser, agency.id) },
    taskId: task.id,
    alert,
  };
}

beforeEach(() => {
  failNextCommit = false;
  clientAssociationBarrier = null;
});

function notificationBody(
  alert: World["alert"],
  action: "read" | "unread" | "park" | "dismiss",
  expectedVersion: number,
  parkedUntil?: number,
) {
  const expectedOccurrenceKey = truth.alertOccurrenceKey(alert);
  return {
    alertId: alert.id,
    action,
    expectedVersion,
    expectedOccurrenceKey,
    parkedUntil,
    operationId: truth.alertActionOperationId(alert.id, action, expectedOccurrenceKey, expectedVersion, parkedUntil),
  };
}

function completionBody(alert: World["alert"], expectedVersion = 0) {
  const expectedOccurrenceKey = truth.alertOccurrenceKey(alert);
  return {
    sourceId: alert.id,
    title: alert.title,
    detail: alert.detail,
    dismissAlert: true,
    expectedVersion,
    expectedOccurrenceKey,
    operationId: truth.alertDoneOperationId(alert.id, expectedOccurrenceKey, true, expectedVersion),
  };
}

async function patchNotification(actor: Actor, body: ReturnType<typeof notificationBody>): Promise<Response> {
  return withSession(actor.token, () => notificationRoute.PATCH(new Request("http://localhost/api/portal/notifications", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })));
}

async function postCompletion(actor: Actor, body: ReturnType<typeof completionBody>): Promise<Response> {
  return withSession(actor.token, () => completedRoute.POST(new Request("http://localhost/api/portal/attention/completed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })));
}

async function deleteTask(actor: Actor, taskId: string): Promise<Response> {
  const operationId = truth.taskDeleteOperationId(taskId);
  const request = new NextRequest(`http://localhost/api/portal/tasks?id=${encodeURIComponent(taskId)}&operationId=${encodeURIComponent(operationId)}`, {
    method: "DELETE",
    headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${actor.token}` },
  });
  return withSession(actor.token, () => tasksRoute.DELETE(request));
}

async function patchTask(actor: Actor, body: Record<string, unknown>): Promise<Response> {
  const request = new NextRequest("http://localhost/api/portal/tasks", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${auth.SESSION_COOKIE_NAME}=${actor.token}`,
    },
    body: JSON.stringify(body),
  });
  return withSession(actor.token, () => tasksRoute.PATCH(request));
}

test("Mark Done and Dismiss race through one causal lane for the same actor", async () => {
  const world = await seedWorld();
  const doneBody = completionBody(world.alert);
  const dismissBody = notificationBody(world.alert, "dismiss", 0);
  const settled = await Promise.allSettled([
    postCompletion(world.owner, doneBody),
    patchNotification(world.owner, dismissBody),
  ]);

  assert.equal(settled.filter(result => result.status === "fulfilled" && result.value.status === 200).length, 1);
  assert.equal(settled.filter(result => result.status === "rejected" || result.value.status !== 200).length, 1);
  assert.equal(completed.completionsFor(world.agencyId, world.alert.id).length, 1);
  assert.equal(Object.values(realStorage.getState().actionMutationReceipts).filter(receipt => receipt.targetId === world.alert.id).length, 1);
});

test("lost Mark Done success replays exactly, but cannot erase a later successor", async () => {
  const world = await seedWorld();
  const body = completionBody(world.alert);
  const first = await postCompletion(world.owner, body);
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { entry: { id: string; outcome: string }; replayed: boolean };
  assert.equal(firstPayload.entry.outcome, "resolved");
  assert.equal(firstPayload.replayed, false);

  const afterFirstAlert = (await alerts.listOperationalAlerts(world.agencyId)).find(item => item.id === world.alert.id);
  const afterFirstPreference = preferences.getOperationalAlertPreference(world.agencyId, world.owner.id, world.alert.id);
  assert.ok(afterFirstAlert);
  assert.equal(truth.alertOccurrenceKey(afterFirstAlert), body.expectedOccurrenceKey);
  assert.equal(afterFirstPreference?.occurrenceKey, body.expectedOccurrenceKey);
  assert.equal(afterFirstPreference?.state, "dismissed");
  assert.equal(afterFirstPreference?.causalVersion, 1);

  const replay = await postCompletion(world.owner, body);
  assert.equal(replay.status, 200, "persistent alerts must replay their exact committed dismiss intent");
  const replayPayload = await replay.json() as { entry: { id: string }; replayed: boolean };
  assert.equal(replayPayload.entry.id, firstPayload.entry.id);
  assert.equal(replayPayload.replayed, true);

  const unread = await patchNotification(world.owner, notificationBody(world.alert, "unread", 1));
  assert.equal(unread.status, 200);
  const staleReplay = await postCompletion(world.owner, body);
  assert.equal(staleReplay.status, 409, "an old completion receipt must not clear an unread successor");
  assert.match((await staleReplay.json() as { error: string }).error, /alert has since changed/);
  assert.equal(preferences.getOperationalAlertPreference(world.agencyId, world.owner.id, world.alert.id)?.state, "unread");
});

test("notification replay adopts the authoritative successor rather than restoring an old intent", async () => {
  const world = await seedWorld();
  const dismissed = notificationBody(world.alert, "dismiss", 0);
  assert.equal((await patchNotification(world.owner, dismissed)).status, 200);
  assert.equal((await patchNotification(world.owner, notificationBody(world.alert, "unread", 1))).status, 200);

  const replay = await patchNotification(world.owner, dismissed);
  assert.equal(replay.status, 200);
  const payload = await replay.json() as { replayed?: boolean; alerts?: unknown[] };
  assert.equal(payload.replayed, true);
  assert.equal(truth.isAlertActionResult(payload, {
    operationId: dismissed.operationId,
    alertId: world.alert.id,
    action: "dismiss",
    expectedVersion: 0,
  }), true, "a valid replay snapshot may contain a newer unread successor");
  const successor = (payload.alerts as Array<{ id: string; state: string; causalVersion: number }>).find(item => item.id === world.alert.id);
  assert.deepEqual({ state: successor?.state, causalVersion: successor?.causalVersion }, { state: "unread", causalVersion: 2 });
});

test("a same-time semantic successor rejects an uncommitted stale action", async () => {
  const world = await seedWorld();
  const stale = notificationBody(world.alert, "park", 0, Date.now() + 3_600_000);
  tasks.updateAgencyTask(world.agencyId, world.taskId, { title: "Changed aggregate at the same occurrence time" }, world.owner.id);
  const changed = (await alerts.listOperationalAlerts(world.agencyId)).find(item => item.id === world.alert.id);
  assert.ok(changed);
  assert.equal(changed.occurredAt, world.alert.occurredAt);
  assert.notEqual(truth.alertOccurrenceKey(changed), truth.alertOccurrenceKey(world.alert));

  const response = await patchNotification(world.owner, stale);
  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /alert occurrence has changed/);
  assert.equal(preferences.getOperationalAlertPreference(world.agencyId, world.owner.id, world.alert.id), undefined);
});

test("completion receipt lookup survives more than 200 newer register rows and notices deletion", async () => {
  const world = await seedWorld();
  const body = completionBody(world.alert);
  const first = await postCompletion(world.owner, body);
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { entry: { id: string } };
  const base = Date.now() + 1_000;
  for (let index = 0; index < 205; index += 1) {
    completed.recordCompletedAction(world.agencyId, {
      sourceId: `newer:${index}`,
      title: `Newer completion ${index}`,
      outcome: "resolved",
      completedBy: world.owner.id,
    }, base + index);
  }

  const replay = await postCompletion(world.owner, body);
  assert.equal(replay.status, 200);
  const replayPayload = await replay.json() as { entry: { id: string }; completed: Array<{ id: string }> };
  assert.equal(replayPayload.entry.id, firstPayload.entry.id);
  assert.ok(replayPayload.completed.some(entry => entry.id === firstPayload.entry.id), "the authoritative receipt entry must be present in its response snapshot");
  assert.equal(replayPayload.completed.at(-1)?.id, firstPayload.entry.id, "an older receipt row must not be prepended ahead of the newest-first presentation window");

  assert.equal(completed.deleteCompletedAction(world.agencyId, firstPayload.entry.id), true);
  const deletedReplay = await postCompletion(world.owner, body);
  assert.equal(deletedReplay.status, 409);
  assert.match((await deletedReplay.json() as { error: string }).error, /register entry was later removed/);
});

test("different actors and outcomes are not silently conflated by completion dedupe", async () => {
  const world = await seedWorld();
  assert.equal((await patchNotification(world.owner, notificationBody(world.alert, "dismiss", 0))).status, 200);
  const done = await postCompletion(world.manager, completionBody(world.alert));
  assert.equal(done.status, 200);
  const payload = await done.json() as { entry: { outcome: string; completedBy?: string } };
  assert.equal(payload.entry.outcome, "resolved");
  assert.equal(payload.entry.completedBy, world.manager.id);
  assert.deepEqual(
    completed.completionsFor(world.agencyId, world.alert.id).map(entry => [entry.outcome, entry.completedBy]).sort(),
    [["dismissed", world.owner.id], ["resolved", world.manager.id]].sort(),
  );
});

test("a new semantic occurrence within the retry window gets its own completion row", async () => {
  const world = await seedWorld();
  const firstBody = completionBody(world.alert);
  assert.equal((await postCompletion(world.owner, firstBody)).status, 200);

  tasks.updateAgencyTask(world.agencyId, world.taskId, { title: "A distinct successor occurrence" }, world.owner.id);
  const successor = (await alerts.listOperationalAlerts(world.agencyId)).find(item => item.id === world.alert.id);
  assert.ok(successor);
  assert.notEqual(truth.alertOccurrenceKey(successor), firstBody.expectedOccurrenceKey);
  const successorBody = completionBody(successor, 1);
  assert.equal((await postCompletion(world.owner, successorBody)).status, 200);

  const rows = completed.completionsFor(world.agencyId, world.alert.id);
  assert.equal(rows.length, 2, "receipt idempotency must not collapse two distinct alert occurrences into one audit row");
  assert.equal(new Set(rows.map(row => row.id)).size, 2);
  assert.equal(rows.some(row => row.title.includes("distinct successor")), true);
});

test("the same agency alert outcome is one shared completion across actors", async () => {
  const world = await seedWorld();
  const [ownerResult, managerResult] = await Promise.allSettled([
    patchNotification(world.owner, notificationBody(world.alert, "dismiss", 0)),
    patchNotification(world.manager, notificationBody(world.alert, "dismiss", 0)),
  ]);
  assert.equal(ownerResult.status, "fulfilled");
  assert.equal(managerResult.status, "fulfilled");
  if (ownerResult.status !== "fulfilled" || managerResult.status !== "fulfilled") return;
  assert.equal(ownerResult.value.status, 200);
  assert.equal(managerResult.value.status, 200);

  const rows = completed.completionsFor(world.agencyId, world.alert.id);
  assert.equal(rows.length, 1, "two actors dismissing the same shared occurrence must not duplicate the agency register");
  const receipts = Object.values(realStorage.getState().actionMutationReceipts)
    .filter(receipt => receipt.targetId === world.alert.id);
  assert.equal(receipts.length, 2, "each actor still needs an exact replay receipt for their personal preference mutation");
});

test("cross-user Mark Done receipts share the first actor's one agency register row", async () => {
  const world = await seedWorld();
  const body = completionBody(world.alert);
  const [ownerResponse, managerResponse] = await Promise.all([
    postCompletion(world.owner, body),
    postCompletion(world.manager, body),
  ]);
  assert.equal(ownerResponse.status, 200);
  assert.equal(managerResponse.status, 200);
  const [ownerPayload, managerPayload] = await Promise.all([ownerResponse.json(), managerResponse.json()]) as Array<{
    entry: { id: string; completedBy?: string };
  }>;
  assert.equal(ownerPayload.entry.id, managerPayload.entry.id);
  assert.ok([world.owner.id, world.manager.id].includes(ownerPayload.entry.completedBy ?? ""));
  assert.equal(completed.completionsFor(world.agencyId, world.alert.id).length, 1);
  assert.equal(preferences.getOperationalAlertPreference(world.agencyId, world.owner.id, world.alert.id)?.state, "dismissed");
  assert.equal(preferences.getOperationalAlertPreference(world.agencyId, world.manager.id, world.alert.id)?.state, "dismissed");
  const receipts = Object.values(realStorage.getState().actionMutationReceipts)
    .filter(receipt => receipt.kind === "alert-done" && receipt.targetId === world.alert.id);
  assert.equal(receipts.length, 2);
  assert.equal(new Set(receipts.map(receipt => receipt.completedActionId)).size, 1);
  assert.equal(receipts[0]?.completedActionId, ownerPayload.entry.id);
});

test("a failed Mark Done commit publishes no completion, preference or receipt and retries cleanly", async () => {
  const world = await seedWorld();
  const body = completionBody(world.alert);
  failNextCommit = true;
  await assert.rejects(() => postCompletion(world.owner, body), /injected_actions_commit_failure/);
  assert.equal(completed.completionsFor(world.agencyId, world.alert.id).length, 0);
  assert.equal(preferences.getOperationalAlertPreference(world.agencyId, world.owner.id, world.alert.id), undefined);
  assert.equal(Object.values(realStorage.getState().actionMutationReceipts).some(receipt => receipt.operationId === body.operationId), false);

  assert.equal((await postCompletion(world.owner, body)).status, 200);
  assert.equal(completed.completionsFor(world.agencyId, world.alert.id).length, 1);
});

test("a failed notification Dismiss commit rolls back its log, preference and receipt", async () => {
  const world = await seedWorld();
  const body = notificationBody(world.alert, "dismiss", 0);
  failNextCommit = true;
  await assert.rejects(() => patchNotification(world.owner, body), /injected_actions_commit_failure/);
  assert.equal(completed.completionsFor(world.agencyId, world.alert.id).length, 0);
  assert.equal(preferences.getOperationalAlertPreference(world.agencyId, world.owner.id, world.alert.id), undefined);
  assert.equal(Object.values(realStorage.getState().actionMutationReceipts).some(receipt => receipt.operationId === body.operationId), false);

  assert.equal((await patchNotification(world.owner, body)).status, 200);
  assert.equal(completed.completionsFor(world.agencyId, world.alert.id).length, 1);
});

test("owner task DELETE is single-effect under concurrency and lost-success replay", async () => {
  const world = await seedWorld();
  const target = tasks.createAgencyTask({ agencyId: world.agencyId, title: "Delete exactly once", createdBy: world.owner.id });
  const retained = tasks.createAgencyTask({ agencyId: world.agencyId, title: "Retained sibling", createdBy: world.owner.id });
  const foreignAgency = tenants.createAgency({ name: "Foreign task tenant", slug: `foreign-task-${sequence}` });
  const foreign = tasks.createAgencyTask({ agencyId: foreignAgency.id, title: "Never disclose this row", createdBy: "foreign-owner" });

  const [first, second] = await Promise.all([deleteTask(world.owner, target.id), deleteTask(world.owner, target.id)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const payloads = await Promise.all([first.json(), second.json()]) as Array<{
    taskId: string; operationId: string; replayed: boolean; tasks: Array<{ id: string }>;
  }>;
  assert.deepEqual(payloads.map(payload => payload.replayed).sort(), [false, true]);
  for (const payload of payloads) {
    assert.equal(payload.taskId, target.id);
    assert.equal(payload.operationId, truth.taskDeleteOperationId(target.id));
    assert.equal(payload.tasks.some(task => task.id === target.id), false);
    assert.equal(payload.tasks.some(task => task.id === retained.id), true);
    assert.equal(payload.tasks.some(task => task.id === foreign.id), false);
  }
  assert.equal(tasks.listAgencyTasks(world.agencyId).some(task => task.id === target.id), false);
  assert.equal(Object.values(realStorage.getState().actionMutationReceipts)
    .filter(receipt => receipt.operationId === truth.taskDeleteOperationId(target.id)).length, 1);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 500 })
    .filter(entry => entry.action === "task.deleted" && entry.metadata?.taskId === target.id).length, 1);

  const replay = await deleteTask(world.owner, target.id);
  assert.equal(replay.status, 200);
  const replayPayload = await replay.json() as { replayed: boolean; tasks: Array<{ id: string }> };
  assert.equal(replayPayload.replayed, true);
  assert.equal(replayPayload.tasks.some(task => task.id === target.id), false);
  assert.equal(replayPayload.tasks.some(task => task.id === retained.id), true);
  assert.equal(replayPayload.tasks.some(task => task.id === foreign.id), false);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 500 })
    .filter(entry => entry.action === "task.deleted" && entry.metadata?.taskId === target.id).length, 1);
});

test("failed owner task DELETE rolls back task, activity and receipt before retry", async () => {
  const world = await seedWorld();
  const target = tasks.createAgencyTask({ agencyId: world.agencyId, title: "Rollback delete", createdBy: world.owner.id });
  failNextCommit = true;
  await assert.rejects(() => deleteTask(world.owner, target.id), /injected_actions_commit_failure/);
  assert.equal(tasks.listAgencyTasks(world.agencyId).some(task => task.id === target.id), true);
  assert.equal(Object.values(realStorage.getState().actionMutationReceipts)
    .some(receipt => receipt.operationId === truth.taskDeleteOperationId(target.id)), false);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 500 })
    .some(entry => entry.action === "task.deleted" && entry.metadata?.taskId === target.id), false);

  assert.equal((await deleteTask(world.owner, target.id)).status, 200);
  assert.equal(tasks.listAgencyTasks(world.agencyId).some(task => task.id === target.id), false);
});

test("staff PATCH authorization serializes before a concurrent owner reassignment", async () => {
  const world = await seedWorld();
  const client = tenants.createClient(world.agencyId, {
    name: `Race client ${sequence}`,
    slug: `race-client-${sequence}`,
  });
  const staffUser = users.createUser({
    email: `actions-race-staff-${sequence}@example.test`,
    password: "Actions-recovery-1!",
    role: "agency-staff",
    agencyId: world.agencyId,
  });
  const staff = { id: staffUser.id, token: actorToken(staffUser, world.agencyId) };
  people.createPeopleEmployee({
    agencyId: world.agencyId,
    actorUserId: world.owner.id,
    userId: staff.id,
    name: "Race Staff",
    email: staffUser.email,
    title: "Coordinator",
  });
  const target = tasks.createAgencyTask({
    agencyId: world.agencyId,
    title: "Reassignment race",
    clientId: client.id,
    createdBy: world.owner.id,
    assigneeUserId: staff.id,
  });

  const barrier = createClientAssociationBarrier(client.id);
  clientAssociationBarrier = barrier;
  const staffWrite = patchTask(staff, { id: target.id, notes: "Staff wrote while assigned" });
  await barrier.reached;

  // When authorization is inside the transaction, this owner request queues
  // behind the paused staff request. With the old pre-lock check it commits
  // first, reassigning the task before the stale staff request takes the lock.
  const ownerReassignment = patchTask(world.owner, { id: target.id, assigneeUserId: world.owner.id });
  await new Promise(resolve => setTimeout(resolve, 25));
  barrier.signalRelease();

  const [staffResponse, ownerResponse] = await Promise.all([staffWrite, ownerReassignment]);
  assert.equal(staffResponse.status, 200);
  assert.equal(ownerResponse.status, 200);
  const staffPayload = await staffResponse.json() as { task: { revision: number } };
  const ownerPayload = await ownerResponse.json() as { task: { revision: number; assigneeUserId?: string } };
  assert.ok(
    staffPayload.task.revision < ownerPayload.task.revision,
    "staff wrote after the task had already been reassigned away; authorization was outside the task transaction",
  );
  assert.equal(ownerPayload.task.assigneeUserId, world.owner.id);
  assert.equal(tasks.listAgencyTasks(world.agencyId).find(task => task.id === target.id)?.assigneeUserId, world.owner.id);
});

test("staff DELETE succeeds only for a created task and returns the staff-scoped snapshot", async () => {
  const world = await seedWorld();
  const staffUser = users.createUser({
    email: `actions-staff-${sequence}@example.test`,
    password: "Actions-recovery-1!",
    role: "agency-staff",
    agencyId: world.agencyId,
  });
  const staff = { id: staffUser.id, token: actorToken(staffUser, world.agencyId) };
  people.createPeopleEmployee({
    agencyId: world.agencyId,
    actorUserId: world.owner.id,
    userId: staff.id,
    name: "Actions Staff",
    email: staffUser.email,
    title: "Coordinator",
  });
  const own = tasks.createAgencyTask({ agencyId: world.agencyId, title: "Staff-created", createdBy: staff.id });
  const assigned = tasks.createAgencyTask({
    agencyId: world.agencyId,
    title: "Assigned but manager-created",
    createdBy: world.owner.id,
    assigneeUserId: staff.id,
  });
  const unrelated = tasks.createAgencyTask({ agencyId: world.agencyId, title: "Unrelated manager task", createdBy: world.owner.id });

  const ownDelete = await deleteTask(staff, own.id);
  assert.equal(ownDelete.status, 200);
  const ownPayload = await ownDelete.json() as { tasks: Array<{ id: string }> };
  assert.deepEqual(ownPayload.tasks.map(task => task.id), [assigned.id]);
  assert.equal(ownPayload.tasks.some(task => task.id === unrelated.id), false);

  const refused = await deleteTask(staff, assigned.id);
  assert.equal(refused.status, 404);
  assert.equal(tasks.listAgencyTasks(world.agencyId).some(task => task.id === assigned.id), true);
  assert.equal(Object.values(realStorage.getState().actionMutationReceipts)
    .some(receipt => receipt.operationId === truth.taskDeleteOperationId(assigned.id)), false);
});
