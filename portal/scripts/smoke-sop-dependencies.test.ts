// What still points at a procedure, before anyone decides to retire it.
//
// The roadmap's dependency-safe-sop-retirement item names the missing piece:
// *"Build a dependency inventory used by both confirmation UI and the server
// command."* Its `Why` describes the failure without one — *"Permanent SOP
// deletion removes only the source row. Guides, tasks, products and other
// operational records retain the id, while several mounted surfaces silently
// filter the missing procedure and stop presenting required work."*
//
// The last clause is the dangerous half, and it is why this cannot be left to
// be noticed in production: a dangling SOP id raises nothing. The surfaces
// holding it render one fewer step, so an operator's checklist quietly gets
// SHORTER and nobody is told a required procedure went missing.
//
// ── What this file proves, and what it deliberately does not ───────────────
//
// It proves the inventory finds every reference site, including the four that
// hide INSIDE a parent record — a checklist item, a template step, a product's
// process step, a per-client variation living in client metadata. Those are the
// ones a per-collection sweep misses, and missing one is how an inventory
// becomes worse than none: it reports "safe to delete" and is wrong.
//
// It does NOT assert a retirement policy. Whether deletion should archive,
// tombstone, reassign or detach is an open product decision, and inventing one
// here would be worse than the gap. The last test records what deletion does
// TODAY so that whoever decides has the current behaviour written down.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { ensureHydrated, getState, mutate } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createWrittenSop, deleteSopRecord } from "../src/engines/sop/server/sops";
import {
  collectSopDependants,
  sopDependencyInventory,
  sopHasDependants,
} from "../src/engines/sop/server/sopDependencies";

let agencyId = "";
let sopId = "";
let otherSopId = "";
let clientId = "";

/** Every one of the nine reference sites, seeded at once. */
before(async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "SOP deps", slug: `sop-deps-${Date.now()}` });
  agencyId = agency.id;
  clientId = createClient(agencyId, { name: "Acme Ltd", slug: "acme" }).id;

  const sop = createWrittenSop({
    agencyId, title: "Close the month", content: "Steps…", actorUserId: "seed",
  });
  sopId = sop.id;
  // A SECOND procedure that nothing references. Every count below is only
  // meaningful if an unrelated SOP comes back empty.
  otherSopId = createWrittenSop({
    agencyId, title: "Unrelated", content: "…", actorUserId: "seed",
  }).id;

  const now = Date.now();
  mutate(state => {
    state.tasks["task_dep"] = {
      id: "task_dep", agencyId, title: "Month end", status: "open", priority: "normal",
      createdAt: now, updatedAt: now, createdBy: "seed",
      sopIds: [sopId],
      checklist: [{ id: "chk_dep", label: "Reconcile", sopId }],
    } as never;

    state.taskTemplates["tmpl_dep"] = {
      id: "tmpl_dep", agencyId, name: "Month end template",
      steps: [{ label: "Reconcile", sopId }],
      createdAt: now, updatedAt: now, createdBy: "seed",
    } as never;

    state.sopGuides["guide_dep"] = {
      id: "guide_dep", agencyId, title: "Finance onboarding",
      sopIds: [sopId], createdAt: now, updatedAt: now, updatedBy: "seed",
    } as never;

    state.agencyProducts["prod_dep"] = {
      id: "prod_dep", agencyId, name: "Bookkeeping", sopIds: [sopId],
      internalWorkspace: { processSteps: [{ id: "step_dep", title: "Close", sopIds: [sopId] }] },
      createdAt: now, updatedAt: now,
    } as never;

    state.developmentResources["res_dep"] = {
      id: "res_dep", agencyId, title: "Runbook", sopIds: [sopId],
      createdAt: now, updatedAt: now,
    } as never;

    state.peopleTrainingAssignments["train_dep"] = {
      id: "train_dep", agencyId, sopId, createdAt: now, updatedAt: now,
    } as never;

    // The per-client variation lives in client METADATA, not a collection.
    const client = state.clients[clientId];
    client.metadata = {
      ...(client.metadata ?? {}),
      // The key the reader actually uses is `clientProductVariations`; writing
      // `productVariations` here silently seeded nothing and made the fixture
      // — not the module — the thing under test.
      clientProductVariations: {
        prod_dep: { productId: "prod_dep", name: "Bookkeeping (Acme)", sopIds: [sopId] },
      },
    } as never;
  });
});

describe("the inventory finds every reference site", () => {
  it("finds all nine, across seven owning types", () => {
    const inventory = sopDependencyInventory(agencyId, sopId);
    assert.equal(inventory.total, 9,
      `expected nine dependants, found ${inventory.total}: ${JSON.stringify(inventory.byKind)}`);
    assert.deepEqual(
      Object.keys(inventory.byKind).sort(),
      [
        "client-product-variation",
        "development-resource",
        "guide",
        "product",
        "product-process-step",
        "task",
        "task-checklist-item",
        "task-template-step",
        "training-assignment",
      ],
      "a reference site is missing from the inventory — an inventory that misses one is worse "
      + "than none, because it reports 'safe to delete' and is wrong",
    );
  });

  it("finds the FOUR that hide inside a parent record", () => {
    // The whole reason this module exists. A per-collection sweep sees the
    // other five and reports the SOP unused.
    const nested = collectSopDependants(getState(), agencyId, sopId).filter(dependant => dependant.nested);
    assert.deepEqual(nested.map(dependant => dependant.kind).sort(), [
      "client-product-variation",
      "product-process-step",
      "task-checklist-item",
      "task-template-step",
    ]);
  });

  it("names each dependant well enough for a person to go and fix it", () => {
    for (const dependant of collectSopDependants(getState(), agencyId, sopId)) {
      assert.ok(dependant.id, `${dependant.kind} has no id to navigate to`);
      assert.ok(dependant.label.trim().length > 0, `${dependant.kind} has no label`);
      assert.doesNotMatch(dependant.label, /^undefined/, `${dependant.kind} label is a stringified undefined`);
    }
  });

  it("an UNREFERENCED procedure comes back empty — the count means something", () => {
    const inventory = sopDependencyInventory(agencyId, otherSopId);
    assert.equal(inventory.total, 0, "an unreferenced SOP reported dependants — the matcher is too loose");
    assert.equal(sopHasDependants(agencyId, otherSopId), false);
    assert.equal(sopHasDependants(agencyId, sopId), true);
  });

  it("another agency's records are not counted", () => {
    const other = createAgency({ name: "Elsewhere", slug: `elsewhere-${Date.now()}` });
    assert.equal(sopDependencyInventory(other.id, sopId).total, 0,
      "the inventory counted another agency's dependants");
  });
});

describe("what deletion does today, recorded rather than asserted as correct", () => {
  it("deleting the SOP removes ONLY the source row and strands all nine", () => {
    // Not a claim that this is right — it is the behaviour the roadmap calls
    // out, written down so the retirement decision is made against facts. When
    // a policy lands (archive / tombstone / reassign / detach), this test is
    // where the new rule gets recorded.
    const before = sopDependencyInventory(agencyId, sopId).total;
    assert.equal(before, 9);

    const deleted = deleteSopRecord(agencyId, sopId);
    assert.ok(deleted, "the SOP was not deleted");
    assert.equal(getState().sops[sopId], undefined, "the source row survived");

    const after = collectSopDependants(getState(), agencyId, sopId);
    assert.equal(after.length, 9,
      "deletion now reconciles dependants — a retirement policy has landed, and this test should "
      + "be rewritten to assert it rather than the old strand-everything behaviour");

    // The consequence, stated: every one of these holds an id that resolves to
    // nothing, and the surfaces rendering them fail SILENTLY by showing less.
    assert.equal(getState().tasks["task_dep"].sopIds?.includes(sopId), true,
      "the task no longer holds the dangling id — if that is deliberate, record the policy here");
  });
});
