import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

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

type Storage = typeof import("../src/server/storage");
type Tasks = typeof import("../src/server/tasks");
type Tenants = typeof import("../src/server/tenants");
type TasksRoute = typeof import("../src/app/api/portal/tasks/route");
type Auth = typeof import("../src/lib/server/auth/auth");

let storage: Storage;
let tasks: Tasks;
let tenants: Tenants;
let users: typeof import("../src/server/users");
let route: TasksRoute;
let auth: Auth;
let agencyId = "";
let token = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  process.env.PORTAL_SESSION_SECRET = "actions-task-validity-smoke-secret";
  storage = await import("../src/server/storage");
  tasks = await import("../src/server/tasks");
  tenants = await import("../src/server/tenants");
  route = await import("../src/app/api/portal/tasks/route");
  auth = await import("../src/lib/server/auth/auth");
  users = await import("../src/server/users");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Task validity smoke", slug: `task-validity-${Date.now()}` });
  agencyId = agency.id;
  // Real user record: the central fresh-session boundary (issue #22)
  // refuses a cookie whose subject does not exist.
  const owner = users.createUser({
    email: "task-owner@example.com",
    password: "Task-smoke-1!",
    role: "agency-owner",
    agencyId,
  });
  token = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: "agency-owner",
    agencyId,
  });
});

function request(method: "POST" | "PATCH", body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/portal/tasks", {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `${auth.SESSION_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function expectField(response: Response, field: string): Promise<Record<string, unknown>> {
  assert.equal(response.status, 400);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.ok, false);
  assert.equal(payload.field, field);
  assert.equal(typeof payload.error, "string");
  return payload;
}

test("the real task create route rejects invalid enums and calendar chronology", async () => {
  await expectField(await route.POST(request("POST", { title: "Bad priority", priority: "impossible-priority" })), "priority");
  await expectField(await route.POST(request("POST", { title: "Bad repeat", recurrence: "every-whenever" })), "recurrence");
  await expectField(await route.POST(request("POST", { title: "Bad start", startAt: -10 })), "startAt");
  await expectField(await route.POST(request("POST", { title: "Backwards", startAt: 500, dueAt: 100 })), "dueAt");
  await expectField(await route.POST(request("POST", { title: "Late reminder", dueAt: 500, reminderAt: 501 })), "reminderAt");
  await expectField(await route.POST(request("POST", { title: 123 })), "title");
  assert.equal(tasks.listAgencyTasks(agencyId).length, 0);

  const response = await route.POST(request("POST", {
    title: "Valid scheduled task",
    priority: "high",
    startAt: 100,
    dueAt: 500,
    reminderAt: 90,
    recurrence: "weekly",
  }));
  assert.equal(response.status, 201);
  const payload = await response.json() as { ok: boolean; task: { priority: string; recurrence?: string; startAt?: number; dueAt?: number } };
  assert.equal(payload.ok, true);
  assert.deepEqual(
    { priority: payload.task.priority, recurrence: payload.task.recurrence, startAt: payload.task.startAt, dueAt: payload.task.dueAt },
    { priority: "high", recurrence: "weekly", startAt: 100, dueAt: 500 },
  );
});

test("the real patch route validates the complete candidate before mutating", async () => {
  const task = tasks.createAgencyTask({
    agencyId,
    title: "Keep this valid",
    priority: "normal",
    startAt: 100,
    dueAt: 500,
    reminderAt: 90,
    createdBy: "usr_task_owner",
  });

  await expectField(await route.PATCH(request("PATCH", { id: task.id, status: "impossible-status" })), "status");
  await expectField(await route.PATCH(request("PATCH", { id: task.id, priority: "impossible-priority" })), "priority");
  await expectField(await route.PATCH(request("PATCH", { id: task.id, dueAt: 99 })), "dueAt");
  await expectField(await route.PATCH(request("PATCH", { id: task.id, reminderAt: 501 })), "reminderAt");

  const unchanged = tasks.listAgencyTasks(agencyId).find(item => item.id === task.id);
  assert.deepEqual(
    { status: unchanged?.status, priority: unchanged?.priority, startAt: unchanged?.startAt, dueAt: unchanged?.dueAt, reminderAt: unchanged?.reminderAt },
    { status: "todo", priority: "normal", startAt: 100, dueAt: 500, reminderAt: 90 },
  );
});

test("internal task callers cannot bypass runtime validation or duplicate-source validation", () => {
  assert.throws(
    () => tasks.createAgencyTask({ agencyId, title: "Bad internal priority", priority: "bogus" as never, createdBy: "system" }),
    (error: unknown) => error instanceof tasks.TaskValidationError && error.field === "priority",
  );
  assert.throws(
    () => tasks.createAgencyTask({ agencyId, title: "Bad internal time", dueAt: Number.POSITIVE_INFINITY, createdBy: "system" }),
    (error: unknown) => error instanceof tasks.TaskValidationError && error.field === "dueAt",
  );

  tasks.createAgencyTask({ agencyId, title: "Radar task", origin: "radar", sourceId: "radar:one", createdBy: "system" });
  assert.throws(
    () => tasks.createAgencyTask({ agencyId, title: "Duplicate but invalid", origin: "radar", sourceId: "radar:one", priority: "bogus" as never, createdBy: "system" }),
    (error: unknown) => error instanceof tasks.TaskValidationError && error.field === "priority",
  );
  assert.equal(tasks.listAgencyTasks(agencyId).length, 1);
});

test("legacy malformed rows cannot be silently re-saved and can be corrected", () => {
  const task = tasks.createAgencyTask({ agencyId, title: "Legacy task", createdBy: "usr_task_owner" });
  storage.mutate(state => {
    (state.tasks[task.id] as unknown as { status: string }).status = "impossible-status";
  });

  assert.throws(
    () => tasks.updateAgencyTask(agencyId, task.id, { notes: "Unrelated edit" }, "usr_task_owner"),
    (error: unknown) => error instanceof tasks.TaskValidationError && error.field === "status",
  );
  assert.equal(tasks.listAgencyTasks(agencyId)[0]?.notes, undefined);

  const corrected = tasks.updateAgencyTask(agencyId, task.id, { status: "in-progress", notes: "Corrected with edit" }, "usr_task_owner");
  assert.equal(corrected?.status, "in-progress");
  assert.equal(corrected?.notes, "Corrected with edit");
});

test("undefined staff-style patch keys preserve dates and reminder zero remains an explicit clear", () => {
  const task = tasks.createAgencyTask({
    agencyId,
    title: "Preserve dates",
    startAt: 100,
    dueAt: 500,
    reminderAt: 90,
    createdBy: "usr_task_owner",
  });
  const preserved = tasks.updateAgencyTask(agencyId, task.id, {
    title: undefined,
    notes: "Only notes changed",
    status: undefined,
    priority: undefined,
    startAt: undefined,
    dueAt: undefined,
    reminderAt: undefined,
    recurrence: undefined,
  }, "usr_task_owner");
  assert.deepEqual(
    { startAt: preserved?.startAt, dueAt: preserved?.dueAt, reminderAt: preserved?.reminderAt },
    { startAt: 100, dueAt: 500, reminderAt: 90 },
  );

  const cleared = tasks.updateAgencyTask(agencyId, task.id, { reminderAt: 0 }, "usr_task_owner");
  assert.equal(cleared?.reminderAt, undefined);
});

test("recurrence produces another valid ordered calendar task", () => {
  const startAt = Date.parse("2026-01-31T09:00:00Z");
  const dueAt = Date.parse("2026-01-31T17:00:00Z");
  const task = tasks.createAgencyTask({
    agencyId,
    title: "Month-end review",
    startAt,
    dueAt,
    reminderAt: Date.parse("2026-01-31T08:00:00Z"),
    recurrence: "monthly",
    createdBy: "usr_task_owner",
  });
  tasks.updateAgencyTask(agencyId, task.id, { status: "done" }, "usr_task_owner");
  const next = tasks.listAgencyTasks(agencyId).find(item => item.seriesId === task.id);
  assert.ok(next);
  assert.equal(new Date(next.startAt!).toISOString(), "2026-02-28T09:00:00.000Z");
  assert.equal(new Date(next.dueAt!).toISOString(), "2026-02-28T17:00:00.000Z");
  assert.ok(next.startAt! <= next.dueAt!);
  assert.ok(next.reminderAt! <= next.dueAt!);
});

test("Actions surfaces API validation errors and keeps calendar overlap checks", () => {
  const workspace = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  assert.match(workspace, /const \[taskError, setTaskError\] = useState\(""\)/);
  assert.match(workspace, /result\?\.error \|\| "The task could not be saved\."/);
  assert.match(workspace, /result\?\.error \|\| "The task could not be added\."/);
  assert.match(workspace, /\{taskError \? <p role="alert"/);
  assert.match(workspace, /reminderAt: input\.reminderAt \?\? \(editingTask \? 0 : undefined\)/);
  assert.match(workspace, /function overlapsDay\(start: number \| undefined, end: number \| undefined, day: Date\)/);
});
