import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

import { PORTAL_PRODUCT_CATALOG, type PortalProductSelection } from "../src/lib/portal/portalProducts";
import { BESPOKE_PRODUCT_MODULES } from "../src/lib/portal/portalBespokeProductModules";
import { portalProductModule } from "../src/lib/portal/portalProductModules";
import {
  cleanPortalProductWorkspace,
  createPortalProductWorkspace,
  mergePortalProductWorkspaceStore,
  portalWorkspacePageFields,
  portalWorkspaceProgress,
} from "../src/lib/portal/portalProductWorkspaces";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type ProductWorkspaces = typeof import("../src/server/productWorkspaces");

let storage: Storage;
let tenants: Tenants;
let productWorkspaces: ProductWorkspaces;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  productWorkspaces = await import("../src/server/productWorkspaces");
});

describe("product workspace application model", () => {
  it("creates a complete working application for every established product", () => {
    const specialistProducts: PortalProductSelection[] = Object.keys(BESPOKE_PRODUCT_MODULES).map((name, index) => ({
      id: `specialist-${index}`,
      name,
      description: `${name} specialist delivery.`,
      deliverables: ["Primary delivery", "Review record", "Handover"],
    }));

    for (const product of [...PORTAL_PRODUCT_CATALOG, ...specialistProducts]) {
      const module = portalProductModule(product);
      const workspace = createPortalProductWorkspace(product, "onboarding", 1_000);
      assert.equal(workspace.productId, product.id);
      assert.equal(Object.keys(workspace.pages).length, 3, `${product.name} should own three persisted workspaces`);
      assert.equal(workspace.collections.length, 1, `${product.name} should have a seeded delivery collection`);
      assert.equal(workspace.collections[0].pageId, module.pages[2].id);
      for (const page of module.pages) {
        const state = workspace.pages[page.id];
        assert.equal(state.checklist.length, 4);
        assert.equal(state.outputs.length, 4);
        assert.equal(portalWorkspacePageFields(product, page).length, 4);
      }
    }
  });

  it("gives photography a proofing gallery and a purpose-built brief", () => {
    const photography = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "photography")!;
    const module = portalProductModule(photography);
    const workspace = createPortalProductWorkspace(photography, "designing", 2_000);
    assert.equal(workspace.collections[0].title, "Photography gallery");
    assert.match(workspace.collections[0].description ?? "", /Private proofs/);
    assert.equal(workspace.collections[0].downloadsEnabled, false);
    assert.equal(workspace.collections[0].watermarkEnabled, true);
    assert.equal(workspace.collections[0].watermarkLabel, "PRIVATE CLIENT PROOF");
    assert.deepEqual(portalWorkspacePageFields(photography, module.pages[0]).map(field => field.label), [
      "Purpose and usage",
      "People or subjects",
      "Locations and access",
      "Timing and deadline",
    ]);
  });

  it("cleans and migrates saved state without losing completed work or new module fields", () => {
    const website = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "website")!;
    const module = portalProductModule(website);
    const saved = createPortalProductWorkspace(website, "designing", 3_000);
    saved.pages[module.pages[0].id].checklist[0] = {
      ...saved.pages[module.pages[0].id].checklist[0],
      complete: true,
      completedAt: 3_100,
      completedBy: "customer@example.test",
      completedByActor: "customer",
    };
    saved.pages[module.pages[0].id].fields[`${module.pages[0].id}-field-1`] = "Create qualified enquiries.";
    saved.pages[module.pages[0].id].outputs[0].status = "approved";
    const cleaned = cleanPortalProductWorkspace(saved, website, "onboarding", 4_000);
    assert.equal(cleaned.stage, "designing");
    assert.equal(cleaned.pages[module.pages[0].id].checklist[0].complete, true);
    assert.equal(cleaned.pages[module.pages[0].id].fields[`${module.pages[0].id}-field-1`], "Create qualified enquiries.");
    assert.equal(cleaned.pages[module.pages[0].id].outputs[0].status, "approved");
    assert.ok(portalWorkspaceProgress(cleaned) > 0);
  });

  it("persists independent product stages and preserves hidden products for later re-use", async () => {
    await storage.ensureHydrated();
    await storage.reset();
    const agency = tenants.createAgency({ name: "Product Workspace Test", slug: "product-workspace-test" });
    const photography = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "photography")!;
    const website = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === "website")!;
    const client = tenants.createClient(agency.id, {
      name: "Packaged Client",
      metadata: { portalProducts: [photography, website], portalMode: "onboarding" },
    });

    const workspaces = productWorkspaces.clientProductWorkspaces(client);
    const photoWorkspace = workspaces.find(workspace => workspace.productId === photography.id)!;
    const websiteWorkspace = workspaces.find(workspace => workspace.productId === website.id)!;
    photoWorkspace.stage = "developed-launch";
    photoWorkspace.updates.push({ id: "update_photo", pageId: "gallery", message: "Select the final images.", actor: "agency", author: "Aqua team", createdAt: 5_000 });
    websiteWorkspace.stage = "designing";
    assert.ok(productWorkspaces.saveClientProductWorkspaces(client, workspaces));

    const persisted = tenants.getClientForAgency(agency.id, client.id)!;
    assert.equal(productWorkspaces.clientProductWorkspaces(persisted).find(item => item.productId === photography.id)?.stage, "developed-launch");
    assert.equal(productWorkspaces.clientProductWorkspaces(persisted).find(item => item.productId === website.id)?.stage, "designing");

    const stored = persisted.metadata?.portalProductWorkspaces;
    const websiteOnly = productWorkspaces.reconcileClientProductWorkspaces(persisted, [website], "onboarding");
    assert.ok(websiteOnly[photography.id], "hidden photography state should remain in the store");
    const merged = mergePortalProductWorkspaceStore(stored, [cleanPortalProductWorkspace(websiteOnly[website.id], website)]);
    tenants.updateClient(agency.id, client.id, { metadata: { portalProducts: [photography, website], portalProductWorkspaces: merged } });
    const restored = productWorkspaces.clientProductWorkspaces(tenants.getClientForAgency(agency.id, client.id)!);
    assert.equal(restored.find(item => item.productId === photography.id)?.updates[0]?.message, "Select the final images.");
  });

  it("wires role-aware APIs, authenticated uploads and the live workspace surface", async () => {
    const [route, upload, content, application, views, preview, control] = await Promise.all([
      readFile(new URL("../src/app/api/tenants/product-workspaces/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-files/upload/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/client-files/content/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_ProductWorkspaceApplication.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/client-preview/[clientId]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/tenants/customer-portal-control/route.ts", import.meta.url), "utf8"),
    ]);
    assert.match(route, /requireRoleForClient/);
    assert.match(route, /set-stage/);
    assert.match(route, /toggle-check/);
    assert.match(route, /request-decision/);
    assert.match(route, /respond-decision/);
    assert.match(route, /attach-file/);
    assert.match(route, /asset-response/);
    assert.match(route, /update-collection/);
    assert.match(route, /customerVisible/);
    assert.match(upload, /50 \* 1024 \* 1024/);
    assert.match(upload, /productId/);
    assert.match(content, /searchParams\.get\("download"\) === "1"/);
    assert.match(content, /downloads are not enabled/);
    assert.match(content, /watermarkedProof/);
    assert.match(content, /image\/webp/);
    assert.match(content, /PRIVATE CLIENT PROOF/);
    assert.match(content, /collection\?\.watermarkEnabled === true/);
    assert.match(application, /Photography galleries|galleries/);
    assert.match(application, /Upload photographs or media/);
    assert.match(application, /Approve collection/);
    assert.match(application, /Selection limit|selectionLimit/);
    assert.match(application, /Watermark on/);
    assert.match(views, /ProductWorkspaceApplication/);
    assert.match(views, /portalWorkspaceProgress/);
    assert.match(preview, /workspaceRole=\{manage \? "agency" : "preview"\}/);
    assert.match(control, /reconcileClientProductWorkspaces/);
  });
});

describe("collection upload batch accounting", () => {
  type Batch = typeof import("../src/lib/portal/productWorkspaceUploadBatch");
  let batch: Batch;
  const candidate = (name: string) => ({ name, size: name.length, lastModified: 1 } as unknown as File);

  before(async () => {
    batch = await import("../src/lib/portal/productWorkspaceUploadBatch");
  });

  function transport(failOn?: string) {
    const uploaded: string[] = [];
    const committed: string[] = [];
    return {
      uploaded,
      committed,
      runner: {
        upload: async (file: File) => {
          uploaded.push(file.name);
          if (file.name === failOn) throw new Error(`Could not upload ${file.name}.`);
          return { id: `f_${file.name}`, name: file.name };
        },
        attach: async (_uploaded: { id: string; name: string }, workspace: { revision: number }) => ({ revision: workspace.revision + 1 }),
        onFileCommitted: (_uploaded: { id: string; name: string }, _workspace: { revision: number }, key: string) => {
          committed.push(key);
        },
      },
    };
  }

  it("declines the files beyond the cap out loud instead of dropping them silently", async () => {
    const selection = Array.from({ length: 31 }, (_, index) => candidate(`shot-${index}.jpg`));
    const { runner, uploaded } = transport();
    const outcome = await batch.runWorkspaceUploadBatch(selection, { revision: 1 }, runner);

    assert.equal(outcome.selected, 31);
    assert.equal(outcome.attempted, batch.WORKSPACE_UPLOAD_BATCH_LIMIT);
    assert.equal(outcome.declined, 1);
    assert.equal(uploaded.length, batch.WORKSPACE_UPLOAD_BATCH_LIMIT, "the 31st file must not be uploaded");
    assert.equal(outcome.completed.length, 30);

    const notice = batch.workspaceUploadBatchNotice(outcome, "Final delivery");
    assert.match(notice, /30 files added to Final delivery\./);
    assert.doesNotMatch(notice, /31 files added/, "the notice must report what landed, not what was selected");
    assert.match(notice, /1 not sent/);
    assert.match(notice, /30 files per upload is the limit/);
  });

  it("keeps the files that already landed when a later file fails, and names where it stopped", async () => {
    const selection = [candidate("a.jpg"), candidate("b.jpg"), candidate("c.jpg")];
    const { runner, committed } = transport("b.jpg");
    const outcome = await batch.runWorkspaceUploadBatch(selection, { revision: 1 }, runner);

    assert.equal(outcome.completed.length, 1);
    assert.equal(outcome.failedFile, "b.jpg");
    assert.equal(outcome.workspace.revision, 2, "the converged file's workspace revision must be retained");
    assert.deepEqual(committed, [batch.workspaceUploadFileKey(selection[0])], "each converged file is committed before the next is started");

    const notice = batch.workspaceUploadBatchNotice(outcome, "Final delivery");
    assert.match(notice, /1 file added to Final delivery\./);
    assert.match(notice, /Stopped at b\.jpg/);
  });

  it("resumes a part-failed batch instead of uploading the completed files a second time", async () => {
    const selection = [candidate("a.jpg"), candidate("b.jpg"), candidate("c.jpg")];
    const completedKeys = new Set<string>();
    const first = transport("b.jpg");
    first.runner.onFileCommitted = (_uploaded, _workspace, key: string) => { completedKeys.add(key); };
    const failed = await batch.runWorkspaceUploadBatch(selection, { revision: 1 }, first.runner);
    assert.equal(failed.error !== undefined, true);
    assert.deepEqual([...completedKeys], [batch.workspaceUploadFileKey(selection[0])]);

    // The person retries with the SAME selection once the fault clears.
    const retry = transport();
    const outcome = await batch.runWorkspaceUploadBatch(selection, failed.workspace, retry.runner, { alreadyCompleted: completedKeys });

    assert.deepEqual(retry.uploaded, ["b.jpg", "c.jpg"], "a.jpg already landed and must not be uploaded twice");
    assert.equal(outcome.skipped, 1);
    assert.equal(outcome.completed.length, 2);
    assert.equal(outcome.error, undefined);

    const notice = batch.workspaceUploadBatchNotice(outcome, "Final delivery");
    assert.match(notice, /2 files added to Final delivery\./);
    assert.match(notice, /1 already uploaded was skipped\./);
  });

  it("does not spend the 30-file retry allowance on files that already converged", async () => {
    const selection = Array.from({ length: 31 }, (_, index) => candidate(`shot-${index}.jpg`));
    const completedKeys = new Set(selection.slice(0, 20).map(file => batch.workspaceUploadFileKey(file)));
    const retry = transport();
    const outcome = await batch.runWorkspaceUploadBatch(selection, { revision: 20 }, retry.runner, { alreadyCompleted: completedKeys });

    assert.equal(outcome.skipped, 20);
    assert.equal(outcome.attempted, 11);
    assert.equal(outcome.declined, 0, "all 11 outstanding files fit even though the original selection had 31 entries");
    assert.equal(outcome.completed.length, 11);
    assert.deepEqual(retry.uploaded, selection.slice(20).map(file => file.name));
  });

  it("rebuilds completed keys from durable attachment truth after a reload", () => {
    const records = [
      { id: "attached-explicit", name: "a.jpg", collectionId: "gallery", uploadKey: "a:1:1", workspaceAttachmentState: "attached" as const },
      { id: "attached-legacy", name: "b.jpg", collectionId: "gallery", uploadKey: "b:1:1" },
      { id: "pending", name: "c.jpg", collectionId: "gallery", uploadKey: "c:1:1", workspaceAttachmentState: "pending" as const },
      { id: "other", name: "d.jpg", collectionId: "other", uploadKey: "d:1:1", workspaceAttachmentState: "attached" as const },
    ];
    const completed = batch.workspaceUploadCompletedKeys(records, "gallery", new Set(["attached-legacy"]));
    assert.deepEqual([...completed].sort(), ["a:1:1", "b:1:1"]);
  });

  it("does not treat a removed collection asset as completed after reload", async () => {
    const removed = {
      id: "removed-file",
      name: "removed.jpg",
      collectionId: "gallery",
      uploadKey: "removed.jpg:1:1",
      workspaceAttachmentState: "pending" as const,
    };
    const completed = batch.workspaceUploadCompletedKeys([removed], "gallery", new Set());
    assert.deepEqual([...completed], [], "a pending file must be eligible for collection re-attachment");

    const workspaceRoute = await readFile(new URL("../src/app/api/tenants/product-workspaces/route.ts", import.meta.url), "utf8");
    const removeStart = workspaceRoute.indexOf('} else if (action === "remove-asset")');
    const responseStart = workspaceRoute.indexOf('} else if (action === "asset-response")', removeStart);
    const removeBranch = workspaceRoute.slice(removeStart, responseStart);
    assert.match(removeBranch, /attachmentState: "pending"/, "removing an asset must invalidate its durable completion marker");
  });

  it("replays only the same durable file in the same workspace scope", () => {
    const record = {
      id: "file-1",
      name: "proof.jpg",
      size: 42,
      contentType: "image/jpeg",
      contentSha256: "a".repeat(64),
      productId: "product",
      workspacePageId: "page",
      collectionId: "gallery",
      uploadKey: "proof.jpg:42:1",
      workspaceAttachmentState: "pending" as const,
    };
    const replay = batch.resolveWorkspaceUploadReplay([record], {
      name: record.name,
      size: record.size,
      contentType: record.contentType,
      contentSha256: record.contentSha256,
      productId: record.productId,
      workspacePageId: record.workspacePageId,
      collectionId: record.collectionId,
      uploadKey: record.uploadKey,
    });
    assert.equal(replay.status, "replay");
    assert.equal(replay.status === "replay" ? replay.file.id : "", record.id);

    const otherCollection = batch.resolveWorkspaceUploadReplay([record], {
      name: record.name,
      size: record.size,
      contentType: record.contentType,
      contentSha256: record.contentSha256,
      productId: record.productId,
      workspacePageId: record.workspacePageId,
      collectionId: "another-gallery",
      uploadKey: record.uploadKey,
    });
    assert.equal(otherCollection.status, "new");

    const collision = batch.resolveWorkspaceUploadReplay([record], {
      name: "different.jpg",
      size: record.size,
      contentType: record.contentType,
      contentSha256: record.contentSha256,
      productId: record.productId,
      workspacePageId: record.workspacePageId,
      collectionId: record.collectionId,
      uploadKey: record.uploadKey,
    });
    assert.equal(collision.status, "conflict");

    const sameMetadataDifferentBytes = batch.resolveWorkspaceUploadReplay([record], {
      name: record.name,
      size: record.size,
      contentType: record.contentType,
      contentSha256: "b".repeat(64),
      productId: record.productId,
      workspacePageId: record.workspacePageId,
      collectionId: record.collectionId,
      uploadKey: record.uploadKey,
    });
    assert.equal(sameMetadataDifferentBytes.status, "conflict", "browser metadata alone must never replay a different binary");
  });

  it("mounts the batch runner and the cap on the customer surface", async () => {
    const application = await readFile(new URL("../src/app/portal/customer/_ProductWorkspaceApplication.tsx", import.meta.url), "utf8");
    const uploadRoute = await readFile(new URL("../src/app/api/tenants/client-files/upload/route.ts", import.meta.url), "utf8");
    const workspaceRoute = await readFile(new URL("../src/app/api/tenants/product-workspaces/route.ts", import.meta.url), "utf8");
    assert.match(application, /runWorkspaceUploadBatch/);
    assert.match(application, /workspaceUploadBatchNotice/);
    assert.match(application, /workspaceUploadCompletedKeys/);
    assert.match(application, /form\.set\("uploadKey", workspaceUploadFileKey\(file\)\)/);
    assert.match(application, /WORKSPACE_UPLOAD_BATCH_LIMIT\} files per upload/);
    assert.match(application, /onFileCommitted/);
    assert.match(uploadRoute, /resolveWorkspaceUploadReplay/);
    assert.match(uploadRoute, /crypto\.createHash\("sha256"\)/);
    assert.match(uploadRoute, /contentSha256/);
    assert.match(uploadRoute, /workspaceAttachmentState: collectionId \? "pending"/);
    assert.match(workspaceRoute, /attachmentState: "attached"/);
    assert.doesNotMatch(application, /\.slice\(0, 30\)/, "the cap must be declared by the batch runner, not hidden in the loop");
    assert.doesNotMatch(application, /selectedFiles\.length\} \$\{selectedFiles\.length === 1/, "the notice must not report the selected count as the added count");
  });
});
