process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "product-stage-convergence-smoke-secret";

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, test } from "node:test";

const require_ = createRequire(import.meta.url);
let sessionCookie = "";
const headersId = require_.resolve("next/headers");
require_.cache[headersId] = {
  id: headersId,
  filename: headersId,
  loaded: true,
  paths: [],
  children: [],
  exports: {
    cookies: async () => ({
      get: (name: string) => sessionCookie && name === "lk_session_v1" ? { name, value: sessionCookie } : undefined,
      getAll: () => sessionCookie ? [{ name: "lk_session_v1", value: sessionCookie }] : [],
      has: (name: string) => Boolean(sessionCookie) && name === "lk_session_v1",
    }),
    headers: async () => new Headers(),
    draftMode: async () => ({ isEnabled: false }),
  },
} as never;

const { POST: moveFromBoard } = require_("../src/app/api/portal/pipelines/move-client/route") as typeof import("../src/app/api/portal/pipelines/move-client/route");
const { POST: moveFromProcess } = require_("../src/app/api/tenants/client-product-process/route") as typeof import("../src/app/api/tenants/client-product-process/route");
const { POST: moveFromPortal } = require_("../src/app/api/tenants/product-workspaces/route") as typeof import("../src/app/api/tenants/product-workspaces/route");
const auth = require_("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const stageTruth = require_("../src/lib/products/clientProductStageTruth") as typeof import("../src/lib/products/clientProductStageTruth");
const productWorkspace = require_("../src/server/productWorkspaces") as typeof import("../src/server/productWorkspaces");
const activity = require_("../src/server/activity") as typeof import("../src/server/activity");
const agencyProducts = require_("../src/server/agencyProducts") as typeof import("../src/server/agencyProducts");
const storage = require_("../src/server/storage") as typeof import("../src/server/storage");
const tenants = require_("../src/server/tenants") as typeof import("../src/server/tenants");

before(async () => {
  await storage.ensureHydrated();
});

let sequence = 0;

function request(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawProductWorkspace(client: NonNullable<ReturnType<typeof tenants.getClientForAgency>>, productId: string) {
  return ((client.metadata?.portalProductWorkspaces as Record<string, { stage?: string }> | undefined) ?? {})[productId];
}

function workspaceRevision(world: World, productId: string): number {
  const client = tenants.getClientForAgency(world.agencyId, world.clientId);
  assert.ok(client);
  const workspace = productWorkspace.clientProductWorkspaces(client).find(item => item.productId === productId);
  assert.ok(workspace);
  return workspace.revision;
}

function assertConverged(world: World, productId: string, stageId: string, portalMode: string, accountStage: string) {
  const client = tenants.getClientForAgency(world.agencyId, world.clientId);
  assert.ok(client);
  const process = client.metadata?.clientProductProcess as Record<string, { currentStageId?: string }>;
  const pipeline = client.metadata?.productPipelineStages as Record<string, string>;
  assert.equal(process[productId]?.currentStageId, stageId, "process stage diverged");
  assert.equal(pipeline[productId], stageId, "agency board stage diverged");
  assert.equal(rawProductWorkspace(client, productId)?.stage, portalMode, "stored portal workspace stage diverged");
  assert.equal(productWorkspace.clientProductWorkspaces(client).find(item => item.productId === productId)?.stage, portalMode,
    "derived customer workspace stage diverged");
  assert.equal(client.metadata?.portalMode, portalMode, "overall portal mode diverged");
  assert.equal(client.stage, accountStage, "account lifecycle diverged");
  assert.equal(stageTruth.resolveClientProductStage(client, world.products.find(product => product.id === productId)!).stageId, stageId);
}

interface World {
  agencyId: string;
  clientId: string;
  products: ReturnType<typeof agencyProducts.listAgencyProducts>;
}

function seedWorld(productCount = 1): World {
  sequence += 1;
  const ownerEmail = `product-stage-${sequence}@example.test`;
  const agency = tenants.createAgency({ name: `Product Stage ${sequence}`, ownerEmail });
  const first = agencyProducts.ensureDefaultAgencyProducts(agency.id)[0]!;
  const products = [first];
  if (productCount > 1) {
    products.push(agencyProducts.createAgencyProduct(agency.id, {
      name: `Content service ${sequence}`,
      category: "Marketing",
      portalTemplateKey: "content",
      deliverables: ["Campaign plan"],
    }, `product-stage-user-${sequence}`));
  }
  const client = tenants.createClient(agency.id, {
    name: `Stage Client ${sequence}`,
    ownerEmail: `client-${sequence}@example.test`,
    stage: "aqua-epic-intro",
    metadata: {
      portalMode: "onboarding",
      portalSelectedProductIds: products.map(product => product.id),
      portalProductIds: products.map(product => product.id),
    },
  });
  sessionCookie = auth.issueSession({
    userId: `product-stage-user-${sequence}`,
    email: ownerEmail,
    role: "agency-owner",
    agencyId: agency.id,
  });
  return { agencyId: agency.id, clientId: client.id, products };
}

function lifecycle(product: World["products"][number]) {
  return product.internalWorkspace!.lifecycleStages;
}

describe("canonical product-stage transition", () => {
  test("the real agency board route moves process, portal and account together and replay is quiet", async () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const finalStage = lifecycle(product).at(-1)!;
    const initialClient = tenants.getClientForAgency(world.agencyId, world.clientId)!;
    const initialWorkspaces = productWorkspace.clientProductWorkspaces(initialClient);
    const retainedCheck = Object.values(initialWorkspaces[0]!.pages)[0]!.checklist[0]!;
    retainedCheck.complete = true;
    retainedCheck.completedAt = Date.now();
    retainedCheck.completedBy = "product-stage-test";
    assert.ok(productWorkspace.saveClientProductWorkspaces(initialClient, initialWorkspaces));
    const first = await moveFromBoard(request("/api/portal/pipelines/move-client", {
      clientId: world.clientId,
      productKey: product.id,
      columnId: finalStage.id,
      expectedRevision: workspaceRevision(world, product.id),
    }));
    assert.equal(first.status, 200);
    const firstPayload = await first.json() as { changed: boolean; workspaceRevision: number };
    assert.equal(firstPayload.changed, true);
    assertConverged(world, product.id, finalStage.id, "maintenance", "aqua-mastery");
    const retainedWorkspace = productWorkspace.clientProductWorkspaces(
      tenants.getClientForAgency(world.agencyId, world.clientId)!,
    )[0]!;
    assert.equal(Object.values(retainedWorkspace.pages)[0]!.checklist[0]!.complete, true,
      "stage convergence erased existing checklist progress");

    const replay = await moveFromBoard(request("/api/portal/pipelines/move-client", {
      clientId: world.clientId,
      productKey: product.id,
      columnId: finalStage.id,
      expectedRevision: firstPayload.workspaceRevision,
    }));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { changed: boolean }).changed, false);
    assert.equal(activity.listActivity({ agencyId: world.agencyId, clientId: world.clientId, limit: 20 })
      .filter(entry => entry.action === "client_product_stage.moved").length, 1,
    "an identical retry emitted a second transition activity");
  });

  test("the real client process route updates the board and portal projections", async () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const target = lifecycle(product)[1]!;
    const response = await moveFromProcess(request("/api/tenants/client-product-process", {
      action: "set-stage",
      clientId: world.clientId,
      productId: product.id,
      stageId: target.id,
      expectedRevision: workspaceRevision(world, product.id),
    }));
    assert.equal(response.status, 200);
    assertConverged(world, product.id, target.id, target.portalMode, "aqua-brand-builder");
  });

  test("the real portal workspace route maps portal mode back to the same lifecycle stage", async () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const review = lifecycle(product).find(stage => stage.portalMode === "developed-launch")!;
    const response = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "set-stage",
      clientId: world.clientId,
      productId: product.id,
      stage: "developed-launch",
      expectedRevision: workspaceRevision(world, product.id),
    }));
    assert.equal(response.status, 200);
    const payload = await response.json() as { serviceStageId: string };
    assert.equal(payload.serviceStageId, review.id);
    assertConverged(world, product.id, review.id, "developed-launch", "aqua-traffic");
  });

  test("account and programme portal advance only when every assigned product has caught up", async () => {
    const world = seedWorld(2);
    const [website, content] = world.products;
    const websiteLive = lifecycle(website!).at(-1)!;
    const contentLive = lifecycle(content!).at(-1)!;

    const first = await moveFromBoard(request("/api/portal/pipelines/move-client", {
      clientId: world.clientId,
      productKey: website!.id,
      columnId: websiteLive.id,
      expectedRevision: workspaceRevision(world, website!.id),
    }));
    assert.equal(first.status, 200);
    let client = tenants.getClientForAgency(world.agencyId, world.clientId)!;
    assert.equal(client.stage, "aqua-epic-intro");
    assert.equal(client.metadata?.portalMode, "onboarding");

    const second = await moveFromBoard(request("/api/portal/pipelines/move-client", {
      clientId: world.clientId,
      productKey: content!.id,
      columnId: contentLive.id,
      expectedRevision: workspaceRevision(world, content!.id),
    }));
    assert.equal(second.status, 200);
    client = tenants.getClientForAgency(world.agencyId, world.clientId)!;
    assert.equal(client.stage, "aqua-mastery");
    assert.equal(client.metadata?.portalMode, "maintenance");
    assert.equal(stageTruth.resolveClientProductStage(client, website!).stageId, websiteLive.id);
    assert.equal(stageTruth.resolveClientProductStage(client, content!).stageId, contentLive.id);
  });

  test("a stale workspace writer gets the latest record and cannot erase the winner", async () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const workspace = productWorkspace.clientProductWorkspaces(
      tenants.getClientForAgency(world.agencyId, world.clientId)!,
    )[0]!;
    const pageId = Object.keys(workspace.pages)[0]!;
    const sharedRevision = workspace.revision;

    const winner = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "add-update",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      message: "The first writer must survive.",
      expectedRevision: sharedRevision,
    }));
    assert.equal(winner.status, 200);

    const stale = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "save-fields",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      fields: { brief: "stale draft" },
      expectedRevision: sharedRevision,
    }));
    assert.equal(stale.status, 409);
    const conflict = await stale.json() as { workspace: { revision: number; updates: Array<{ message: string }> } };
    assert.equal(conflict.workspace.revision, sharedRevision + 1);
    assert.equal(conflict.workspace.updates[0]?.message, "The first writer must survive.");

    const retry = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "save-fields",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      fields: { brief: "reviewed retry" },
      expectedRevision: conflict.workspace.revision,
    }));
    assert.equal(retry.status, 200);
    const saved = await retry.json() as { workspace: { pages: Record<string, { fields: Record<string, string> }>; updates: Array<{ message: string }> } };
    assert.equal(saved.workspace.pages[pageId]?.fields.brief, "reviewed retry");
    assert.equal(saved.workspace.updates[0]?.message, "The first writer must survive.");
  });

  test("a stale stage move cannot split process, board, portal and account state", async () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const stages = lifecycle(product);
    const sharedRevision = workspaceRevision(world, product.id);
    const winnerStage = stages[1]!;
    const staleStage = stages[2]!;

    const winner = await moveFromBoard(request("/api/portal/pipelines/move-client", {
      clientId: world.clientId,
      productKey: product.id,
      columnId: winnerStage.id,
      expectedRevision: sharedRevision,
    }));
    assert.equal(winner.status, 200);

    const stale = await moveFromProcess(request("/api/tenants/client-product-process", {
      action: "set-stage",
      clientId: world.clientId,
      productId: product.id,
      stageId: staleStage.id,
      expectedRevision: sharedRevision,
    }));
    assert.equal(stale.status, 409);
    const conflict = await stale.json() as { workspaceRevision: number };
    assertConverged(world, product.id, winnerStage.id, winnerStage.portalMode, "aqua-brand-builder");

    const retry = await moveFromProcess(request("/api/tenants/client-product-process", {
      action: "set-stage",
      clientId: world.clientId,
      productId: product.id,
      stageId: staleStage.id,
      expectedRevision: conflict.workspaceRevision,
    }));
    assert.equal(retry.status, 200);
    assertConverged(world, product.id, staleStage.id, staleStage.portalMode, "aqua-traffic");
  });

  test("collection status and file visibility commit together after a conflict", async () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const initialWorkspace = productWorkspace.clientProductWorkspaces(
      tenants.getClientForAgency(world.agencyId, world.clientId)!,
    )[0]!;
    const pageId = Object.keys(initialWorkspace.pages)[0]!;
    const fileId = `file-${sequence}`;
    assert.ok(tenants.updateClient(world.agencyId, world.clientId, {
      metadata: {
        files: [{
          id: fileId,
          name: "proof.pdf",
          url: "https://example.test/proof.pdf",
          category: "deliverable",
          uploadedAt: Date.now(),
          customerVisible: false,
        }],
      },
    }));

    const created = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "create-collection",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      title: "Final delivery",
      expectedRevision: initialWorkspace.revision,
    }));
    assert.equal(created.status, 200);
    const createdPayload = await created.json() as { workspace: { revision: number; collections: Array<{ id: string }> } };
    const collectionId = createdPayload.workspace.collections[0]!.id;

    const attached = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "attach-file",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      collectionId,
      fileId,
      expectedRevision: createdPayload.workspace.revision,
    }));
    assert.equal(attached.status, 200);
    const attachedPayload = await attached.json() as { workspace: { revision: number } };
    const sharedRevision = attachedPayload.workspace.revision;

    const winner = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "add-update",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      message: "Concurrent winner",
      expectedRevision: sharedRevision,
    }));
    assert.equal(winner.status, 200);

    const stale = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "set-collection-status",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      collectionId,
      status: "delivered",
      expectedRevision: sharedRevision,
    }));
    assert.equal(stale.status, 409);
    let client = tenants.getClientForAgency(world.agencyId, world.clientId)!;
    let currentWorkspace = productWorkspace.clientProductWorkspaces(client)[0]!;
    assert.equal(currentWorkspace.collections.find(item => item.id === collectionId)?.status, "draft");
    assert.equal((client.metadata?.files as Array<{ id: string; customerVisible?: boolean }>).find(file => file.id === fileId)?.customerVisible, false);

    const conflict = await stale.json() as { workspace: { revision: number } };
    const retry = await moveFromPortal(request("/api/tenants/product-workspaces", {
      action: "set-collection-status",
      clientId: world.clientId,
      productId: product.id,
      pageId,
      collectionId,
      status: "delivered",
      expectedRevision: conflict.workspace.revision,
    }));
    assert.equal(retry.status, 200);
    client = tenants.getClientForAgency(world.agencyId, world.clientId)!;
    currentWorkspace = productWorkspace.clientProductWorkspaces(client)[0]!;
    assert.equal(currentWorkspace.collections.find(item => item.id === collectionId)?.status, "delivered");
    assert.equal((client.metadata?.files as Array<{ id: string; customerVisible?: boolean }>).find(file => file.id === fileId)?.customerVisible, true);
  });

  test("the canonical process stage wins over stale legacy board and portal mirrors", () => {
    const world = seedWorld();
    const product = world.products[0]!;
    const [onboarding, production] = lifecycle(product);
    const client = tenants.getClientForAgency(world.agencyId, world.clientId)!;
    const stale = {
      ...client,
      metadata: {
        ...client.metadata,
        clientProductProcess: { [product.id]: { completedStepIds: [], currentStageId: production!.id } },
        productPipelineStages: { [product.id]: onboarding!.id },
        portalProductWorkspaces: { [product.id]: { stage: "onboarding" } },
      },
    };
    assert.deepEqual(stageTruth.resolveClientProductStage(stale, product), {
      stageId: production!.id,
      portalMode: production!.portalMode,
      source: "process",
    });
  });
});
