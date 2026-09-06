import assert from "node:assert/strict";
import { test } from "node:test";

import type { RadarFindingGroup } from "../src/engines/data/radar/businessRadar";
import { buildBusinessRecommendedActions } from "../src/lib/intelligence/businessRecommendedActions";
import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { buildBusinessIssueRadar } from "../src/engines/data/server/radar/businessIssueRadar";

// Radar upgrade — Stage 7: issues → actionable tasks (Part F).
// Every recommended action now carries the resolution model — kind, expected
// outcome (clearance), concrete steps, a suggested owner and its problem group —
// so accepting it mints a fully-formed task, and judgement findings that have a
// real fix are widened rather than dead-ending.

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const KINDS = new Set(["in-app", "off-system", "judgement"]);
const GROUPS = new Set<RadarFindingGroup>(["infrastructure", "commercial", "compliance", "delivery", "reliability", "people"]);

async function actionsForFreshAgency() {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Actionable Fixture Co", ownerEmail: "owner@example.com" });
  const radar = await buildBusinessIssueRadar(agency.id, NOW);
  return buildBusinessRecommendedActions({ radar, now: NOW, limit: 12 });
}

test("every recommended action carries a full resolution model", async () => {
  const actions = await actionsForFreshAgency();
  assert.ok(actions.length > 0, "an uninstrumented agency should still surface actionable work");
  for (const action of actions) {
    assert.ok(action.kind && KINDS.has(action.kind), `${action.id} is missing a valid kind`);
    // A destination to act is what makes it an action rather than a notice — no
    // recommended action may ship without somewhere to go.
    assert.ok(action.href.trim().length > 0, `${action.id} has no destination (href) to act on`);
    assert.ok(action.steps && action.steps.length >= 1, `${action.id} must carry at least one concrete step (never a dead end)`);
    assert.ok(action.steps.every(step => step.label.trim().length > 0), `${action.id} has an empty step`);
    assert.ok(action.group && GROUPS.has(action.group), `${action.id} is missing a valid group`);
    assert.ok(action.suggestedOwner && action.suggestedOwner.length > 0, `${action.id} is missing a suggested owner`);
    // in-app / off-system findings state what clears them; judgement deliberately may not.
    if (action.kind !== "judgement") assert.ok(action.expectedOutcome, `${action.id} (${action.kind}) must state an expected outcome`);
  }
});

test("coverage / readiness findings surface as a doable off-system action, never a judgement dead-end", async () => {
  const actions = await actionsForFreshAgency();
  // Coverage / readiness findings match no specific family, so they resolve by
  // their reliability group profile — which is off-system with a clearance (NOT a
  // judgement dead-end). (The judgement→off-system RESTORABLE widening for the two
  // judgement groups is exercised directly in smoke-radar-finding-families.)
  const restorable = actions.filter(action => action.id.startsWith("recommended-source:") || action.id.startsWith("recommended-readiness:"));
  assert.ok(restorable.length > 0, "an empty agency should surface coverage/readiness restoration actions");
  for (const action of restorable) {
    assert.notEqual(action.kind, "judgement", `${action.id} has a real fix and must not dead-end as judgement`);
    assert.ok(action.expectedOutcome, `${action.id} must state what clears it`);
    assert.equal(action.group, "reliability");
  }
});

test("incident actions inherit the incident's problem group (ties to Stage 5)", async () => {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Group Tie Co", ownerEmail: "owner@example.com" });
  const radar = await buildBusinessIssueRadar(agency.id, NOW);
  const actions = buildBusinessRecommendedActions({ radar, now: NOW, limit: 12 });
  let matched = 0;
  for (const incident of radar.incidents) {
    const action = actions.find(candidate => candidate.id === `recommended-radar:${incident.id}`);
    if (action) {
      matched += 1;
      assert.equal(action.group, incident.group, `${action.id} should carry its incident's group`);
    }
  }
  // Floor: the group-inheritance contract must actually be exercised — if a future
  // ranking/dedup change stopped incidents surfacing as actions this loop would
  // pass vacuously, so require at least one real incident→action to have been checked.
  assert.ok(matched > 0, "at least one incident must surface as a recommended-radar action for this contract to bite");
});

test("existing tasks still suppress duplicate actions (contract preserved)", async () => {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Dedup Co", ownerEmail: "owner@example.com" });
  const radar = await buildBusinessIssueRadar(agency.id, NOW);
  const all = buildBusinessRecommendedActions({ radar, now: NOW, limit: 12 });
  assert.ok(all.length > 0);
  const suppressed = buildBusinessRecommendedActions({ radar, now: NOW, limit: 12, existingTaskTitles: [all[0]!.title] });
  assert.ok(!suppressed.some(action => action.title === all[0]!.title), "an action already captured as a task must not be re-proposed");
});
