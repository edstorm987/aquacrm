process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";

const require_ = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, "..");
const TSX_LOADER = require_.resolve("tsx");
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-product-workspace-race-"));

const CHILD_SOURCE = String.raw`
const { createRequire } = await import("node:module");
const { access, writeFile } = await import("node:fs/promises");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "aqua-product-workspace-child.cjs"));
const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
let sessionCookie = input.sessionCookie || "";
const headersId = require_.resolve("next/headers");
require_.cache[headersId] = {
  id: headersId,
  filename: headersId,
  loaded: true,
  paths: [],
  children: [],
  exports: {
    cookies: async () => ({
      get: name => sessionCookie && name === "lk_session_v1" ? { name, value: sessionCookie } : undefined,
      getAll: () => sessionCookie ? [{ name: "lk_session_v1", value: sessionCookie }] : [],
      has: name => Boolean(sessionCookie) && name === "lk_session_v1",
    }),
    headers: async () => new Headers(),
    draftMode: async () => ({ isEnabled: false }),
  },
};

const storage = require_("./src/server/storage");
const tenants = require_("./src/server/tenants");
const products = require_("./src/server/agencyProducts");
const workspaces = require_("./src/server/productWorkspaces");
const users = require_("./src/server/users");
const auth = require_("./src/lib/server/auth/auth");

try {
  await storage.ensureHydrated();
  if (input.readyPath) {
    await writeFile(input.readyPath, "ready", "utf8");
    while (true) {
      try { await access(input.goPath); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 10)); }
    }
  }

  if (input.action === "seed") {
    const ownerEmail = input.ownerEmail;
    const agency = tenants.createAgency({ name: input.name, ownerEmail });
    const owner = users.createUser({
      email: ownerEmail,
      name: "Race owner",
      role: "agency-owner",
      agencyId: agency.id,
      password: "race-test-password",
    });
    const product = products.ensureDefaultAgencyProducts(agency.id)[0];
    const client = tenants.createClient(agency.id, {
      name: input.name + " client",
      ownerEmail: "client@example.test",
      stage: "aqua-epic-intro",
      metadata: {
        portalMode: "onboarding",
        portalSelectedProductIds: [product.id],
        portalProductIds: [product.id],
      },
    });
    let workspace = workspaces.clientProductWorkspaces(client)[0];
    const pageId = Object.keys(workspace.pages)[0];
    let fileId;
    let collectionId;
    if (input.withFile) {
      fileId = "file-race";
      collectionId = "collection-race";
      workspace = {
        ...workspace,
        collections: [{
          id: collectionId,
          pageId,
          title: "Race collection",
          status: "draft",
          downloadsEnabled: false,
          watermarkEnabled: false,
          assets: [{
            id: "asset-race",
            fileId,
            title: "race-proof.pdf",
            status: "working",
            selected: false,
            addedAt: Date.now(),
            addedBy: ownerEmail,
          }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
      };
      workspaces.saveClientProductWorkspaces(client, [workspace]);
      tenants.updateClient(agency.id, client.id, { metadata: { files: [{
        id: fileId,
        name: "race-proof.pdf",
        url: "https://example.test/race-proof.pdf",
        category: "deliverable",
        uploadedAt: Date.now(),
        customerVisible: false,
      }] } });
    }
    sessionCookie = auth.issueSession({
      userId: owner.id,
      email: ownerEmail,
      role: "agency-owner",
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev || 0,
    });
    process.stdout.write(JSON.stringify({ ok: true, agencyId: agency.id, clientId: client.id, productId: product.id,
      pageId, revision: workspace.revision, sessionCookie, stages: product.internalWorkspace.lifecycleStages,
      fileId, collectionId }));
  } else if (input.action === "request") {
    const routePath = {
      board: "./src/app/api/portal/pipelines/move-client/route",
      workspace: "./src/app/api/tenants/product-workspaces/route",
      requests: "./src/app/api/tenants/client-requests/route",
      approvals: "./src/app/api/tenants/client-approvals/route",
      paymentPlans: "./src/app/api/tenants/client-payment-plans/route",
      record: "./src/app/api/tenants/client-record/route",
    }[input.route];
    const route = require_(routePath);
    const response = await route.POST(new Request("http://localhost" + input.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.body),
    }));
    process.stdout.write(JSON.stringify({ ok: true, status: response.status, payload: await response.json() }));
  } else if (input.action === "inspect") {
    await storage.ensureHydrated({ fresh: true });
    const client = tenants.getClientForAgency(input.agencyId, input.clientId);
    const workspace = workspaces.clientProductWorkspaces(client).find(item => item.productId === input.productId);
    const raw = client.metadata.portalProductWorkspaces?.[input.productId];
    const processEntry = client.metadata.clientProductProcess?.[input.productId];
    const pipeline = client.metadata.productPipelineStages?.[input.productId];
    const file = client.metadata.files?.find(item => item.id === input.fileId);
    process.stdout.write(JSON.stringify({ ok: true, workspace, rawStage: raw?.stage,
      processStage: processEntry?.currentStageId, pipelineStage: pipeline, clientStage: client.stage,
      portalMode: client.metadata.portalMode, fileVisible: file?.customerVisible,
      requests: client.metadata.clientRequests || [], approvals: client.metadata.portalApprovals || [],
      paymentPlans: client.metadata.clientPaymentPlans || [], recordEntries: client.metadata.clientRecordEntries || [] }));
  } else {
    throw new Error("unknown child action");
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }));
}
`;

interface ChildResult {
  ok: boolean;
  status?: number;
  payload?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

function runChild(dataFile: string, input: Record<string, unknown>): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      TSX_LOADER,
      "--input-type=module",
      "--eval",
      CHILD_SOURCE,
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: dataFile,
        PORTAL_SESSION_SECRET: "product-workspace-cross-process-secret",
        TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json"),
        AQUA_TEST_INPUT: JSON.stringify(input),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) return rejectChild(new Error(`child exited ${code}: ${stderr || stdout}`));
      try { resolveChild(JSON.parse(stdout) as ChildResult); }
      catch { rejectChild(new Error(`child returned non-JSON output: ${stdout}\n${stderr}`)); }
    });
  });
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { await access(path); return; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 10)); }
  }
  throw new Error(`child did not reach barrier: ${path}`);
}

async function collide(
  dataFile: string,
  base: Record<string, unknown>,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Promise<[ChildResult, ChildResult]> {
  const barrier = join(SANDBOX, `barrier-${Math.random().toString(36).slice(2)}`);
  await mkdir(barrier, { recursive: true });
  const goPath = join(barrier, "go");
  const leftReady = join(barrier, "left");
  const rightReady = join(barrier, "right");
  const leftPromise = runChild(dataFile, { ...base, ...left, readyPath: leftReady, goPath });
  const rightPromise = runChild(dataFile, { ...base, ...right, readyPath: rightReady, goPath });
  await Promise.all([waitFor(leftReady), waitFor(rightReady)]);
  await writeFile(goPath, "go", "utf8");
  return Promise.all([leftPromise, rightPromise]);
}

async function seed(name: string, withFile = false) {
  const dataFile = join(SANDBOX, `${name}.json`);
  const result = await runChild(dataFile, { action: "seed", name, ownerEmail: `${name}@example.test`, withFile });
  assert.equal(result.ok, true, result.error);
  return { dataFile, seed: result };
}

function assertOneWinner(results: [ChildResult, ChildResult]): { winner: ChildResult; loser: ChildResult; loserIndex: number } {
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409], JSON.stringify(results));
  const loserIndex = results[0].status === 409 ? 0 : 1;
  return { winner: results[1 - loserIndex], loser: results[loserIndex], loserIndex };
}

before(async () => { await mkdir(SANDBOX, { recursive: true }); });
after(async () => { await rm(SANDBOX, { recursive: true, force: true }); });

describe("client product workspace cross-process coordination", () => {
  test("two stale edit workers produce one winner, one conflict, and a lossless reviewed retry", async () => {
    const world = await seed("edit-race");
    const common = {
      action: "request",
      route: "workspace",
      path: "/api/tenants/product-workspaces",
      sessionCookie: world.seed.sessionCookie,
    };
    const messages = ["alpha survives", "beta survives"];
    const results = await collide(world.dataFile, common,
      { body: { action: "add-update", clientId: world.seed.clientId, productId: world.seed.productId,
        pageId: world.seed.pageId, message: messages[0], expectedRevision: 0 } },
      { body: { action: "add-update", clientId: world.seed.clientId, productId: world.seed.productId,
        pageId: world.seed.pageId, message: messages[1], expectedRevision: 0 } });
    const race = assertOneWinner(results);
    const conflictWorkspace = race.loser.payload?.workspace as { revision?: number; updates?: Array<{ message: string }> };
    assert.equal(conflictWorkspace.revision, 1);
    assert.equal(conflictWorkspace.updates?.length, 1);

    const retry = await runChild(world.dataFile, { ...common, body: {
      action: "add-update", clientId: world.seed.clientId, productId: world.seed.productId,
      pageId: world.seed.pageId, message: messages[race.loserIndex], expectedRevision: 1,
    } });
    assert.equal(retry.status, 200, JSON.stringify(retry));
    const inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId });
    const updates = (inspected.workspace as { updates: Array<{ message: string }>; revision: number }).updates;
    assert.equal((inspected.workspace as { revision: number }).revision, 2);
    assert.deepEqual(new Set(updates.map(update => update.message)), new Set(messages));
  });

  test("two stale stage workers cannot split any stage projection", async () => {
    const world = await seed("stage-race");
    const stages = world.seed.stages as Array<{ id: string; portalMode: string }>;
    const targets = [stages[1]!, stages[2]!];
    const common = {
      action: "request",
      route: "board",
      path: "/api/portal/pipelines/move-client",
      sessionCookie: world.seed.sessionCookie,
    };
    const results = await collide(world.dataFile, common,
      { body: { clientId: world.seed.clientId, productKey: world.seed.productId, columnId: targets[0].id, expectedRevision: 0 } },
      { body: { clientId: world.seed.clientId, productKey: world.seed.productId, columnId: targets[1].id, expectedRevision: 0 } });
    const race = assertOneWinner(results);
    const winnerTarget = targets[1 - race.loserIndex];
    let inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId });
    assert.equal(inspected.ok, true, inspected.error);
    assert.equal(inspected.processStage, winnerTarget.id);
    assert.equal(inspected.pipelineStage, winnerTarget.id);
    assert.equal(inspected.rawStage, winnerTarget.portalMode);
    assert.equal(inspected.portalMode, winnerTarget.portalMode);

    const retryTarget = targets[race.loserIndex];
    const retry = await runChild(world.dataFile, { ...common, body: { clientId: world.seed.clientId,
      productKey: world.seed.productId, columnId: retryTarget.id, expectedRevision: 1 } });
    assert.equal(retry.status, 200, JSON.stringify(retry));
    inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId });
    assert.equal(inspected.processStage, retryTarget.id);
    assert.equal(inspected.pipelineStage, retryTarget.id);
    assert.equal(inspected.rawStage, retryTarget.portalMode);
    assert.equal(inspected.portalMode, retryTarget.portalMode);
  });

  test("file visibility never splits from its collection during a two-process collision", async () => {
    const world = await seed("file-race", true);
    const common = {
      action: "request",
      route: "workspace",
      path: "/api/tenants/product-workspaces",
      sessionCookie: world.seed.sessionCookie,
    };
    const bodies = [
      { action: "set-collection-status", clientId: world.seed.clientId, productId: world.seed.productId,
        pageId: world.seed.pageId, collectionId: world.seed.collectionId, status: "delivered", expectedRevision: 0 },
      { action: "add-update", clientId: world.seed.clientId, productId: world.seed.productId,
        pageId: world.seed.pageId, message: "file race update", expectedRevision: 0 },
    ];
    const results = await collide(world.dataFile, common, { body: bodies[0] }, { body: bodies[1] });
    const race = assertOneWinner(results);
    let inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId, fileId: world.seed.fileId });
    const collection = (inspected.workspace as { collections: Array<{ status: string }> }).collections[0]!;
    assert.equal(inspected.fileVisible, collection.status === "delivered");

    const retry = await runChild(world.dataFile, { ...common, body: { ...bodies[race.loserIndex], expectedRevision: 1 } });
    assert.equal(retry.status, 200, JSON.stringify(retry));
    inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId, fileId: world.seed.fileId });
    const finalWorkspace = inspected.workspace as { revision: number; collections: Array<{ status: string }>; updates: Array<{ message: string }> };
    assert.equal(finalWorkspace.revision, 2);
    assert.equal(finalWorkspace.collections[0]?.status, "delivered");
    assert.equal(inspected.fileVisible, true);
    assert.equal(finalWorkspace.updates[0]?.message, "file race update");
  });

  test("adjacent request, approval, payment-plan and record ledgers merge or conflict explicitly", async () => {
    const world = await seed("sibling-ledger-race");
    const base = { action: "request", sessionCookie: world.seed.sessionCookie };

    const requestResults = await collide(world.dataFile,
      { ...base, route: "requests", path: "/api/tenants/client-requests" },
      { body: { clientId: world.seed.clientId, type: "support-ticket", message: "alpha request" } },
      { body: { clientId: world.seed.clientId, type: "suggestion", message: "beta request" } });
    assert.deepEqual(requestResults.map(result => result.status), [200, 200]);

    const recordResults = await collide(world.dataFile,
      { ...base, route: "record", path: "/api/tenants/client-record" },
      { body: { clientId: world.seed.clientId, action: "add", entry: { kind: "note", title: "alpha record" } } },
      { body: { clientId: world.seed.clientId, action: "add", entry: { kind: "update", title: "beta record" } } });
    assert.deepEqual(recordResults.map(result => result.status), [200, 200]);

    const dueAt = Date.now() + 86_400_000;
    const paymentResults = await collide(world.dataFile,
      { ...base, route: "paymentPlans", path: "/api/tenants/client-payment-plans" },
      { body: { clientId: world.seed.clientId, action: "create", title: "alpha plan", amountCents: 10_000,
        installmentCount: 1, firstDueAt: dueAt, currency: "gbp" } },
      { body: { clientId: world.seed.clientId, action: "create", title: "beta plan", amountCents: 20_000,
        installmentCount: 1, firstDueAt: dueAt, currency: "gbp" } });
    assert.deepEqual(paymentResults.map(result => result.status), [201, 201]);

    const approvalResults = await collide(world.dataFile,
      { ...base, route: "approvals", path: "/api/tenants/client-approvals" },
      { body: { clientId: world.seed.clientId, action: "request", type: "design", detail: "alpha approval" } },
      { body: { clientId: world.seed.clientId, action: "request", type: "design", detail: "beta approval" } });
    assert.deepEqual(approvalResults.map(result => result.status).sort(), [200, 409]);

    let inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId });
    assert.equal(inspected.ok, true, inspected.error);
    assert.equal((inspected.requests as unknown[]).length, 2);
    assert.equal((inspected.recordEntries as unknown[]).length, 2);
    assert.equal((inspected.paymentPlans as unknown[]).length, 2);
    assert.equal((inspected.approvals as unknown[]).length, 1);

    const plans = inspected.paymentPlans as Array<{
      id: string; revision: number; title: string; currency: string; customerVisible: boolean;
      milestones: unknown[];
    }>;
    const plan = plans[0]!;
    const planResults = await collide(world.dataFile,
      { ...base, route: "paymentPlans", path: "/api/tenants/client-payment-plans" },
      { body: { clientId: world.seed.clientId, action: "status", planId: plan.id,
        status: "active", expectedRevision: plan.revision } },
      { body: { clientId: world.seed.clientId, action: "update", planId: plan.id,
        title: `${plan.title} reviewed`, currency: plan.currency, customerVisible: plan.customerVisible,
        milestones: plan.milestones, expectedRevision: plan.revision } });
    const planRace = assertOneWinner(planResults);
    const retryBody = planRace.loserIndex === 0
      ? { clientId: world.seed.clientId, action: "status", planId: plan.id, status: "active", expectedRevision: 1 }
      : { clientId: world.seed.clientId, action: "update", planId: plan.id, title: `${plan.title} reviewed`,
          currency: plan.currency, customerVisible: plan.customerVisible, milestones: plan.milestones, expectedRevision: 1 };
    const retry = await runChild(world.dataFile, { ...base, route: "paymentPlans",
      path: "/api/tenants/client-payment-plans", body: retryBody });
    assert.equal(retry.status, 200, JSON.stringify(retry));
    inspected = await runChild(world.dataFile, { action: "inspect", agencyId: world.seed.agencyId,
      clientId: world.seed.clientId, productId: world.seed.productId });
    const finalPlan = (inspected.paymentPlans as Array<{ id: string; revision: number; title: string; status: string }>).find(item => item.id === plan.id)!;
    assert.equal(finalPlan.revision, 2);
    assert.equal(finalPlan.status, "active");
    assert.equal(finalPlan.title, `${plan.title} reviewed`);
  });
});
