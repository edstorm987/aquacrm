import assert from "node:assert/strict";
import { test } from "node:test";

import type { RadarFindingGroup } from "../src/engines/data/radar/businessRadar";
import {
  RADAR_GROUP_RESOLUTION,
  buildBusinessRecommendedActions,
  resolveFindingAction,
  resolveFindingKind,
} from "../src/lib/intelligence/businessRecommendedActions";
import { resolutionKindOf } from "../src/lib/inbox/resolutionExplain";
import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { buildBusinessIssueRadar } from "../src/engines/data/server/radar/businessIssueRadar";

// Radar upgrade — Stage 7 (family map): every radar finding-FAMILY resolves to a
// deliberate resolution, so a rolled-up incident is never left on the generic
// "judgement: go look" default that made the resolution loop feel like fluff.
//
// A finding keys its resolution on its most specific id. When that id matches one
// of the ~40 per-family entries in CLEARS_WHEN it keeps that specific resolution;
// otherwise it falls back to its finding GROUP's deliberate profile. This suite is
// the guard the map demanded: it fails if a group has no real profile, if the
// intentional in-app / off-system / judgement split silently flips, or if a
// group-resolved finding regresses to a bare judgement dead-end.

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const ALL_GROUPS: RadarFindingGroup[] = ["infrastructure", "commercial", "compliance", "delivery", "reliability", "people"];
const KINDS = new Set(["in-app", "off-system", "judgement"]);

// The intended split, pinned so a careless edit can't fake a fix (promising an
// in-app button for a metric that no screen resolves) or drop a doable fix to a
// shrug. Four groups have a concrete resolution; two are a genuine business call.
const EXPECTED_KIND: Record<RadarFindingGroup, string> = {
  infrastructure: "off-system",
  reliability: "off-system",
  compliance: "off-system",
  delivery: "in-app",
  commercial: "judgement",
  people: "judgement",
};

// The retired generic clearance the incident path used to emit. No finding may
// ever carry it again — its return would mean a family mis-defaulted.
const RETIRED_GENERIC = / is resolved and Radar can read it as healthy again\.$/;

// An id shaped like a radar metric source that matches NO specific CLEARS_WHEN
// family, so it exercises the group fallback rather than a per-family resolution.
const UNMAPPED_ID = "metric:__unmapped_probe_family__";

test("the finding-family map covers every group with a deliberate profile", () => {
  const mapped = Object.keys(RADAR_GROUP_RESOLUTION).sort();
  assert.deepEqual(mapped, [...ALL_GROUPS].sort(), "every RadarFindingGroup must have a resolution profile (the Record is exhaustive by type; this pins it at runtime too)");
  for (const group of ALL_GROUPS) {
    const profile = RADAR_GROUP_RESOLUTION[group];
    assert.ok(profile.kind && KINDS.has(profile.kind), `${group} has an invalid kind`);
    // A real clearance, not an empty string and not the retired generic phrasing.
    assert.ok(profile.clearsWhen.trim().length >= 20, `${group} must state a substantial clears-when`);
    assert.ok(!RETIRED_GENERIC.test(profile.clearsWhen), `${group} must not use the retired generic clearance`);
    // Concrete steps: at least a "go here" and a "do this", never a dead end.
    assert.ok(profile.steps.length >= 2, `${group} must carry at least two concrete steps`);
    assert.ok(profile.steps.every(step => step.trim().length > 0), `${group} has an empty step`);
  }
});

test("the in-app / off-system / judgement split is intentional per group", () => {
  for (const group of ALL_GROUPS) {
    assert.equal(RADAR_GROUP_RESOLUTION[group].kind, EXPECTED_KIND[group], `${group}'s resolution kind changed — confirm this is a deliberate product decision, not a fake fix or a dropped one`);
  }
});

test("an unmapped finding resolves by its group, never a bare judgement dead-end", () => {
  // Guard the premise: the sentinel id must genuinely miss every specific family.
  assert.equal(resolutionKindOf({ id: UNMAPPED_ID }).clearsWhen, undefined, "the sentinel id must not accidentally match a specific resolution family");
  for (const group of ALL_GROUPS) {
    const resolved = resolveFindingAction({ findingId: UNMAPPED_ID, group, restorable: false, href: "/portal/agency/command" });
    const profile = RADAR_GROUP_RESOLUTION[group];
    assert.equal(resolved.kind, profile.kind, `${group} finding must inherit its group kind`);
    assert.equal(resolved.expectedOutcome, profile.clearsWhen, `${group} finding must inherit its group clearance (never blank)`);
    assert.ok(resolved.expectedOutcome && resolved.expectedOutcome.length > 0, `${group} finding must state what clears it`);
    assert.ok(resolved.steps.length >= 2, `${group} finding must carry concrete steps`);
    // The first step navigates to the destination — the "click resolve → land on the fix" contract.
    assert.equal(resolved.steps[0]?.href, "/portal/agency/command", `${group} finding's first step must link to the destination`);
  }
});

test("a concretely restorable finding widens even under a judgement group", () => {
  // commercial + people are judgement groups; a restorable finding within them has
  // a doable fix, so it must widen to off-system rather than shrug.
  for (const group of ["commercial", "people"] as RadarFindingGroup[]) {
    const resolved = resolveFindingAction({ findingId: UNMAPPED_ID, group, restorable: true, href: "/x" });
    assert.equal(resolved.kind, "off-system", `a restorable ${group} finding must widen to off-system`);
    assert.ok(resolved.expectedOutcome, `a restorable ${group} finding must state what clears it`);
  }
});

test("a rolled-up incident's kind badge follows its group, not its id (dashboard honesty)", () => {
  // The Business Radar signals feed labels each incident by kind. Incident ids are
  // `incident:<domain>:<category>`, which match no family and resolve to judgement
  // on id ALONE — so the badge MUST key off the incident's group, or every incident
  // reads "judgement call" (the fluff the family map removed). This is the exact
  // helper the badge uses (resolveFindingKind).
  const cases: Array<[string, RadarFindingGroup, string]> = [
    ["incident:systems:coverage", "infrastructure", "off-system"],
    ["incident:development:coverage", "reliability", "off-system"],
    ["incident:compliance:renewal", "compliance", "off-system"],
    ["incident:delivery:blocked", "delivery", "in-app"],
    ["incident:company:health", "commercial", "judgement"],
    ["incident:team:capacity", "people", "judgement"],
  ];
  for (const [id, group, expected] of cases) {
    // Precondition: on id alone every incident id resolves to judgement.
    assert.equal(resolutionKindOf({ id }).clearsWhen, undefined, `${id} must miss every specific family`);
    assert.equal(resolveFindingKind({ id, group }), expected, `${id} (${group}) must read as ${expected}, not id-only judgement`);
  }
  // With no group known it honestly falls back to the id-only kind (judgement).
  assert.equal(resolveFindingKind({ id: "incident:systems:coverage" }), "judgement");
});

test("a specific per-family resolution still wins over the group profile", () => {
  // A finding whose id DOES match a specific family keeps that family's resolution
  // — the group map must not clobber the ~40 hand-authored per-family answers.
  const specific = resolutionKindOf({ id: "finance:expense-evidence" });
  assert.ok(specific.clearsWhen, "precondition: finance:expense-evidence is a specific family");
  const resolved = resolveFindingAction({ findingId: "finance:expense-evidence", group: "reliability", restorable: true, href: "/x" });
  assert.equal(resolved.kind, specific.kind, "a specific family keeps its own kind, not the group's");
  assert.equal(resolved.expectedOutcome, specific.clearsWhen, "a specific family keeps its own clearance, not the group's");
});

test("no real radar action mis-defaults to the retired generic clearance", async () => {
  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Family Map Co", ownerEmail: "owner@example.com" });
  const radar = await buildBusinessIssueRadar(agency.id, NOW);
  const actions = buildBusinessRecommendedActions({ radar, now: NOW, limit: 12 });
  assert.ok(actions.length > 0, "an uninstrumented agency should still surface actionable work");
  for (const action of actions) {
    assert.ok(!action.expectedOutcome || !RETIRED_GENERIC.test(action.expectedOutcome), `${action.id} carries the retired generic clearance — its family mis-defaulted`);
    // Every action — judgement included — carries at least one concrete step: the
    // loop must never dead-end on "go look" with nowhere to go.
    assert.ok(action.steps && action.steps.length >= 1, `${action.id} is a dead end (no steps)`);
    if (action.expectedOutcome) assert.ok(action.expectedOutcome.trim().length > 0, `${action.id} has a blank clearance`);
  }
});
