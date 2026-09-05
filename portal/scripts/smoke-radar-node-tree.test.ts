// Fractal Radar Phase 1 — projectRadarNodeTree is a faithful, HONEST projection.
//
// Pins the two properties the fractal design rests on: (1) the tree reduces the
// existing radar output correctly (agency → domain → family + entity spine, wired
// by parent/child keys, counts intact); (2) the "never a false green" contract —
// a node whose checks are all blind reads `blind`, never `pass`, and its confidence
// is not full. Pure function, so no backend/runtime needed.

import { test } from "node:test";
import assert from "node:assert/strict";

import { projectRadarNodeTree, indexRadarNodes, type RadarNode } from "../src/engines/data/radar/radarNodeTree";
import type { BusinessIssueRadar, BusinessRadarCheck, RadarCheckStatus, RadarDomainSummary, AdvisorDomain } from "../src/engines/data/radar/businessRadar";

let seq = 0;
function check(domain: AdvisorDomain, familyId: string, status: RadarCheckStatus, entity?: BusinessRadarCheck["entity"]): BusinessRadarCheck {
  seq += 1;
  return {
    id: `chk_${seq}`, ruleId: `${familyId}:lens`, domain, familyId, familyLabel: `${familyId} label`,
    lens: "current" as BusinessRadarCheck["lens"], lensLabel: "Current", scope: "kpi", status,
    title: `${familyId} ${status}`, detail: "d", evidence: [], href: "/x", sourceId: "s", measuredAt: 1, entity,
  };
}
function domainSummary(partial: Partial<RadarDomainSummary> & { domain: AdvisorDomain }): RadarDomainSummary {
  return {
    totalChecks: 0, passedChecks: 0, firingChecks: 0, watchChecks: 0, blindChecks: 0, learningChecks: 0,
    inactiveChecks: 0, applicableChecks: 0, assuredChecks: 0, coveragePercent: 0, assurancePercent: 0,
    confidencePercent: 0, readinessPercent: 0, sourceCount: 0, ...partial,
  };
}

// Synthetic radar: clients {delivery-commitments: pass+critical, telemetry-freshness: blind+blind},
// finance {invoices: pass+blind}. One check names an entity.
const checks: BusinessRadarCheck[] = [
  check("clients", "delivery-commitments", "pass"),
  check("clients", "delivery-commitments", "critical", { type: "client", id: "c1", label: "Acme" }),
  check("clients", "telemetry-freshness", "blind"),
  check("clients", "telemetry-freshness", "blind"),
  check("finance", "invoices", "pass"),
  check("finance", "invoices", "blind"),
];
const radar = {
  checks,
  domains: [
    domainSummary({ domain: "clients", totalChecks: 4, passedChecks: 1, firingChecks: 1, blindChecks: 2, applicableChecks: 4, assuredChecks: 2, assurancePercent: 50, confidencePercent: 50, readinessPercent: 40 }),
    domainSummary({ domain: "finance", totalChecks: 2, passedChecks: 1, blindChecks: 1, applicableChecks: 2, assuredChecks: 1, assurancePercent: 50, confidencePercent: 50, readinessPercent: 60 }),
  ],
  summary: { totalChecks: 6, passedChecks: 2, firingChecks: 1, watchChecks: 0, blindChecks: 3, learningChecks: 0, inactiveChecks: 0, assurancePercent: 50 },
} as unknown as BusinessIssueRadar;

const nodes = projectRadarNodeTree(radar);
const byKey = indexRadarNodes(nodes);
const get = (key: string): RadarNode => {
  const node = byKey.get(key);
  assert.ok(node, `missing node ${key}`);
  return node;
};

test("agency root parents the domains", () => {
  const agency = get("agency");
  assert.equal(agency.level, "agency");
  assert.equal(agency.parentKey, null);
  assert.deepEqual([...agency.childKeys].sort(), ["dom:clients", "dom:finance"]);
  assert.equal(agency.counts.total, 6);
  assert.equal(agency.counts.blind, 3);
});

test("domain nodes reuse the authoritative summary + roll up health from their checks", () => {
  const clients = get("dom:clients");
  assert.equal(clients.parentKey, "agency");
  assert.equal(clients.readinessPercent, 40);          // authoritative, from the summary
  assert.equal(clients.assurancePercent, 50);
  assert.equal(clients.health, "critical");            // has a critical check
  assert.deepEqual([...clients.childKeys].sort(), ["fam:clients:delivery-commitments", "fam:clients:telemetry-freshness"]);
});

test("a firing family reads its worst severity; assurance/confidence match the domain formulas", () => {
  const fam = get("fam:clients:delivery-commitments");
  assert.equal(fam.health, "critical");
  assert.deepEqual(fam.counts, { total: 2, passed: 1, firing: 1, watch: 0, blind: 0, learning: 0, inactive: 0 });
  assert.equal(fam.assurancePercent, 100);             // assured 2 / applicable 2
  assert.equal(fam.confidencePercent, 100);
});

test("NEVER A FALSE GREEN — an all-blind family reads blind, not pass, with zero confidence", () => {
  const fam = get("fam:clients:telemetry-freshness");
  assert.equal(fam.health, "blind");
  assert.equal(fam.assurancePercent, 0);
  assert.equal(fam.confidencePercent, 0);
});

test("pass ranks above blind — a mixed pass+blind family reads pass, with the blind spot still counted", () => {
  const fam = get("fam:finance:invoices");
  assert.equal(fam.health, "pass");
  assert.equal(fam.counts.blind, 1);                   // the blind spot is not hidden
  assert.equal(fam.assurancePercent, 50);              // assured 1 / applicable 2
  assert.equal(fam.confidencePercent, 50);
});

test("the entity spine surfaces a monitored entity from its checks", () => {
  const ent = get("ent:client:c1");
  assert.equal(ent.level, "entity");
  assert.equal(ent.label, "Acme");
  assert.equal(ent.health, "critical");
  assert.equal(ent.counts.total, 1);
});
