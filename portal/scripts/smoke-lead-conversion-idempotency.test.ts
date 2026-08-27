process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { before, describe, test } from "node:test";

const require_ = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let installs: typeof import("../src/server/pluginInstalls");
let pluginStorage: typeof import("../src/lib/server/pluginStorage");
let leadFoundation: typeof import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
let financeFoundation: typeof import("../src/built-ins/modules/agency-finance/src/server/foundationAdapter");
let handler: typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
let coordinatorApi: typeof import("../src/server/leadConversionCoordinator");

before(async () => {
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  installs = await import("../src/server/pluginInstalls");
  pluginStorage = await import("../src/lib/server/pluginStorage");
  leadFoundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  financeFoundation = await import("../src/built-ins/modules/agency-finance/src/server/foundationAdapter");
  handler = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  coordinatorApi = await import("../src/server/leadConversionCoordinator");
  const foundationPorts = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  const leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
  leadFoundation.registerLeadsPipelineFoundation({
    tenant: foundationPorts.tenantPort,
    activity: foundationPorts.activityPort,
    events: foundationPorts.eventBusPort,
    pluginInstalls: foundationPorts.pluginInstallStorePort,
    emailEnqueue: leadsPorts.emailEnqueuePort,
    pipeline: leadsPorts.pipelinePort,
  } as never);
  financeFoundation.registerAgencyFinanceFoundation({
    tenant: foundationPorts.tenantPort,
    user: foundationPorts.userPort,
    activity: foundationPorts.activityPort,
    events: foundationPorts.eventBusPort,
    pluginInstalls: foundationPorts.pluginInstallStorePort,
  } as never);
});

let sequence = 0;

async function seedWorld(options: { finance?: boolean; payment?: boolean } = {}) {
  sequence += 1;
  const agency = tenants.createAgency({
    name: `Conversion ${sequence}`,
    ownerEmail: `owner-${sequence}@example.test`,
  });
  const leadInstall = installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId: agency.id },
    enabled: true,
    config: {},
    features: {},
    installedBy: "conversion-smoke",
  });
  const scopedStorage = pluginStorage.makePluginStorage(leadInstall.id);
  const container = leadFoundation.containerFor({ agencyId: agency.id as never, storage: scopedStorage as never });
  const email = `buyer-${sequence}@example.test`;
  const { lead } = await container.leads.upsert({
    email,
    name: `Buyer ${sequence}`,
    company: `Buyer ${sequence} Ltd`,
    source: "conversion-smoke",
    tags: ["qualified"],
  }, "conversion-smoke" as never);

  let financeInstall: ReturnType<typeof installs.upsertInstall> | undefined;
  if (options.finance) {
    financeInstall = installs.upsertInstall({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      enabled: true,
      config: { defaultCurrency: "gbp" },
      features: {},
      installedBy: "conversion-smoke",
    });
    await container.commercial.save({
      partyKind: "lead",
      partyId: lead.id,
      recipientName: lead.name,
      recipientEmail: lead.email,
      lineItems: [{ description: "Website build", quantity: 1, unitCents: 120_000 }],
      taxCents: 24_000,
      currency: "gbp",
      dueAt: Date.now() + 7 * 86_400_000,
      billingCadence: "one-off",
      serviceLevel: "Website launch",
      agreementTitle: "Service agreement",
      agreementBody: "Build and launch the agreed website.",
    }, "conversion-smoke" as never);
    if (options.payment) {
      await container.commercial.recordPayment("lead", lead.id, {
        amountCents: 20_000,
        method: "bank-transfer",
        reference: `BANK-CONVERT-${sequence}`,
      }, "conversion-smoke" as never);
    }
  }

  const ctx = {
    agencyId: agency.id,
    install: leadInstall,
    storage: scopedStorage,
    services: {},
    actor: "conversion-smoke",
  } as never;
  return { agency, lead, leadInstall, financeInstall, container, ctx };
}

function conversionRequest(leadId: string, patch: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/portal/leads-pipeline/leads/convert-to-client", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: leadId, createPortal: false, ...patch }),
  });
}

describe("lead conversion operation", () => {
  test("the real handler converges simultaneous requests on one client", async () => {
    const world = await seedWorld();
    const [left, right] = await Promise.all([
      handler.convertLeadToClientHandler(conversionRequest(world.lead.id, { createPortal: true }), world.ctx),
      handler.convertLeadToClientHandler(conversionRequest(world.lead.id, { createPortal: true }), world.ctx),
    ]);
    const responses = await Promise.all([left.json(), right.json()]) as Array<Record<string, unknown>>;

    assert.deepEqual([left.status, right.status].sort(), [200, 201]);
    const clientIds = responses.map(result => (result.client as { id: string }).id);
    assert.equal(new Set(clientIds).size, 1, "competing conversions returned different clients");
    assert.equal(tenants.listClients(world.agency.id).length, 1, "competing conversions persisted duplicate clients");
    assert.equal(
      Object.values(storage.getState().clientPortalInstances)
        .filter(instance => instance.agencyId === world.agency.id && instance.clientId === clientIds[0]).length,
      1,
      "competing conversions provisioned more than one client portal",
    );
    assert.equal(responses.filter(result => result.clientCreated === true).length, 1);
    assert.equal(responses.filter(result => result.replayed === true).length, 1);

    const converted = await world.container.leads.get(world.lead.id);
    assert.equal(converted?.convertedClientId, clientIds[0]);
    assert.equal((await world.container.contacts.list()).length, 1, "lead promotion ran twice");
  });

  test("a completed identity refuses materially different conversion options", async () => {
    const world = await seedWorld();
    const first = await handler.convertLeadToClientHandler(conversionRequest(world.lead.id), world.ctx);
    assert.equal(first.status, 201);
    const conflict = await handler.convertLeadToClientHandler(
      conversionRequest(world.lead.id, { servicePlan: "A different plan" }),
      world.ctx,
    );
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { error: string }).error, "lead_conversion_request_conflict");
    assert.equal(tenants.listClients(world.agency.id).length, 1);
  });

  test("finance invoice and imported payment are single-intent side effects", async () => {
    const world = await seedWorld({ finance: true, payment: true });
    assert.ok(world.financeInstall);
    const finance = financeFoundation.containerFor({
      agencyId: world.agency.id as never,
      storage: pluginStorage.makePluginStorage(world.financeInstall!.id) as never,
      install: world.financeInstall as never,
    });
    const pack = await world.container.commercial.get("lead", world.lead.id);
    assert.ok(pack);
    const claimKey = coordinatorApi.leadConversionClaimKey({
      agencyId: world.agency.id,
      leadId: world.lead.id,
      email: world.lead.email,
    });
    const partialClient = tenants.createClient(world.agency.id, {
      name: world.lead.company ?? world.lead.name ?? world.lead.email,
      ownerEmail: world.lead.email,
      metadata: { leadId: world.lead.id },
    });
    const partialInvoice = await finance.invoices.create({
      clientId: partialClient.id,
      dueAt: pack!.dueAt,
      lineItems: pack!.lineItems,
      taxCents: pack!.taxCents,
      currency: pack!.currency,
      notes: "A prior conversion worker persisted the invoice before stopping.",
      idempotencyKey: `lead-conversion:${claimKey}:invoice:${pack!.id}`,
    }, "conversion-smoke" as never, pack!.currency);
    // Simulate a crash after invoice creation but before the commercial pack
    // was linked or its payment imported. The resumed conversion must recover
    // this deterministic invoice rather than minting another one.
    assert.equal((await finance.payments.listForInvoice(partialInvoice.id)).length, 0);

    const [left, right] = await Promise.all([
      handler.convertLeadToClientHandler(conversionRequest(world.lead.id), world.ctx),
      handler.convertLeadToClientHandler(conversionRequest(world.lead.id), world.ctx),
    ]);
    const responseBodies = await Promise.all([left.clone().json(), right.clone().json()]);
    assert.deepEqual(
      [left.status, right.status].sort(),
      [200, 200],
      JSON.stringify(responseBodies),
    );
    const invoices = await finance.invoices.list();
    assert.equal(invoices.length, 1, "one conversion minted multiple finance invoices");
    assert.equal((await finance.payments.listForInvoice(invoices[0]!.id)).length, 1,
      "one commercial payment was imported more than once");

    const replay = await handler.convertLeadToClientHandler(conversionRequest(world.lead.id), world.ctx);
    assert.equal(replay.status, 200);
    assert.equal((await finance.invoices.list()).length, 1);
    assert.equal((await finance.payments.listForInvoice(invoices[0]!.id)).length, 1);
  });

  test("failed and expired owners are resumable while stale owners are fenced", async () => {
    let now = 1_000;
    const coordinator = coordinatorApi.createMemoryLeadConversionCoordinator(() => now);
    const first = { claimKey: "same-lead", requestHash: "same-request", holderId: "first", leaseMs: 5_000 };
    const second = { ...first, holderId: "second" };
    assert.equal((await coordinator.claim(first)).state, "claimed");
    assert.equal((await coordinator.claim(second)).state, "held");
    await coordinator.fail({ ...first, error: "portal temporarily unavailable" });
    assert.equal((await coordinator.claim(second)).state, "claimed");
    await assert.rejects(coordinator.complete({ ...first, result: { ok: true } }), /not_held/);
    await coordinator.complete({ ...second, result: { ok: true, client: { id: "cli_one" } } });
    const replay = await coordinator.claim({ ...first, holderId: "third" });
    assert.equal(replay.state, "complete");
    assert.deepEqual(replay.state === "complete" ? replay.result : null, { ok: true, client: { id: "cli_one" } });
    assert.equal((await coordinator.claim({ ...first, requestHash: "different", holderId: "fourth" })).state, "conflict");

    const expiring = { claimKey: "expired", requestHash: "request", holderId: "old", leaseMs: 1_000 };
    assert.equal((await coordinator.claim(expiring)).state, "claimed");
    now += 1_001;
    assert.equal((await coordinator.claim({ ...expiring, holderId: "new" })).state, "claimed");
  });
});

const CHILD_SOURCE = String.raw`
try {
  const imported = await import(process.env.AQUA_COORDINATOR_MODULE);
  const api = imported.default || imported;
  const coordinator = api.leadConversionCoordinator();
  const input = {
    claimKey: process.env.AQUA_CLAIM_KEY,
    requestHash: process.env.AQUA_REQUEST_HASH,
    holderId: process.env.AQUA_HOLDER_ID,
    leaseMs: 5000,
  };
  const claim = await coordinator.claim(input);
  if (claim.state === "claimed" && process.env.AQUA_COMPLETE === "1") {
    await new Promise(resolve => setTimeout(resolve, 250));
    await coordinator.complete({ ...input, result: { ok: true, client: { id: "cli_cross_process" } } });
  }
  process.stdout.write(JSON.stringify({ ok: true, claim }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}
`;

function runFileWorker(input: {
  dataFile: string;
  claimKey: string;
  requestHash: string;
  holderId: string;
  complete?: boolean;
}): Promise<{ ok: boolean; claim?: { state: string; result?: unknown }; error?: string }> {
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
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: input.dataFile,
        TSX_TSCONFIG_PATH: join(ROOT, "tsconfig.json"),
        AQUA_COORDINATOR_MODULE: pathToFileURL(join(ROOT, "src/server/leadConversionCoordinator.ts")).href,
        AQUA_CLAIM_KEY: input.claimKey,
        AQUA_REQUEST_HASH: input.requestHash,
        AQUA_HOLDER_ID: input.holderId,
        AQUA_COMPLETE: input.complete ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) return rejectChild(new Error(`worker exited ${code}: ${stderr || stdout}`));
      try { resolveChild(JSON.parse(stdout)); }
      catch { rejectChild(new Error(`worker returned non-JSON: ${stdout}\n${stderr}`)); }
    });
  });
}

test("the file coordinator elects one owner across independent Node processes and replays durably", async () => {
  const root = mkdtempSync(join(tmpdir(), "aqua-lead-conversion-"));
  const dataFile = join(root, "portal-state.json");
  const common = { dataFile, claimKey: "cross-process-lead", requestHash: "cross-process-request" };
  const [first, second] = await Promise.all([
    runFileWorker({ ...common, holderId: "worker-a", complete: true }),
    runFileWorker({ ...common, holderId: "worker-b", complete: true }),
  ]);
  assert.equal(first.ok, true, first.error);
  assert.equal(second.ok, true, second.error);
  assert.deepEqual([first.claim?.state, second.claim?.state].sort(), ["claimed", "held"]);

  const replay = await runFileWorker({ ...common, holderId: "worker-c" });
  assert.equal(replay.claim?.state, "complete");
  assert.deepEqual(replay.claim?.result, { ok: true, client: { id: "cli_cross_process" } });
});

test("remote database contracts expose atomic claim, completion, failure and result replay", () => {
  const schema = readFileSync(join(ROOT, "scripts/schema.sql"), "utf8");
  const migration = readFileSync(
    join(ROOT, "..", "supabase", "migrations", "20260825120000_lead_conversion_operations.sql"),
    "utf8",
  );
  const postgres = readFileSync(join(ROOT, "src/server/storagePostgres.ts"), "utf8");
  const supabase = readFileSync(join(ROOT, "src/server/storageSupabase.ts"), "utf8");
  for (const sql of [schema, migration]) {
    assert.match(sql, /lead_conversion_operations/);
    assert.match(sql, /claim_lead_conversion/);
    assert.match(sql, /complete_lead_conversion/);
    assert.match(sql, /fail_lead_conversion/);
    assert.match(sql, /FOR UPDATE/i);
    assert.match(sql, /operation\.request_hash <> p_request_hash/i);
    assert.match(sql, /lease_expires_at > NOW\(\)/i);
    assert.match(sql, /'result', operation\.result/i);
  }
  assert.match(postgres, /claim_lead_conversion\(\$1, \$2, \$3, \$4, \$5\)/);
  assert.match(supabase, /replyClaimRpc\("claim_lead_conversion"/);
});
