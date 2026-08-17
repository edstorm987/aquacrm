import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { readFileSync } from "node:fs";

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
type Tenants = typeof import("../src/server/tenants");
type Tasks = typeof import("../src/server/tasks");

let storage: Storage;
let tenants: Tenants;
let tasks: Tasks;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  tasks = await import("../src/server/tasks");
  await storage.ensureHydrated();
});

test("agency actions retain client and staff assignment through updates and recurrence", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Task assignment smoke", slug: "task-assignment-smoke" });
  const client = tenants.createClient(agency.id, { name: "Assigned client" });
  const dueAt = Date.parse("2026-08-18T10:00:00Z");
  const task = tasks.createAgencyTask({
    agencyId: agency.id,
    title: "Prepare client review",
    clientId: client.id,
    assigneeUserId: "owner-user",
    recurrence: "weekly",
    dueAt,
    createdBy: "owner-user",
  });

  assert.equal(task.clientId, client.id);
  assert.equal(task.assigneeUserId, "owner-user");

  tasks.updateAgencyTask(agency.id, task.id, { status: "done" }, "owner-user");
  const next = tasks.listAgencyTasks(agency.id).find(item => item.seriesId === task.id);
  assert.equal(next?.clientId, client.id);
  assert.equal(next?.assigneeUserId, "owner-user");
  assert.equal(next?.dueAt, dueAt + 7 * 24 * 60 * 60 * 1000);

  const cleared = tasks.updateAgencyTask(agency.id, next!.id, { clientId: "", assigneeUserId: "" }, "owner-user");
  assert.equal(cleared?.clientId, undefined);
  assert.equal(cleared?.assigneeUserId, undefined);
});

test("agency actions reject a client record from another agency", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Task owner", slug: "task-owner" });
  const otherAgency = tenants.createAgency({ name: "Other task owner", slug: "other-task-owner" });
  const otherClient = tenants.createClient(otherAgency.id, { name: "Out of scope client" });
  const task = tasks.createAgencyTask({
    agencyId: agency.id,
    title: "Scoped task",
    clientId: otherClient.id,
    createdBy: "owner-user",
  });
  assert.equal(task.clientId, undefined);
});

test("Actions uses nested searchable assignment controls for clients and staff", () => {
  const workspace = readFileSync("src/app/portal/agency/actions/_ActionsWorkspace.tsx", "utf8");
  assert.match(workspace, /function NestedAssignmentMenu/);
  assert.match(workspace, /Staff owner/);
  assert.match(workspace, /Active clients/);
  assert.match(workspace, /placeholder=\{`Search \$\{label\.toLowerCase\(\)\}`\}/);
});
