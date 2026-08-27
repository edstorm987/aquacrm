process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "payment-plan-recovery-smoke-secret";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const TSX_LOADER = require.resolve("tsx");

let sessionCookie = "";
const headersId = require.resolve("next/headers");
require.cache[headersId] = {
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

const storage = require("../src/server/storage") as typeof import("../src/server/storage");
const tenants = require("../src/server/tenants") as typeof import("../src/server/tenants");
const users = require("../src/server/users") as typeof import("../src/server/users");
const installs = require("../src/server/pluginInstalls") as typeof import("../src/server/pluginInstalls");
const auth = require("../src/lib/server/auth/auth") as typeof import("../src/lib/server/auth/auth");
const activity = require("../src/server/activity") as typeof import("../src/server/activity");
const pluginStorage = require("../src/lib/server/pluginStorage") as typeof import("../src/lib/server/pluginStorage");
const financeFoundation = require("../src/built-ins/modules/agency-finance/src/server/foundationAdapter") as typeof import("../src/built-ins/modules/agency-finance/src/server/foundationAdapter");
const { ensureAgencyFinanceFoundationRegistered } = require("../src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation") as typeof import("../src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation");
const paymentPlans = require("../src/lib/clients/clientPaymentPlans") as typeof import("../src/lib/clients/clientPaymentPlans");
const route = require("../src/app/api/tenants/client-payment-plans/route") as typeof import("../src/app/api/tenants/client-payment-plans/route");

interface World {
  agencyId: string;
  clientId: string;
  installId: string;
  planId: string;
  milestoneId: string;
}

let sequence = 0;

before(async () => {
  await storage.ensureHydrated();
  ensureAgencyFinanceFoundationRegistered();
});

function seedWorld(operationId?: string): World {
  sequence += 1;
  const agency = tenants.createAgency({ name: `Payment recovery ${sequence}`, ownerEmail: `owner-${sequence}@example.test` });
  const owner = users.createUser({
    email: `owner-${sequence}@example.test`,
    name: `Recovery owner ${sequence}`,
    role: "agency-owner",
    agencyId: agency.id,
    password: "test-password",
  });
  const planId = `plan-recovery-${sequence}`;
  const milestoneId = `milestone-recovery-${sequence}`;
  const client = tenants.createClient(agency.id, {
    name: `Recovery client ${sequence}`,
    ownerEmail: `client-${sequence}@example.test`,
    metadata: {
      clientPaymentPlans: [{
        id: planId,
        revision: 0,
        title: "Website milestone plan",
        currency: "gbp",
        status: "active",
        customerVisible: true,
        productIds: [],
        milestones: [{
          id: milestoneId,
          title: "Launch milestone",
          amountCents: 125_000,
          dueAt: Date.now() + 14 * 86_400_000,
          status: "planned",
          invoiceOperationId: operationId,
          invoiceOperationStartedAt: operationId ? Date.now() : undefined,
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    },
  });
  const install = installs.upsertInstall({
    pluginId: "agency-finance",
    scope: { agencyId: agency.id },
    enabled: true,
    config: { defaultCurrency: "gbp", ukDefaultCurrencyV1: true },
    features: {},
    installedBy: "payment-recovery-smoke",
  });
  sessionCookie = auth.issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    sessionRev: owner.sessionRev ?? 0,
  });
  return { agencyId: agency.id, clientId: client.id, installId: install.id, planId, milestoneId };
}

function invoiceRequest(world: World, expectedRevision = 0): Request {
  return new Request("http://localhost/api/tenants/client-payment-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: world.clientId,
      action: "create-invoice",
      planId: world.planId,
      milestoneId: world.milestoneId,
      issue: true,
      expectedRevision,
    }),
  });
}

function financeFor(world: World) {
  return financeFoundation.containerFor({
    agencyId: world.agencyId as never,
    storage: pluginStorage.makePluginStorage(world.installId) as never,
    install: installs.getInstall({ agencyId: world.agencyId }, "agency-finance") as never,
  });
}

function storedPlan(world: World) {
  const client = tenants.getClientForAgency(world.agencyId, world.clientId)!;
  return paymentPlans.cleanClientPaymentPlans(client.metadata?.clientPaymentPlans)[0]!;
}

test("a normal create and a stale HTTP replay converge on one issued invoice", async () => {
  const world = seedWorld();
  const first = await route.POST(invoiceRequest(world));
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as { invoice: { id: string; number: string }; plan: { revision: number } };
  assert.equal(firstPayload.plan.revision, 1);

  const persisted = storedPlan(world);
  assert.ok(persisted.milestones[0]?.invoiceOperationId, "the invoice operation identity was not persisted");
  assert.equal(persisted.milestones[0]?.invoiceId, firstPayload.invoice.id);

  const replay = await route.POST(invoiceRequest(world, 0));
  assert.equal(replay.status, 200, "a lost-response retry should replay despite its old plan revision");
  const replayPayload = await replay.json() as { invoice: { id: string; number: string }; plan: { revision: number } };
  assert.deepEqual(replayPayload.invoice, firstPayload.invoice);
  assert.equal(replayPayload.plan.revision, 1, "replay must not advance the plan twice");

  const invoices = await financeFor(world).invoices.list();
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0]?.totalCents, 125_000);
  const invoiceActivities = activity.listActivity({ agencyId: world.agencyId, limit: 500 })
    .filter(entry => entry.action === "client_payment_plan.invoiced");
  assert.equal(invoiceActivities.length, 1, "the converged operation should have one plan-invoice activity row");
});

test("an invoice persisted before milestone linking is adopted, then missing projections repair on replay", async () => {
  const operationId = "payinvop_crash_after_finance";
  const world = seedWorld(operationId);
  const finance = financeFor(world);
  let preexisting = await finance.invoices.create({
    clientId: world.clientId,
    dueAt: storedPlan(world).milestones[0]!.dueAt,
    lineItems: [{ description: "Launch milestone", quantity: 1, unitCents: 125_000 }],
    currency: "gbp",
    notes: `Aqua plan reference: ${world.planId}/${world.milestoneId}`,
    idempotencyKey: `payment-plan:${world.agencyId}:${world.clientId}:${world.planId}:${world.milestoneId}:${operationId}`,
  }, "payment-recovery-smoke" as never);
  preexisting = (await finance.invoices.update(preexisting.id, { status: "sent" }, "payment-recovery-smoke" as never))!;
  await storage.flushPendingWrites();

  const recovered = await route.POST(invoiceRequest(world));
  assert.equal(recovered.status, 200, JSON.stringify(recovered.payload));
  const recoveredPayload = await recovered.json() as { invoice: { id: string }; plan: { revision: number } };
  assert.equal(recoveredPayload.invoice.id, preexisting.id);
  assert.equal((await finance.invoices.list()).length, 1, "adoption minted a second invoice");
  assert.equal(storedPlan(world).milestones[0]?.invoiceId, preexisting.id);

  storage.mutate(state => {
    state.activity = state.activity.filter(entry => entry.action !== "client_payment_plan.invoiced" || entry.agencyId !== world.agencyId);
    for (const [id, entry] of Object.entries(state.clientRecordLedger ?? {})) {
      if (entry.agencyId === world.agencyId && entry.clientId === world.clientId
        && (entry.sourceType === "invoice" || entry.sourceType === "payment-plan")) {
        delete state.clientRecordLedger[id];
      }
    }
  });

  const repaired = await route.POST(invoiceRequest(world, 0));
  assert.equal(repaired.status, 200);
  assert.equal((await finance.invoices.list()).length, 1);
  assert.equal(activity.listActivity({ agencyId: world.agencyId, limit: 500 }).filter(entry => entry.action === "client_payment_plan.invoiced").length, 1);
  const projections = Object.values(storage.getState().clientRecordLedger ?? {})
    .filter(entry => entry.agencyId === world.agencyId && entry.clientId === world.clientId);
  assert.equal(projections.filter(entry => entry.sourceType === "invoice").length, 1);
  assert.equal(projections.filter(entry => entry.sourceType === "payment-plan").length, 1);
});

test("recovery identity is internal and locks destructive plan edits", async () => {
  const world = seedWorld("payinvop_pending");
  const plan = storedPlan(world);
  const [customerPlan] = paymentPlans.customerVisiblePaymentPlans([plan]);
  assert.equal(customerPlan.milestones[0]?.invoiceOperationId, undefined);
  assert.equal(customerPlan.milestones[0]?.invoiceOperationStartedAt, undefined);

  const panel = require("node:fs").readFileSync("src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx", "utf8") as string;
  const api = require("node:fs").readFileSync("src/app/api/tenants/client-payment-plans/route.ts", "utf8") as string;
  assert.match(panel, /invoiceOperationId/);
  assert.match(panel, /Retry invoice/);
  assert.match(api, /idempotencyKey: `payment-plan:/);
  assert.match(api, /client-payment-plan-invoice:\$\{operationId\}/);
  assert.match(api, /await flushPendingWrites\(\);[\s\S]*finance\.invoices\.create/);
  assert.match(api, /persistPlans[\s\S]*await flushPendingWrites\(\);[\s\S]*synchroniseClientRecordLedger/);
});

const CHILD_SOURCE = String.raw`
const { createRequire } = await import("node:module");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "payment-plan-recovery-child.cjs"));
const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
let sessionCookie = input.sessionCookie || "";
const headersId = require_.resolve("next/headers");
require_.cache[headersId] = {
  id: headersId, filename: headersId, loaded: true, paths: [], children: [],
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
const users = require_("./src/server/users");
const installs = require_("./src/server/pluginInstalls");
const auth = require_("./src/lib/server/auth/auth");
const pluginStorage = require_("./src/lib/server/pluginStorage");
const financeFoundation = require_("./src/built-ins/modules/agency-finance/src/server/foundationAdapter");
require_("./src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation").ensureAgencyFinanceFoundationRegistered();
const plans = require_("./src/lib/clients/clientPaymentPlans");
try {
  await storage.ensureHydrated({ fresh: true });
  if (input.action === "seed") {
    const operationId = "payinvop_fresh_process";
    const agency = tenants.createAgency({ name: "Fresh process recovery", ownerEmail: "owner@fresh.test" });
    const owner = users.createUser({ email: "owner@fresh.test", name: "Fresh owner", role: "agency-owner",
      agencyId: agency.id, password: "test-password" });
    const planId = "plan-fresh";
    const milestoneId = "milestone-fresh";
    const dueAt = Date.now() + 86400000;
    const client = tenants.createClient(agency.id, { name: "Fresh client", metadata: { clientPaymentPlans: [{
      id: planId, revision: 0, title: "Fresh plan", currency: "gbp", status: "active",
      customerVisible: true, productIds: [], createdAt: Date.now(), updatedAt: Date.now(),
      milestones: [{ id: milestoneId, title: "Fresh milestone", amountCents: 125000, dueAt,
        status: "planned", invoiceOperationId: operationId, invoiceOperationStartedAt: Date.now() }],
    }] } });
    const install = installs.upsertInstall({ pluginId: "agency-finance", scope: { agencyId: agency.id }, enabled: true,
      config: { defaultCurrency: "gbp" }, features: {}, installedBy: "fresh-process-smoke" });
    const finance = financeFoundation.containerFor({ agencyId: agency.id, storage: pluginStorage.makePluginStorage(install.id), install });
    let invoice = await finance.invoices.create({ clientId: client.id, dueAt,
      lineItems: [{ description: "Fresh milestone", quantity: 1, unitCents: 125000 }], currency: "gbp",
      idempotencyKey: "payment-plan:" + agency.id + ":" + client.id + ":" + planId + ":" + milestoneId + ":" + operationId,
    }, "fresh-process-smoke");
    invoice = await finance.invoices.update(invoice.id, { status: "sent" }, "fresh-process-smoke");
    sessionCookie = auth.issueSession({ userId: owner.id, email: owner.email, role: owner.role, agencyId: agency.id,
      agencyIds: [agency.id], sessionRev: owner.sessionRev || 0 });
    await storage.flushPendingWrites();
    process.stdout.write(JSON.stringify({ ok: true, agencyId: agency.id, clientId: client.id, installId: install.id,
      planId, milestoneId, invoiceId: invoice.id, sessionCookie }));
  } else if (input.action === "recover") {
    const route = require_("./src/app/api/tenants/client-payment-plans/route");
    const response = await route.POST(new Request("http://localhost/api/tenants/client-payment-plans", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: input.clientId, action: "create-invoice", planId: input.planId,
        milestoneId: input.milestoneId, issue: true, expectedRevision: 0 }),
    }));
    process.stdout.write(JSON.stringify({ ok: true, status: response.status, payload: await response.json() }));
  } else if (input.action === "inspect") {
    const client = tenants.getClientForAgency(input.agencyId, input.clientId);
    const install = installs.getInstall({ agencyId: input.agencyId }, "agency-finance");
    const finance = financeFoundation.containerFor({ agencyId: input.agencyId, storage: pluginStorage.makePluginStorage(install.id), install });
    const plan = plans.cleanClientPaymentPlans(client.metadata.clientPaymentPlans)[0];
    const invoices = await finance.invoices.list();
    const activity = storage.getState().activity.filter(entry => entry.agencyId === input.agencyId && entry.action === "client_payment_plan.invoiced");
    process.stdout.write(JSON.stringify({ ok: true, invoiceIds: invoices.map(invoice => invoice.id), plan, activityCount: activity.length }));
  } else throw new Error("unknown action");
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }));
}
`;

function runChild(dataFile: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", TSX_LOADER, "--input-type=module", "--eval", CHILD_SOURCE], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: dataFile,
        PORTAL_SESSION_SECRET: "payment-plan-fresh-process-secret",
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
    child.on("exit", code => {
      if (code !== 0) return rejectChild(new Error(stderr || `child exited ${code}`));
      try { resolveChild(JSON.parse(stdout) as Record<string, unknown>); }
      catch { rejectChild(new Error(`invalid child output: ${stdout}\n${stderr}`)); }
    });
  });
}

test("a fresh process adopts the pre-link invoice from durable file state", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "aqua-payment-plan-recovery-"));
  const dataFile = join(sandbox, "portal-state.json");
  const seeded = await runChild(dataFile, { action: "seed" });
  assert.equal(seeded.ok, true, String(seeded.error ?? "seed failed"));
  const recovered = await runChild(dataFile, {
    action: "recover",
    sessionCookie: seeded.sessionCookie,
    clientId: seeded.clientId,
    planId: seeded.planId,
    milestoneId: seeded.milestoneId,
  });
  assert.equal(recovered.ok, true, String(recovered.error ?? "recovery failed"));
  assert.equal(recovered.status, 200, JSON.stringify(recovered.payload));
  const inspected = await runChild(dataFile, {
    action: "inspect",
    agencyId: seeded.agencyId,
    clientId: seeded.clientId,
  });
  assert.equal(inspected.ok, true, String(inspected.error ?? "inspection failed"));
  assert.deepEqual(inspected.invoiceIds, [seeded.invoiceId]);
  const plan = inspected.plan as { revision: number; milestones: Array<{ invoiceId?: string; invoiceOperationId?: string }> };
  assert.equal(plan.revision, 1);
  assert.equal(plan.milestones[0]?.invoiceId, seeded.invoiceId);
  assert.equal(plan.milestones[0]?.invoiceOperationId, "payinvop_fresh_process");
  assert.equal(inspected.activityCount, 1);
});
