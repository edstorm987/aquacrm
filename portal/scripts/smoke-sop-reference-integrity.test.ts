// Incoming SOP-reference integrity.
//
// Deletion is only half of a RESTRICT relationship. Every writer must also
// refuse an id that is absent (or belongs to another agency), otherwise a
// clean delete can be followed by a stale browser tab recreating the dangling
// link. These tests cover every persisted reference site and one real
// deletion/write race through a mounted route.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "sop-reference-integrity-smoke-secret";

import { withSession } from "./dev-console-request-scope";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

const { NextRequest } = require_("next/server") as typeof import("next/server");
const storage = require_("../src/server/storage") as typeof import("../src/server/storage");
const tenants = require_("../src/server/tenants") as typeof import("../src/server/tenants");
const tasks = require_("../src/server/tasks") as typeof import("../src/server/tasks");
const templates = require_("../src/server/taskTemplates") as typeof import("../src/server/taskTemplates");
const guides = require_("../src/engines/sop/server/sopGuides") as typeof import("../src/engines/sop/server/sopGuides");
const sops = require_("../src/engines/sop/server/sops") as typeof import("../src/engines/sop/server/sops");
const products = require_("../src/server/agencyProducts") as typeof import("../src/server/agencyProducts");
const development = require_("../src/server/developmentToolkit") as typeof import("../src/server/developmentToolkit");
const people = require_("../src/server/people") as typeof import("../src/server/people");
const { defaultProductInternalWorkspace } = require_("../src/lib/products/productInternalWorkspace") as typeof import("../src/lib/products/productInternalWorkspace");
const { SopReferenceValidationError } = require_("../src/engines/sop/server/sopReferences") as typeof import("../src/engines/sop/server/sopReferences");
const variationRoute = require_("../src/app/api/tenants/client-product-variation/route") as typeof import("../src/app/api/tenants/client-product-variation/route");
const guideRoute = require_("../src/app/api/portal/sop-guides/route") as typeof import("../src/app/api/portal/sop-guides/route");
const { createUser } = require_("../src/server/users") as typeof import("../src/server/users");
const { issueSession, SESSION_COOKIE_NAME } = require_("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const { deletePrivateObjectWithRecovery, privateObjectRequestHash } = require_("../src/lib/server/privateObjectLifecycle") as typeof import("../src/lib/server/privateObjectLifecycle");

function rejectsReference(operation: () => unknown, expectedField: RegExp): void {
  assert.throws(
    operation,
    (error: unknown) => error instanceof SopReferenceValidationError
      && error.code === "sop_reference_not_found"
      && expectedField.test(error.field),
  );
}

function workspaceWithSop(name: string, sopId: string) {
  const workspace = defaultProductInternalWorkspace({ name });
  workspace.processSteps = workspace.processSteps.map((step, index) => index === 0
    ? { ...step, sopIds: [sopId] }
    : step);
  return workspace;
}

test("every mounted SOP-reference writer uses the shared agency lifecycle lane", () => {
  const files = [
    "src/app/api/portal/tasks/route.ts",
    "src/app/api/portal/tasks/checklist/route.ts",
    "src/app/api/portal/tasks/templates/route.ts",
    "src/app/api/portal/sop-guides/route.ts",
    "src/app/api/portal/products/route.ts",
    "src/app/api/portal/development/route.ts",
    "src/app/api/portal/people/route.ts",
    "src/app/api/portal/external-ai/proposals/route.ts",
    "src/app/api/tenants/client-product-variation/route.ts",
    "src/app/api/tenants/client-operation-task/route.ts",
    "src/app/api/tenants/client-operations/route.ts",
    "src/app/api/tenants/client-tasks/route.ts",
    "src/server/automations.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(source, /withPortalStateTransaction\(privateObjectLifecycleLockKey\(/, `${file} can race SOP deletion`);
  }
});

test("all SOP owner writers reject missing and cross-agency ids before persistence", async () => {
  await storage.ensureHydrated();
  const mine = tenants.createAgency({ name: "SOP reference owner", slug: `sop-ref-owner-${Date.now()}` });
  const foreign = tenants.createAgency({ name: "SOP reference foreign", slug: `sop-ref-foreign-${Date.now()}` });
  const valid = sops.createWrittenSop({ agencyId: mine.id, title: "Valid procedure", content: "Steps", actorUserId: "seed" });
  const foreignSop = sops.createWrittenSop({ agencyId: foreign.id, title: "Private procedure", content: "Steps", actorUserId: "seed" });
  const invalidIds = ["sop_missing_reference", foreignSop.id];

  // AgencyTask.sopIds[]
  for (const sopId of invalidIds) {
    rejectsReference(() => tasks.createAgencyTask({
      agencyId: mine.id, title: `Invalid task ${sopId}`, sopIds: [sopId], createdBy: "owner",
    }), /task\.sopIds/);
  }

  // AgencyTask.checklist[].sopId
  const task = tasks.createAgencyTask({ agencyId: mine.id, title: "Checklist owner", createdBy: "owner" });
  for (const sopId of invalidIds) {
    rejectsReference(() => tasks.addTaskChecklistItem(mine.id, task.id, { label: "Invalid step", sopId }), /checklist/);
  }
  assert.equal(storage.getState().tasks[task.id]?.checklist?.length ?? 0, 0);

  // AgencyTaskTemplate.steps[].sopId
  for (const sopId of invalidIds) {
    rejectsReference(() => templates.saveTaskTemplate(mine.id, {
      name: `Invalid template ${sopId}`,
      steps: [{ label: "Read it", sopId }],
    }, "owner"), /taskTemplate\.steps/);
  }

  // SopGuide.sopIds[]
  for (const sopId of invalidIds) {
    rejectsReference(() => guides.createSopGuide({
      agencyId: mine.id, title: `Invalid guide ${sopId}`, sopIds: [sopId], actorUserId: "owner",
    }), /sopGuide\.sopIds/);
  }

  // AgencyProduct.sopIds[] and internalWorkspace.processSteps[].sopIds[]
  for (const sopId of invalidIds) {
    rejectsReference(() => products.createAgencyProduct(mine.id, {
      name: `Invalid product link ${sopId}`, sopIds: [sopId],
    }, "owner"), /product\.sopIds/);
    rejectsReference(() => products.createAgencyProduct(mine.id, {
      name: `Invalid product process ${sopId}`,
      internalWorkspace: workspaceWithSop("Invalid process", sopId),
    }, "owner"), /processSteps/);
  }

  // DevelopmentResource.sopIds[]
  for (const sopId of invalidIds) {
    rejectsReference(() => development.createDevelopmentResource(mine.id, {
      kind: "knowledge", title: `Invalid resource ${sopId}`, sopIds: [sopId],
    }, "owner"), /developmentResource\.sopIds/);
  }

  // PeopleTrainingAssignment.sopId
  const employee = people.createPeopleEmployee({
    agencyId: mine.id,
    actorUserId: "owner",
    name: "Trainee",
    email: `trainee-${mine.id}@example.test`,
    title: "Operator",
  });
  for (const sopId of invalidIds) {
    rejectsReference(() => people.savePeopleTraining({
      agencyId: mine.id,
      employeeId: employee.id,
      title: `Invalid training ${sopId}`,
      sopId,
      status: "assigned",
    }), /peopleTrainingAssignment\.sopId/);
  }

  // Valid references still round-trip, and every update path fails closed
  // without replacing the last valid owner row.
  const validTask = tasks.createAgencyTask({ agencyId: mine.id, title: "Valid task", sopIds: [valid.id], createdBy: "owner" });
  const validTemplate = templates.saveTaskTemplate(mine.id, {
    name: "Valid template",
    steps: [{ label: "Read it", sopId: valid.id }],
  }, "owner");
  assert.ok(validTemplate);
  const validGuide = guides.createSopGuide({
    agencyId: mine.id, title: "Valid guide", sopIds: [valid.id], actorUserId: "owner",
  });
  const validProduct = products.createAgencyProduct(mine.id, {
    name: "Valid product",
    sopIds: [valid.id],
    internalWorkspace: workspaceWithSop("Valid product", valid.id),
  }, "owner");
  const validResource = development.createDevelopmentResource(mine.id, {
    kind: "knowledge", title: "Valid resource", sopIds: [valid.id],
  }, "owner");
  const validTraining = people.savePeopleTraining({
    agencyId: mine.id,
    employeeId: employee.id,
    title: "Valid training",
    sopId: valid.id,
    status: "assigned",
  });

  for (const sopId of invalidIds) {
    rejectsReference(() => tasks.updateAgencyTask(mine.id, validTask.id, { sopIds: [sopId] }, "owner"), /task\.sopIds/);
    rejectsReference(() => templates.saveTaskTemplate(mine.id, {
      id: validTemplate.id,
      name: validTemplate.name,
      steps: [{ label: "Read it", sopId }],
    }, "owner"), /taskTemplate\.steps/);
    rejectsReference(() => guides.updateSopGuide(mine.id, validGuide.id, { sopIds: [sopId] }, "owner"), /sopGuide\.sopIds/);
    rejectsReference(() => products.updateAgencyProduct(mine.id, validProduct.id, { sopIds: [sopId] }, "owner"), /product\.sopIds/);
    rejectsReference(() => products.updateAgencyProduct(mine.id, validProduct.id, {
      internalWorkspace: workspaceWithSop(validProduct.name, sopId),
    }, "owner"), /processSteps/);
    rejectsReference(() => development.updateDevelopmentResource(mine.id, validResource.id, { sopIds: [sopId] }, "owner"), /developmentResource\.sopIds/);
    rejectsReference(() => people.savePeopleTraining({
      id: validTraining.id,
      agencyId: mine.id,
      employeeId: employee.id,
      title: validTraining.title,
      sopId,
      status: validTraining.status,
    }), /peopleTrainingAssignment\.sopId/);
  }

  assert.deepEqual(validTask.sopIds, [valid.id]);
  assert.deepEqual(storage.getState().taskTemplates[validTemplate.id]?.steps.map(step => step.sopId), [valid.id]);
  assert.deepEqual(storage.getState().sopGuides[validGuide.id]?.sopIds, [valid.id]);
  assert.deepEqual(storage.getState().agencyProducts[validProduct.id]?.sopIds, [valid.id]);
  assert.deepEqual(storage.getState().developmentResources[validResource.id]?.sopIds, [valid.id]);
  assert.equal(storage.getState().peopleTrainingAssignments[validTraining.id]?.sopId, valid.id);
});

test("the client-variation writer returns 422 for top-level and nested invalid SOPs", async () => {
  await storage.ensureHydrated();
  const mine = tenants.createAgency({ name: "Variation SOP owner", slug: `variation-sop-owner-${Date.now()}` });
  const foreign = tenants.createAgency({ name: "Variation SOP foreign", slug: `variation-sop-foreign-${Date.now()}` });
  const foreignSop = sops.createWrittenSop({ agencyId: foreign.id, title: "Foreign", content: "Steps", actorUserId: "seed" });
  const product = products.createAgencyProduct(mine.id, { name: "Managed service" }, "owner");
  const client = tenants.createClient(mine.id, {
    name: "Variation client",
    metadata: { portalSelectedProductIds: [product.id], portalProductIds: [product.id] },
  });
  const owner = createUser({
    agencyId: mine.id,
    role: "agency-owner",
    name: "Owner",
    email: `variation-owner-${mine.id}@example.test`,
    password: "Variation-owner-1!",
  });
  const token = issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: mine.id,
    agencyIds: [mine.id],
    activeAgencyId: mine.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  await storage.flushPendingWrites();

  const call = (body: Record<string, unknown>) => withSession(token, () => variationRoute.POST(new NextRequest(
    "http://localhost/api/tenants/client-product-variation",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", clientId: client.id, productId: product.id, ...body }),
    },
  )));

  const missing = await call({ sopIds: ["sop_missing_variation"] });
  assert.equal(missing.status, 422);
  assert.equal((await missing.json() as { reason?: string }).reason, "sop_reference_not_found");

  const crossAgencyNested = await call({
    internalWorkspace: workspaceWithSop(product.name, foreignSop.id),
  });
  assert.equal(crossAgencyNested.status, 422);
  const body = await crossAgencyNested.json() as { reason?: string; field?: string };
  assert.equal(body.reason, "sop_reference_not_found");
  assert.match(body.field ?? "", /processSteps/);
  assert.deepEqual(storage.getState().clients[client.id]?.metadata?.clientProductVariations ?? {}, {});
});

test("a mounted guide write waits for SOP deletion, re-reads, and refuses the stale id", async () => {
  await storage.ensureHydrated();
  const agency = tenants.createAgency({ name: "SOP write race", slug: `sop-write-race-${Date.now()}` });
  const owner = createUser({
    agencyId: agency.id,
    role: "agency-owner",
    name: "Owner",
    email: `sop-race-owner-${agency.id}@example.test`,
    password: "Sop-race-owner-1!",
  });
  const token = issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: owner.sessionRev ?? 0,
  });
  const doomed = sops.createWrittenSop({
    agencyId: agency.id, title: "Race procedure", content: "Steps", actorUserId: owner.id,
  });
  storage.mutate(state => {
    state.sops[doomed.id] = {
      ...state.sops[doomed.id]!,
      storageProvider: "local",
      storageKey: `${agency.id}/${doomed.id}.pdf`,
    };
  });
  await storage.flushPendingWrites();

  let checkpointResolve!: () => void;
  let releaseResolve!: () => void;
  const checkpointed = new Promise<void>(resolve => { checkpointResolve = resolve; });
  const release = new Promise<void>(resolve => { releaseResolve = resolve; });
  const deletion = deletePrivateObjectWithRecovery({
    agencyId: agency.id,
    purpose: "sop",
    objectId: doomed.id,
    requestHash: privateObjectRequestHash([agency.id, doomed.id, "reference-race-delete"]),
    localDirectory: "sop-uploads",
    prepare(state) {
      const current = state.sops[doomed.id];
      assert.ok(current);
      delete state.sops[doomed.id];
      return { snapshot: current, storageProvider: current.storageProvider, storageKey: current.storageKey };
    },
    async afterCheckpoint() {
      checkpointResolve();
      await release;
    },
    providers: { local: async () => undefined },
  });
  await checkpointed;

  let writerSettled = false;
  const writer = guideRoute.POST(new NextRequest("http://localhost/api/portal/sop-guides", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: "Stale guide", sopIds: [doomed.id] }),
  }));
  void writer.then(() => { writerSettled = true; }, () => { writerSettled = true; });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(writerSettled, false, "the writer crossed the deletion checkpoint instead of waiting on the lifecycle lane");
  releaseResolve();

  const [deleted, response] = await Promise.all([deletion, writer]);
  assert.equal(deleted.ok, true);
  assert.equal(response.status, 422);
  const body = await response.json() as { reason?: string };
  assert.equal(body.reason, "sop_reference_not_found");
  assert.equal(storage.getState().sops[doomed.id], undefined);
  assert.equal(Object.values(storage.getState().sopGuides).some(guide => guide.title === "Stale guide"), false);
});
