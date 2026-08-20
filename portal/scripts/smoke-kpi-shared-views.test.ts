import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { deleteSharedKpiView, listSharedKpiViews, saveSharedKpiView } from "../src/lib/server/kpi/kpiSavedViews";
import { getAgencyWorkspaceSettings, updateAgencyWorkspaceSettings } from "../src/server/agencySettings";
import { ensureHydrated } from "../src/server/storage";

// ── Shared saved KPI views (the shared half of "private AND shared") ─────────
// The private half lives in the browser's localStorage and never reaches the
// server. These pin the agency-scoped half: persistence via the agencySettings
// pattern (like kpiTargets), replace-on-same-name semantics matching the
// browser half, validation, and survival across unrelated settings updates.

test("saveSharedKpiView persists agency-scoped and lists back in save order", async () => {
  await ensureHydrated();
  const agencyId = "shared-kpi-views-roundtrip";

  const first = saveSharedKpiView(agencyId, { name: "Growth watch", kpiIds: ["business-health", "revenue-target"], mode: "plan", range: "quarter" }, { actorUserId: "tester", now: 1_000 });
  assert.equal(first.name, "Growth watch");
  assert.deepEqual(first.kpiIds, ["business-health", "revenue-target"]);
  assert.equal(first.mode, "plan");
  assert.equal(first.range, "quarter");
  assert.equal(first.createdAt, 1_000);
  assert.equal(first.createdBy, "tester");

  saveSharedKpiView(agencyId, { name: "Acquisition", kpiIds: ["traffic-7d"], mode: "raw", range: "7d" }, { actorUserId: "tester", now: 2_000 });
  const listed = listSharedKpiViews(agencyId);
  assert.equal(listed.length, 2);
  assert.deepEqual(listed.map(view => view.name), ["Growth watch", "Acquisition"]);

  // Another agency sees nothing — the store is agency-scoped.
  assert.equal(listSharedKpiViews("some-other-agency").length, 0);
});

test("a same-named save replaces the shared view, matching the browser half's semantics", async () => {
  await ensureHydrated();
  const agencyId = "shared-kpi-views-replace";
  saveSharedKpiView(agencyId, { name: "Weekly board", kpiIds: ["mrr"], mode: "plan", range: "30d" }, { actorUserId: "tester", now: 1_000 });
  saveSharedKpiView(agencyId, { name: "WEEKLY BOARD", kpiIds: ["mrr", "revenue-gap"], mode: "change", range: "90d" }, { actorUserId: "tester", now: 2_000 });
  const listed = listSharedKpiViews(agencyId);
  assert.equal(listed.length, 1, "case-insensitive same name replaces, never duplicates");
  assert.equal(listed[0]!.name, "WEEKLY BOARD");
  assert.deepEqual(listed[0]!.kpiIds, ["mrr", "revenue-gap"]);
  assert.equal(listed[0]!.range, "90d");
});

test("deleteSharedKpiView removes exactly the named view", async () => {
  await ensureHydrated();
  const agencyId = "shared-kpi-views-delete";
  const keep = saveSharedKpiView(agencyId, { name: "Keep", kpiIds: ["mrr"] }, { actorUserId: "tester" });
  const drop = saveSharedKpiView(agencyId, { name: "Drop", kpiIds: ["mrr"] }, { actorUserId: "tester" });
  const remaining = deleteSharedKpiView(agencyId, drop.id, { actorUserId: "tester" });
  assert.deepEqual(remaining.map(view => view.id), [keep.id]);
  assert.deepEqual(listSharedKpiViews(agencyId).map(view => view.id), [keep.id]);
});

test("validation: a nameless or KPI-less view is refused; junk mode/range/dates are coerced", async () => {
  await ensureHydrated();
  const agencyId = "shared-kpi-views-validation";
  assert.throws(() => saveSharedKpiView(agencyId, { name: "   ", kpiIds: ["mrr"] }, { actorUserId: "tester" }));
  assert.throws(() => saveSharedKpiView(agencyId, { name: "No KPIs", kpiIds: ["  ", ""] }, { actorUserId: "tester" }));
  const coerced = saveSharedKpiView(agencyId, { name: "Odd", kpiIds: ["mrr", "mrr"], mode: "nonsense", range: "eternity", start: "yesterday", end: "2026-08-20" }, { actorUserId: "tester" });
  assert.deepEqual(coerced.kpiIds, ["mrr"], "duplicate ids collapse");
  assert.equal(coerced.mode, "plan");
  assert.equal(coerced.range, "30d");
  assert.equal(coerced.start, undefined, "a non yyyy-mm-dd date is dropped");
  assert.equal(coerced.end, "2026-08-20");
});

test("shared views live in agencySettings and survive an unrelated settings update", async () => {
  await ensureHydrated();
  const agencyId = "shared-kpi-views-settings";
  const view = saveSharedKpiView(agencyId, { name: "Survivor", kpiIds: ["business-health"] }, { actorUserId: "tester" });
  assert.deepEqual(getAgencyWorkspaceSettings(agencyId).kpiSavedViews?.map(item => item.id), [view.id], "persisted through the agencySettings pattern");

  updateAgencyWorkspaceSettings(agencyId, { timezone: "Europe/Paris" }, "tester");
  assert.deepEqual(listSharedKpiViews(agencyId).map(item => item.id), [view.id], "an unrelated settings write must not drop the shared views");
});

test("the route and the KPI view-save control carry the shared half", () => {
  const route = readFileSync("src/app/api/portal/kpi-registry/views/route.ts", "utf8");
  assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
  assert.match(route, /listSharedKpiViews\(session\.agencyId\)/);
  assert.match(route, /saveSharedKpiView\(session\.agencyId/);
  assert.match(route, /deleteSharedKpiView\(session\.agencyId/);

  const workspace = readFileSync("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx", "utf8");
  assert.match(workspace, /\/api\/portal\/kpi-registry\/views/, "the UI talks to the shared-views endpoint");
  assert.match(workspace, /Only me · this browser/, "the save control offers the private half");
  assert.match(workspace, /Shared · whole agency/, "the save control offers the shared half");
  assert.match(workspace, /savedScope === "shared"/, "saving actually branches on the toggle");
});
