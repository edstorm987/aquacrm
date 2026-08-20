import assert from "node:assert/strict";
import { test } from "node:test";

import type { AdvisorDomain, RadarFindingGroup } from "../src/lib/businessRadar";
import { RADAR_FINDING_GROUP_LABELS, radarFindingGroup } from "../src/lib/radarClassification";
import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { buildBusinessIssueRadar } from "../src/lib/server/businessIssueRadar";

// Radar upgrade — Stage 5: top-level finding grouping (6 problem-kind buckets).

const GROUPS = new Set<RadarFindingGroup>(["infrastructure", "commercial", "compliance", "delivery", "reliability", "people"]);
const DOMAINS: AdvisorDomain[] = ["company", "sales", "inbox", "clients", "finance", "delivery", "marketing", "operations", "compliance", "development", "team", "systems"];

test("every domain resolves to a valid finding group, and every group has a label", () => {
  for (const domain of DOMAINS) {
    const group = radarFindingGroup({ domain, id: `${domain}:example-finding` });
    assert.ok(GROUPS.has(group), `${domain} → ${group} is not a valid group`);
  }
  for (const group of GROUPS) assert.ok(RADAR_FINDING_GROUP_LABELS[group], `${group} is missing a label`);
});

test("domain defaults map to the expected buckets", () => {
  assert.equal(radarFindingGroup({ domain: "sales", id: "sales:pipeline-leads" }), "commercial");
  assert.equal(radarFindingGroup({ domain: "finance", id: "finance:mrr" }), "commercial");
  assert.equal(radarFindingGroup({ domain: "delivery", id: "delivery:stalled-cards" }), "delivery");
  assert.equal(radarFindingGroup({ domain: "operations", id: "operations:overdue-tasks" }), "delivery");
  assert.equal(radarFindingGroup({ domain: "compliance", id: "compliance:insurance" }), "compliance");
  assert.equal(radarFindingGroup({ domain: "team", id: "team:workspace-composition" }), "people");
});

test("reliability and infrastructure override the domain (cross-domain problem kinds)", () => {
  // Observability / uptime problems read as Reliability wherever they surface.
  assert.equal(radarFindingGroup({ domain: "systems", id: "coverage:systems-check-blindness" }), "reliability");
  assert.equal(radarFindingGroup({ domain: "development", id: "development:production-errors" }), "reliability");
  assert.equal(radarFindingGroup({ domain: "inbox", id: "alert:outage:site-down" }), "reliability");
  assert.equal(radarFindingGroup({ domain: "development", id: "synthetic:canary-fail" }), "reliability");
  // Platform problems read as Infrastructure.
  assert.equal(radarFindingGroup({ domain: "systems", id: "infra:database:primary:reachability" }), "infrastructure");
  assert.equal(radarFindingGroup({ domain: "systems", id: "systems:integration-failures" }), "infrastructure");
});

test("people and compliance id fallbacks catch cross-domain findings", () => {
  assert.equal(radarFindingGroup({ domain: "operations", id: "alert:people:leave-decision" }), "people");
  assert.equal(radarFindingGroup({ domain: "finance", id: "alert:contract-awaiting:acme" }), "compliance");
});

test("a real sweep rolls incidents into consistent finding-group summaries", async () => {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Groups Fixture Co", ownerEmail: "owner@example.com" });
  const radar = await buildBusinessIssueRadar(agency.id, Date.parse("2026-08-16T12:00:00.000Z"));

  assert.ok(Array.isArray(radar.findingGroups));
  // Every incident carries a valid group.
  for (const incident of radar.incidents) assert.ok(GROUPS.has(incident.group), `incident ${incident.id} has invalid group ${incident.group}`);
  // The summary is internally consistent and totals the incidents.
  let summed = 0;
  for (const group of radar.findingGroups) {
    assert.ok(GROUPS.has(group.group));
    assert.equal(group.label, RADAR_FINDING_GROUP_LABELS[group.group]);
    assert.equal(group.critical + group.warning + group.watch, group.incidents, `${group.group} counts must total its incidents`);
    summed += group.incidents;
  }
  assert.equal(summed, radar.incidents.length, "every incident must appear in exactly one group");
});
