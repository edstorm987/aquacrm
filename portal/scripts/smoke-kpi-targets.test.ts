import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveKpiTarget } from "../src/lib/kpiRegistry";
import { clearKpiTarget, getKpiTargetsConfig, setKpiTarget } from "../src/lib/server/kpiTargets";
import { createCustomKpi, deleteCustomKpi, listCustomKpis } from "../src/lib/server/customKpis";
import { ensureHydrated } from "../src/server/storage";

test("setKpiTarget persists to agencySettings; a config override changes the resolved target, versioned", async () => {
  await ensureHydrated();
  const agencyId = "kpi-targets-roundtrip-agency";

  setKpiTarget(agencyId, "revenue-target", { baselineValue: 0, targetValue: 100 }, { actorUserId: "tester", now: 1_000 });
  const config = getKpiTargetsConfig(agencyId);
  assert.equal(config.byKpi["revenue-target"]!.targetValue, 100);
  assert.equal(config.byKpi["revenue-target"]!.effectiveFrom, 1_000);
  assert.equal(resolveKpiTarget(config, "revenue-target")?.targetValue, 100);   // the plan's core P4 contract

  // raise the target → the prior value is versioned into history
  setKpiTarget(agencyId, "revenue-target", { targetValue: 120 }, { actorUserId: "tester", now: 2_000 });
  const raised = getKpiTargetsConfig(agencyId);
  assert.equal(resolveKpiTarget(raised, "revenue-target")?.targetValue, 120);
  assert.equal(resolveKpiTarget(raised, "revenue-target")?.baselineValue, 0);    // baseline preserved
  assert.equal(raised.byKpi["revenue-target"]!.history?.length, 1);
  assert.equal(raised.byKpi["revenue-target"]!.history![0]!.targetValue, 100);

  // a company override wins over the agency level for that company only
  setKpiTarget(agencyId, "revenue-target", { targetValue: 200 }, { actorUserId: "tester", companyId: "co-9", now: 3_000 });
  const scoped = getKpiTargetsConfig(agencyId);
  assert.equal(resolveKpiTarget(scoped, "revenue-target", "co-9")?.targetValue, 200);
  assert.equal(resolveKpiTarget(scoped, "revenue-target")?.targetValue, 120);    // agency level unchanged

  clearKpiTarget(agencyId, "revenue-target", { actorUserId: "tester", now: 4_000 });
  assert.equal(resolveKpiTarget(getKpiTargetsConfig(agencyId), "revenue-target"), undefined);
});

test("createCustomKpi persists a definition and deleteCustomKpi removes it", async () => {
  await ensureHydrated();
  const agencyId = "custom-kpi-roundtrip-agency";
  const created = createCustomKpi(agencyId, { label: "Lead rate", numeratorId: "recent-leads", denominatorId: "traffic-7d", op: "rate" }, { actorUserId: "tester", now: 1 });
  assert.equal(created.op, "rate");
  assert.match(created.id, /^ck_/);
  assert.equal(listCustomKpis(agencyId).length, 1);
  deleteCustomKpi(agencyId, created.id, { actorUserId: "tester" });
  assert.equal(listCustomKpis(agencyId).length, 0);
});

test("the KPI targets route reads and writes the config store", () => {
  const route = readFileSync("src/app/api/portal/kpi-registry/targets/route.ts", "utf8");
  assert.match(route, /getKpiTargetsConfig/);
  assert.match(route, /setKpiTarget/);
  assert.match(route, /clearKpiTarget/);
  assert.match(route, /requireRole/);   // authed
});
