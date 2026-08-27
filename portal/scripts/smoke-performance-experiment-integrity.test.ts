import assert from "node:assert/strict";
import test from "node:test";

import {
  amendPerformanceExperiment,
  createPerformanceExperiment,
  deletePerformanceExperiment,
  listPerformanceExperiments,
  PerformanceExperimentConflictError,
  updatePerformanceExperiment,
} from "../src/server/performanceExperiments";

const agencyId = `performance-integrity-${process.pid}`;
const actor = "owner-user";

test("experiments reject impossible variant evidence and direct completion", () => {
  assert.throws(() => createPerformanceExperiment(agencyId, {
    name: "Impossible launch",
    status: "complete",
  }, actor), /start as a draft/);
  assert.throws(() => createPerformanceExperiment(agencyId, {
    name: "Duplicate variants",
    variants: [
      { id: "same", visitors: 10, conversions: 1 },
      { id: "SAME", visitors: 10, conversions: 1 },
    ],
  }, actor), /IDs must be unique/);
  assert.throws(() => createPerformanceExperiment(agencyId, {
    name: "Impossible totals",
    variants: [
      { id: "a", visitors: 2, conversions: 3 },
      { id: "b", visitors: 2, conversions: 1 },
    ],
  }, actor), /Conversions cannot exceed visitors/);
});

test("experiment lifecycle is versioned and completed evidence is immutable", () => {
  const draft = createPerformanceExperiment(agencyId, {
    name: "Homepage outcome",
    variants: [
      { id: "control", name: "Control", visitors: 100, conversions: 10 },
      { id: "outcome", name: "Outcome", visitors: 100, conversions: 15 },
    ],
  }, actor);
  assert.equal(draft.status, "draft");
  assert.equal(draft.version, 1);

  const running = updatePerformanceExperiment(agencyId, draft.id, {
    status: "running",
    expectedVersion: draft.version,
  }, actor);
  assert.equal(running?.status, "running");
  assert.ok(running?.startedAt);
  assert.throws(() => updatePerformanceExperiment(agencyId, draft.id, {
    status: "paused",
    expectedVersion: draft.version,
  }, actor), PerformanceExperimentConflictError);

  const completed = updatePerformanceExperiment(agencyId, draft.id, {
    status: "complete",
    expectedVersion: running?.version,
  }, actor);
  assert.equal(completed?.status, "complete");
  assert.ok(completed?.endedAt);
  const completedVariants = structuredClone(completed?.variants);
  assert.throws(() => updatePerformanceExperiment(agencyId, draft.id, {
    status: "running",
    expectedVersion: completed?.version,
  }, actor), /immutable/);

  const amendment = amendPerformanceExperiment(agencyId, draft.id, completed?.version, actor);
  assert.equal(amendment?.status, "draft");
  assert.equal(amendment?.revision, 2);
  assert.equal(amendment?.amendsExperimentId, draft.id);
  assert.deepEqual(amendment?.variants.map(variant => [variant.id, variant.visitors, variant.conversions]), [
    ["control", 0, 0],
    ["outcome", 0, 0],
  ]);
  const retained = listPerformanceExperiments(agencyId).find(experiment => experiment.id === draft.id);
  assert.deepEqual(retained?.variants, completedVariants);
  assert.equal(retained?.amendedByExperimentId, amendment?.id);
  assert.throws(() => deletePerformanceExperiment(agencyId, draft.id, retained?.version, actor), /Only draft experiments/);
  assert.equal(deletePerformanceExperiment(agencyId, amendment!.id, amendment?.version, actor), true);
  const restoredParent = listPerformanceExperiments(agencyId).find(experiment => experiment.id === draft.id);
  assert.equal(restoredParent?.amendedByExperimentId, undefined);
  assert.equal(restoredParent?.version, (retained?.version ?? 0) + 1);
});
