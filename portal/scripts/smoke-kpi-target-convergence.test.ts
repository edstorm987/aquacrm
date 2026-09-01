import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { withSession } from "./dev-console-request-scope";
import {
  KpiTargetRequestError,
  kpiPlanOverridesFromConfig,
  submitKpiTargetMutation,
} from "../src/lib/performance/kpiTargetClient";

const sandbox = mkdtempSync(join(tmpdir(), "aqua-kpi-targets-"));
process.env.PORTAL_BACKEND = "file";
process.env.PORTAL_DATA_FILE = join(sandbox, "portal-state.json");
process.env.PORTAL_SESSION_SECRET = "kpi-target-convergence-secret";
process.env.PORTAL_ALLOW_SHARED_STATE = "1";
process.env.NODE_ENV = "test";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type Auth = typeof import("../src/lib/server/auth/auth");
type Route = typeof import("../src/app/api/portal/kpi-registry/targets/route");

let storage: Storage;
let tenants: Tenants;
let users: Users;
let auth: Auth;
let route: Route;

before(async () => {
  [storage, tenants, users, auth, route] = await Promise.all([
    import("../src/server/storage"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/lib/server/auth/auth"),
    import("../src/app/api/portal/kpi-registry/targets/route"),
  ]);
  await storage.ensureHydrated();
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function post(token: string, body: Record<string, unknown>): Promise<Response> {
  return withSession(token, () => route.POST(new Request("http://localhost/api/portal/kpi-registry/targets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })));
}

function get(token: string): Promise<Response> {
  return withSession(token, () => route.GET());
}

test("edit, reset, suggestion, replay and two-session conflict converge on one agency version", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "KPI convergence", ownerEmail: "first@example.com" });
  // Real user records: the central fresh-session boundary (issue #22)
  // refuses a cookie whose subject does not exist.
  const firstUser = users.createUser({ email: "first@example.com", password: "Kpi-smoke-1!", role: "agency-owner", agencyId: agency.id });
  const secondUser = users.createUser({ email: "second@example.com", password: "Kpi-smoke-1!", role: "agency-manager", agencyId: agency.id });
  const firstToken = auth.issueSession({ userId: firstUser.id, email: firstUser.email, role: "agency-owner", agencyId: agency.id });
  const secondToken = auth.issueSession({ userId: secondUser.id, email: secondUser.email, role: "agency-manager", agencyId: agency.id });

  const initial = await get(firstToken);
  assert.equal(initial.status, 200);
  const initialPayload = await initial.json() as { config: { updatedAt: number } };
  assert.equal(initialPayload.config.updatedAt, 0);

  const editBody = {
    operationId: "kpi-edit-0001",
    expectedUpdatedAt: 0,
    kpiId: "revenue-target",
    action: "set",
    baselineValue: 10,
    targetValue: 100,
  };
  const edited = await post(firstToken, editBody);
  assert.equal(edited.status, 200);
  const editedPayload = await edited.json() as { replayed: boolean; config: { updatedAt: number; byKpi: Record<string, { baselineValue?: number; targetValue?: number; history?: unknown[] }>; operations?: unknown } };
  assert.equal(editedPayload.replayed, false);
  assert.equal(editedPayload.config.byKpi["command:revenue-target"]?.targetValue, 100);
  assert.equal(editedPayload.config.operations, undefined, "the internal replay ledger is not sent to browsers");

  const replay = await post(secondToken, editBody);
  assert.equal(replay.status, 200);
  const replayPayload = await replay.json() as typeof editedPayload;
  assert.equal(replayPayload.replayed, true);
  assert.equal(replayPayload.config.updatedAt, editedPayload.config.updatedAt);
  assert.equal(replayPayload.config.byKpi["command:revenue-target"]?.history?.length ?? 0, 0, "a lost-response retry must not add target history");

  const reusedWithDifferentTerms = await post(firstToken, { ...editBody, targetValue: 999 });
  assert.equal(reusedWithDifferentTerms.status, 409);

  const reset = await post(secondToken, {
    operationId: "kpi-reset-0001",
    expectedUpdatedAt: editedPayload.config.updatedAt,
    kpiId: "revenue-target",
    action: "clear",
  });
  assert.equal(reset.status, 200);
  const resetPayload = await reset.json() as { config: { updatedAt: number; byKpi: Record<string, unknown> } };
  assert.equal(resetPayload.config.byKpi["command:revenue-target"], undefined);

  // Accepted history suggestion: it is the same authoritative set command as
  // a manual edit, with its own retained operation identity.
  const suggestion = await post(firstToken, {
    operationId: "kpi-suggestion-0001",
    expectedUpdatedAt: resetPayload.config.updatedAt,
    kpiId: "lead-conversion",
    action: "set",
    baselineValue: 20,
    targetValue: 22,
  });
  assert.equal(suggestion.status, 200);
  const suggestionPayload = await suggestion.json() as { config: { updatedAt: number; byKpi: Record<string, { targetValue?: number }> } };
  assert.equal(suggestionPayload.config.byKpi["command:lead-conversion"]?.targetValue, 22);

  const staleSecondSession = await post(secondToken, {
    operationId: "kpi-second-session-0001",
    expectedUpdatedAt: resetPayload.config.updatedAt,
    kpiId: "mrr",
    action: "set",
    baselineValue: 1_000,
    targetValue: 1_500,
  });
  assert.equal(staleSecondSession.status, 409);
  const conflictPayload = await staleSecondSession.json() as { config: { updatedAt: number; byKpi: Record<string, { targetValue?: number }> } };
  assert.equal(conflictPayload.config.byKpi["command:lead-conversion"]?.targetValue, 22, "the stale browser receives the newer agency truth");

  const retriedSecondSession = await post(secondToken, {
    operationId: "kpi-second-session-0001",
    expectedUpdatedAt: conflictPayload.config.updatedAt,
    kpiId: "mrr",
    action: "set",
    baselineValue: 1_000,
    targetValue: 1_500,
  });
  assert.equal(retriedSecondSession.status, 200);
  const finalPayload = await retriedSecondSession.json() as { config: { updatedAt: number; byKpi: Record<string, { targetValue?: number }> } };
  assert.equal(finalPayload.config.byKpi["command:mrr"]?.targetValue, 1_500);

  await storage.ensureHydrated({ fresh: true });
  for (const token of [firstToken, secondToken]) {
    const response = await get(token);
    const payload = await response.json() as typeof finalPayload;
    assert.equal(payload.config.updatedAt, finalPayload.config.updatedAt);
    assert.equal(payload.config.byKpi["command:lead-conversion"]?.targetValue, 22);
    assert.equal(payload.config.byKpi["command:mrr"]?.targetValue, 1_500);
    assert.equal(payload.config.byKpi["command:revenue-target"], undefined);
  }

  const actions = storage.getState().activity.filter(entry => entry.action === "kpi.target_set" || entry.action === "kpi.target_cleared");
  assert.equal(actions.length, 4, "exact replays and conflicts add no duplicate activity");
});

test("the browser client keeps canonical state unchanged on failure and adopts only a confirmed retry", async () => {
  const oldConfig = { byKpi: { mrr: { baselineValue: 10, targetValue: 12 } }, updatedAt: 7 };
  const mutation = { operationId: "client-retry-0001", expectedUpdatedAt: 7, kpiId: "mrr", action: "set" as const, baselineValue: 10, targetValue: 15 };
  let canonical = kpiPlanOverridesFromConfig(oldConfig);
  const draft = { baselineValue: 10, targetValue: 15 };

  await assert.rejects(
    submitKpiTargetMutation(mutation, async () => Response.json({ ok: false, error: "not persisted" }, { status: 503 })),
    (error: unknown) => error instanceof KpiTargetRequestError && error.status === 503,
  );
  assert.deepEqual(canonical, { mrr: { baselineValue: 10, targetValue: 12 } });
  assert.deepEqual(draft, { baselineValue: 10, targetValue: 15 }, "the failed intent remains available for retry");

  const confirmed = await submitKpiTargetMutation(mutation, async () => Response.json({
    ok: true,
    replayed: true,
    config: { byKpi: { mrr: { baselineValue: 10, targetValue: 15 } }, updatedAt: 8 },
  }));
  canonical = kpiPlanOverridesFromConfig(confirmed.config);
  assert.deepEqual(canonical, { mrr: { baselineValue: 10, targetValue: 15 } });
});

test("the mounted KPI editor has no browser plan authority and exposes failed-edit recovery", () => {
  const workspace = readFileSync("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /KPI_PLAN_OVERRIDES_KEY|kpi-plan-overrides/);
  assert.doesNotMatch(workspace, /plans: planOverrides/);
  assert.match(workspace, /const result = await submitKpiTargetMutation/);
  assert.ok(workspace.indexOf("adoptPlanConfig(result.config)") > workspace.indexOf("await submitKpiTargetMutation"));
  assert.match(workspace, /The agency plan changed in another session/);
  assert.match(workspace, /Retry the unsaved/);
  assert.match(workspace, /Discard the unsaved/);
  assert.match(workspace, /Values become authoritative only after the agency store confirms them/);
});
