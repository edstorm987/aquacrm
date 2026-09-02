// First, and statically: this import installs the request-scope helpers before
// anything pulls in `next/`. See the note in dev-console-request-scope.ts.
import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
type Route = typeof import("../src/app/api/tenants/client-tasks/route");
type Auth = typeof import("../src/lib/server/auth/auth");

let storage: Storage;
let tasks: Tasks;
let tenants: Tenants;
let route: Route;
let auth: Auth;
let clientId = "";
let token = "";

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  process.env.PORTAL_SESSION_SECRET = "client-board-smoke-secret";
  storage = await import("../src/server/storage");
  tasks = await import("../src/server/tasks");
  tenants = await import("../src/server/tenants");
  route = await import("../src/app/api/tenants/client-tasks/route");
  auth = await import("../src/lib/server/auth/auth");
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Shared board smoke", slug: `shared-board-${Date.now()}` });
  const client = tenants.createClient(agency.id, { name: "Board client" });
  clientId = client.id;
  // A REAL user, not a made-up id. `getSession()` re-resolves the session's user
  // on every call and refuses a cookie whose subject does not exist, whose role
  // has changed, or whose `sessionRev` is stale (issues #22). `storage.reset()`
  // above wipes the store each time, so the owner is seeded per test.
  const users = await import("../src/server/users");
  const owner = users.createUser({
    email: `board-owner-${Date.now()}@example.com`,
    name: "Board Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "client-board-smoke-pass-phrase",
  });
  token = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: "agency-owner",
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
});

function request(method: "GET" | "POST" | "PATCH" | "DELETE", path = "", body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/tenants/client-tasks${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      cookie: `${auth.SESSION_COOKIE_NAME}=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("client fulfilment tasks persist in Actions, reject stale moves and delete durably", async () => {
  const createdResponse = await withSession(token, () => route.POST(request("POST", "", { clientId, action: "create", title: "Prepare launch pack", operationId: "create-one" })));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { task: { id: string; revision: number; status: string; clientBoardColumn: string }; tasks: unknown[] };
  assert.deepEqual({ revision: created.task.revision, status: created.task.status, column: created.task.clientBoardColumn }, { revision: 0, status: "todo", column: "backlog" });

  const secondSession = await withSession(token, () => route.GET(request("GET", `?clientId=${encodeURIComponent(clientId)}`)));
  assert.equal(secondSession.status, 200);
  assert.equal((await secondSession.json() as { tasks: unknown[] }).tasks.length, 1);
  assert.equal(tasks.listAgencyTasks(tenants.getClient(clientId)!.agencyId)[0]?.clientId, clientId);

  const movedResponse = await withSession(token, () => route.PATCH(request("PATCH", "", { clientId, id: created.task.id, columnId: "waiting-on-client", order: 20, expectedRevision: 0 })));
  assert.equal(movedResponse.status, 200);
  const moved = await movedResponse.json() as { task: { revision: number; status: string; clientBoardColumn: string } };
  assert.deepEqual({ revision: moved.task.revision, status: moved.task.status, column: moved.task.clientBoardColumn }, { revision: 1, status: "in-progress", column: "waiting-on-client" });

  const staleMove = await withSession(token, () => route.PATCH(request("PATCH", "", { clientId, id: created.task.id, columnId: "review", order: 30, expectedRevision: 0 })));
  assert.equal(staleMove.status, 409);
  const stalePayload = await staleMove.json() as { task: { revision: number; clientBoardColumn: string } };
  assert.deepEqual({ revision: stalePayload.task.revision, column: stalePayload.task.clientBoardColumn }, { revision: 1, column: "waiting-on-client" });

  const staleDelete = await withSession(token, () => route.DELETE(request("DELETE", `?clientId=${encodeURIComponent(clientId)}&id=${encodeURIComponent(created.task.id)}&expectedRevision=0`)));
  assert.equal(staleDelete.status, 409);
  const deleted = await withSession(token, () => route.DELETE(request("DELETE", `?clientId=${encodeURIComponent(clientId)}&id=${encodeURIComponent(created.task.id)}&expectedRevision=1`)));
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json() as { tasks: unknown[] }).tasks.length, 0);
});

test("legacy browser cards import once with their board/status meaning intact", async () => {
  const cards = [
    { id: "legacy-a", title: "Old backlog task", columnId: "backlog", order: 1 },
    { id: "legacy-b", title: "Old completed task", columnId: "done", order: 2 },
  ];
  const first = await withSession(token, () => route.POST(request("POST", "", { clientId, action: "import", cards })));
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { imported: number; tasks: Array<{ status: string; clientBoardColumn: string }> };
  assert.equal(firstPayload.imported, 2);
  assert.deepEqual(firstPayload.tasks.map(task => [task.clientBoardColumn, task.status]), [["backlog", "todo"], ["done", "done"]]);

  const retry = await withSession(token, () => route.POST(request("POST", "", { clientId, action: "import", cards })));
  assert.equal(retry.status, 200);
  const retryPayload = await retry.json() as { imported: number; tasks: unknown[] };
  assert.equal(retryPayload.imported, 0);
  assert.equal(retryPayload.tasks.length, 2);
});

test("mounted board uses the shared route and only reads localStorage for one-time migration", () => {
  const root = process.cwd();
  const board = readFileSync(join(root, "src/app/portal/clients/[clientId]/_KanbanTabClient.tsx"), "utf8");
  const api = readFileSync(join(root, "src/app/api/tenants/client-tasks/route.ts"), "utf8");
  const page = readFileSync(join(root, "src/app/portal/clients/[clientId]/page.tsx"), "utf8");
  assert.match(board, /\/api\/tenants\/client-tasks/);
  assert.match(board, /window\.localStorage\.removeItem\(legacyKey\)/);
  assert.doesNotMatch(board, /window\.localStorage\.setItem/);
  assert.match(board, /expectedRevision: task\.revision \?\? 0/);
  assert.match(board, /Open Actions/);
  assert.match(api, /withPortalStateTransaction\(privateObjectLifecycleLockKey\(session\.agencyId\)/);
  assert.match(api, /ensureHydrated\(\{ fresh: true \}\)/);
  assert.match(api, /status: 409/);
  assert.match(api, /deleteAgencyTask/);
  assert.match(page, /canAccessActions/);
  assert.match(page, /canManage=\{canManageOperations\}/);
});
