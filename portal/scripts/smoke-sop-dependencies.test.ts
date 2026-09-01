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
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

import { ensureHydrated, flushPendingWrites, getState, mutate } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createSopCategory, createWrittenSop, deleteSopRecord } from "../src/engines/sop/server/sops";
import {
  collectSopDependants,
  sopDependencyInventory,
  sopHasDependants,
} from "../src/engines/sop/server/sopDependencies";
import { DELETE as sopsDelete, GET as sopsGet, PATCH as sopsPatch } from "../src/app/api/portal/sops/route";
import { SESSION_COOKIE_NAME, issueSession } from "../src/lib/server/auth/auth";
import { createUser } from "../src/server/users";
import type { SopDependencyInventory } from "../src/engines/sop/server/sopDependencies";
import { deletePrivateObjectWithRecovery, privateObjectRequestHash } from "../src/lib/server/privateObjectLifecycle";
import { DELETE as sopCategoriesDelete } from "../src/app/api/portal/sops/categories/route";

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

// ── Both callers ask the same question, of the same implementation ──────────
//
// The inventory existing is not the point; being CONSULTED is. Until it was
// wired up, the delete route removed the row without ever asking, and the
// library's confirmation was a bare `window.confirm("This cannot be undone")` —
// technically true and useless, because what a person needs to know is not that
// deletion is permanent but WHAT ELSE it breaks.
//
// These pin the decision-free half: a retirement preview a confirmation surface
// can read, and a delete response that states what it stranded. They still
// assert NO policy — deletion is allowed to proceed and detaches nothing, which
// remains Ed's open decision (issues #176).

const routeAgency = { id: "", sopId: "", loneSopId: "", token: "" };

before(async () => {
  // Its own hydration: each root hook enters the data realm for itself, and
  // without this the records below are written to a scratch state the first
  // hydration then replaces — which shows up as a 401 on every request here.
  await ensureHydrated();
  const agency = createAgency({ name: "SOP retirement route", slug: `sop-retire-${Date.now()}` });
  routeAgency.id = agency.id;
  const owner = createUser({
    email: `retire-owner-${agency.id}@sop-deps.test`,
    name: "Owner",
    role: "agency-owner",
    agencyId: agency.id,
    password: "retire-smoke-password-1!",
  });
  routeAgency.token = issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });

  routeAgency.sopId = createWrittenSop({
    agencyId: agency.id, title: "Escalate an incident", content: "…", actorUserId: owner.id,
  }).id;
  routeAgency.loneSopId = createWrittenSop({
    agencyId: agency.id, title: "Nothing uses me", content: "…", actorUserId: owner.id,
  }).id;

  const now = Date.now();
  mutate(state => {
    state.tasks["task_route_dep"] = {
      id: "task_route_dep", agencyId: agency.id, title: "Handle the incident", status: "open",
      priority: "normal", createdAt: now, updatedAt: now, createdBy: owner.id,
      sopIds: [routeAgency.sopId],
      // Nested: the site a per-collection sweep misses, so its presence in the
      // route's answer proves the route uses the real inventory.
      checklist: [{ id: "chk_route_dep", label: "Page the on-call", sopId: routeAgency.sopId }],
    } as never;
    state.sopGuides["guide_route_dep"] = {
      id: "guide_route_dep", agencyId: agency.id, title: "Incident response",
      sopIds: [routeAgency.sopId], createdAt: now, updatedAt: now, updatedBy: owner.id,
    } as never;
  });
  // The route handlers re-enter `ensureHydrated()`, which reloads the backend
  // and would drop these still-pending writes — including the user the session
  // resolves against, which would 401 every request below for the wrong reason.
  await flushPendingWrites();
});

const authed = (search: string, method: "GET" | "DELETE" = "GET") => new NextRequest(
  `http://localhost/api/portal/sops${search}`,
  { method, headers: { cookie: `${SESSION_COOKIE_NAME}=${routeAgency.token}` } },
);

describe("the delete path consults the inventory instead of guessing", () => {
  it("offers a retirement preview a confirmation surface can read", async () => {
    const response = await sopsGet(authed(`?dependencies=${encodeURIComponent(routeAgency.sopId)}`));
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; dependencies?: SopDependencyInventory };
    assert.equal(body.ok, true);
    assert.ok(body.dependencies, "the route answered without a dependency inventory — a confirmation "
      + "surface has nothing to show and falls back to 'this cannot be undone'");
    assert.equal(body.dependencies.total, 3, JSON.stringify(body.dependencies.byKind));
    assert.deepEqual(Object.keys(body.dependencies.byKind).sort(),
      ["guide", "task", "task-checklist-item"],
      "the preview missed the NESTED checklist reference — it is not reading the shared inventory");
    // Labels, not bare ids: the dialog must name the thing a person goes and fixes.
    for (const dependant of body.dependencies.dependants) {
      assert.ok(dependant.label.trim().length > 0, `${dependant.kind} arrived with no label`);
    }
  });

  it("still lists SOPs when no preview was asked for, and 404s an unknown one", async () => {
    const list = await sopsGet(authed(""));
    assert.equal(list.status, 200);
    const body = await list.json() as { ok: boolean; sops?: unknown[] };
    assert.ok(Array.isArray(body.sops), "the list read regressed while adding the preview");

    assert.equal((await sopsGet(authed("?dependencies=sop_does_not_exist"))).status, 404,
      "an unknown SOP answered a preview — an empty inventory would read as 'safe to delete'");
  });

  it("names another agency's SOP as unknown rather than inventorying it", async () => {
    // `otherSopId` belongs to the first fixture's agency and is never deleted,
    // so a 404 here can only mean the boundary held.
    const foreign = await sopsGet(authed(`?dependencies=${encodeURIComponent(otherSopId)}`));
    assert.equal(foreign.status, 404, "the preview crossed the agency boundary");
  });

  it("the DELETE response states what it stranded, rather than a bare ok", async () => {
    const response = await sopsDelete(authed(`?id=${encodeURIComponent(routeAgency.sopId)}`, "DELETE"));
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; stranded?: SopDependencyInventory };
    assert.equal(body.ok, true);
    assert.ok(body.stranded, "the deletion reported success without saying what it left holding a "
      + "dangling id — the surfaces holding it fail silently, so this response is the only telling");
    assert.equal(body.stranded.total, 3);
    assert.equal(body.stranded.sopId, routeAgency.sopId);
    assert.deepEqual(Object.keys(body.stranded.byKind).sort(), ["guide", "task", "task-checklist-item"]);

    // The row is gone and — deliberately, until a policy is decided — nothing
    // was detached. The response describes that truthfully; it does not claim a
    // reconciliation that did not happen.
    assert.equal(getState().sops[routeAgency.sopId], undefined, "the source row survived");
    assert.equal(getState().tasks["task_route_dep"].sopIds?.includes(routeAgency.sopId), true,
      "deletion now detaches dependants — a retirement policy has landed, and this test plus the "
      + "strand-everything test above should be rewritten to assert it");

    const replay = await sopsDelete(authed(`?id=${encodeURIComponent(routeAgency.sopId)}`, "DELETE"));
    assert.equal(replay.status, 200, "an exact retry after response loss must replay the completed deletion checkpoint");
    const replayBody = await replay.json() as { stranded?: SopDependencyInventory };
    assert.equal(replayBody.stranded?.total, 3, "the replay lost the original dependency inventory");
  });

  it("an unreferenced SOP is deleted with an empty stranded inventory, not a missing one", async () => {
    const response = await sopsDelete(authed(`?id=${encodeURIComponent(routeAgency.loneSopId)}`, "DELETE"));
    assert.equal(response.status, 200);
    const body = await response.json() as { ok: boolean; stranded?: SopDependencyInventory };
    assert.equal(body.stranded?.total, 0, "a clean deletion must still answer with the inventory it "
      + "checked — absent and empty are different claims");
  });
});

describe("SOP updates share the permanent-deletion lifecycle transaction", () => {
  it("cannot resurrect an SOP after its provider object was deleted", async () => {
    const doomed = createWrittenSop({
      agencyId: routeAgency.id,
      title: "Update-race SOP",
      content: "Original procedure",
      actorUserId: "seed",
    });
    mutate(state => {
      state.sops[doomed.id] = {
        ...state.sops[doomed.id]!,
        storageProvider: "local",
        storageKey: `${routeAgency.id}/${doomed.id}.pdf`,
      };
    });
    let checkpointResolve!: () => void;
    let releaseResolve!: () => void;
    const checkpointed = new Promise<void>(resolve => { checkpointResolve = resolve; });
    const released = new Promise<void>(resolve => { releaseResolve = resolve; });
    let providerCalls = 0;
    const deletion = deletePrivateObjectWithRecovery({
      agencyId: routeAgency.id,
      purpose: "sop",
      objectId: doomed.id,
      requestHash: privateObjectRequestHash([routeAgency.id, doomed.id, "permanent-delete"]),
      localDirectory: "sop-uploads",
      prepare(state) {
        const current = state.sops[doomed.id];
        assert.ok(current, "the SOP update-race fixture disappeared before deletion started");
        delete state.sops[doomed.id];
        return { snapshot: current, storageProvider: current.storageProvider, storageKey: current.storageKey };
      },
      async afterCheckpoint() {
        checkpointResolve();
        await released;
      },
      providers: { local: async () => { providerCalls += 1; } },
    });
    await checkpointed;

    let updateSettled = false;
    const update = sopsPatch(new NextRequest("http://localhost/api/portal/sops", {
      method: "PATCH",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${routeAgency.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: doomed.id, title: "Must not be resurrected" }),
    }));
    void update.then(() => { updateSettled = true; }, () => { updateSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 25));
    const updateSettledBeforeDeleteCommit = updateSettled;
    releaseResolve();

    const [deletionResult, updateResponse] = await Promise.all([deletion, update]);
    assert.equal(updateSettledBeforeDeleteCommit, false,
      "the PATCH crossed the deletion checkpoint instead of waiting for the shared lifecycle lane");
    assert.equal(deletionResult.ok, true);
    assert.equal(providerCalls, 1, "the SOP binary was not deleted exactly once");
    assert.equal(updateResponse.status, 404, "the queued PATCH did not re-read the deleted SOP store");
    assert.equal(getState().sops[doomed.id], undefined,
      "the queued PATCH resurrected an SOP whose binary was permanently deleted");
  });

  it("a category rewrite cannot resurrect an SOP after provider deletion", async () => {
    const category = createSopCategory(routeAgency.id, `Retiring ${Date.now()}`, "seed");
    const doomed = createWrittenSop({
      agencyId: routeAgency.id,
      title: "Category-race SOP",
      content: "Original procedure",
      category,
      actorUserId: "seed",
    });
    mutate(state => {
      state.sops[doomed.id] = {
        ...state.sops[doomed.id]!,
        storageProvider: "local",
        storageKey: `${routeAgency.id}/${doomed.id}.pdf`,
      };
    });
    let checkpointResolve!: () => void;
    let releaseResolve!: () => void;
    const checkpointed = new Promise<void>(resolve => { checkpointResolve = resolve; });
    const released = new Promise<void>(resolve => { releaseResolve = resolve; });
    let providerCalls = 0;
    const deletion = deletePrivateObjectWithRecovery({
      agencyId: routeAgency.id,
      purpose: "sop",
      objectId: doomed.id,
      requestHash: privateObjectRequestHash([routeAgency.id, doomed.id, "permanent-delete"]),
      localDirectory: "sop-uploads",
      prepare(state) {
        const current = state.sops[doomed.id];
        assert.ok(current, "the category-race fixture disappeared before deletion started");
        delete state.sops[doomed.id];
        return { snapshot: current, storageProvider: current.storageProvider, storageKey: current.storageKey };
      },
      async afterCheckpoint() {
        checkpointResolve();
        await released;
      },
      providers: { local: async () => { providerCalls += 1; } },
    });
    await checkpointed;

    let categorySettled = false;
    const categoryDelete = sopCategoriesDelete(new NextRequest("http://localhost/api/portal/sops/categories", {
      method: "DELETE",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${routeAgency.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ category }),
    }));
    void categoryDelete.then(() => { categorySettled = true; }, () => { categorySettled = true; });
    await new Promise(resolve => setTimeout(resolve, 25));
    const categorySettledBeforeDeleteCommit = categorySettled;
    releaseResolve();

    const [deletionResult, categoryResponse] = await Promise.all([deletion, categoryDelete]);
    assert.equal(categorySettledBeforeDeleteCommit, false,
      "the category rewrite crossed the deletion checkpoint instead of waiting for the shared lifecycle lane");
    assert.equal(deletionResult.ok, true);
    assert.equal(providerCalls, 1, "the SOP binary was not deleted exactly once");
    assert.equal(categoryResponse.status, 200, "the queued category operation did not complete on its fresh snapshot");
    assert.equal(getState().sops[doomed.id], undefined,
      "the queued category rewrite resurrected an SOP whose binary was permanently deleted");
  });
});

describe("the library's confirmation shows the dependants instead of a bare warning", () => {
  const source = readFileSync(
    new URL("../src/app/portal/agency/sop-library/_SopLibrary.tsx", import.meta.url), "utf8",
  );

  it("no longer deletes a SOP behind window.confirm", () => {
    // The SOP delete path specifically — the guide delete confirm is a different
    // decision and is not in scope here.
    assert.doesNotMatch(source, /window\.confirm\(`Delete “\$\{sop\.title\}”/,
      "the SOP delete is back behind a bare confirm, which cannot name what it breaks");
    assert.match(source, /dependencies=\$\{encodeURIComponent\(sop\.id\)\}/,
      "the confirmation does not read the dependency preview");
  });

  it("a failed dependency read is never presented as 'nothing depends on this'", () => {
    assert.match(source, /readFailed/,
      "a failed inventory read has no distinct state, so it would render as an empty dependant list "
      + "— the exact false reassurance this dialog exists to prevent");
  });

  it("keeps the stranded records on screen after the deletion", () => {
    assert.match(source, /result\.stranded/,
      "the DELETE response's stranded inventory is discarded, so nothing tells the person which "
      + "records now hold an id that resolves to nothing");
  });

  // ── The two ways this dialog could go quiet instead of saying something ───
  //
  // Replacing `window.confirm` with a persistent overlay introduces states the
  // native dialog could not reach: a request that never completes now has
  // somewhere to get STUCK, and a refusal the route worded carefully now has
  // somewhere to be HIDDEN. Both would present as "nothing happened", which is
  // the failure mode this whole item is about.

  const between = (from: string, to: string): string => {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start + 1);
    assert.ok(start >= 0 && end > start, `could not slice the source between ${from} and ${to}`);
    return source.slice(start, end);
  };

  it("a request that never completes is a failed read, not a dialog stuck on 'checking'", () => {
    // `.catch(() => null)` on `response.json()` does NOT cover this: the throw
    // is on `fetch` itself, before there is a response to parse. Unhandled it
    // rejects out of the handler, leaving `loading: true` and the delete button
    // disabled forever with no explanation.
    assert.match(between("async function openRetirement", "async function confirmRetirement"), /try \{/,
      "the dependency preview's fetch can throw out of the handler, stranding the dialog on "
      + "'Checking what still uses this procedure…' with no way forward and nothing said");
    assert.match(between("async function confirmRetirement", "async function deleteCategory"), /try \{/,
      "the DELETE fetch can throw out of the handler, leaving the button on 'Deleting…' forever "
      + "— neither a deletion nor a stated failure");
  });

  it("states a refused deletion INSIDE the dialog, not behind it", () => {
    // The route's storage-refusal answer ("…is still stored — the storage
    // provider refused to remove its file…") is the message that matters most
    // here, and the dialog is `fixed inset-0`, so the page-level banner alone
    // is covered by it: the person clicks Delete and sees nothing change.
    const dialog = between('<Modal title="Delete SOP"', '<Modal title="What the deletion left behind"');
    assert.match(dialog, /error \? <div role="alert"/,
      "a refused deletion is only written to the page banner, which this full-screen dialog "
      + "covers — the refusal reads as nothing having happened");
  });
});
