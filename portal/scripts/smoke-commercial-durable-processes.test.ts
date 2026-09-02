// Opportunity money across REAL processes (issue #81).
//
// The 2026-08-25 repair made commercial payments and invoice numbers safe
// inside one server: an in-process queue ordered callers and `setIfAbsent`
// claims stopped duplicate ledger rows. The queue was the whole cross-process
// story, so two servers on one file-backed state could both win the same
// payment reference or invoice number. `withCommercialLock` now runs its work
// inside the storage port's exclusive lane — on the file backend a
// cross-process transaction that re-hydrates before the work runs — so the
// claims are evaluated against fresh state everywhere.
//
// Same shape as smoke-marketing-durable-processes: separate Node processes,
// one shared PORTAL_DATA_FILE, a filesystem barrier so both children start
// the mutation at the same moment.
process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require_.resolve("tsx");
const sandbox = mkdtempSync(join(tmpdir(), "aqua-commercial-durable-"));

const childSource = String.raw`
const { createRequire } = await import("node:module");
const { access, writeFile } = await import("node:fs/promises");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "aqua-commercial-durable-child.cjs"));
const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
const storageModule = require_("./src/server/storage");
const tenants = require_("./src/server/tenants");
const installs = require_("./src/server/pluginInstalls");
const { makePluginStorage } = require_("./src/lib/server/pluginStorage");
const leadFoundation = require_("./src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
const foundationPorts = require_("./src/built-ins/runtime/foundation-adapters/_foundationPorts");
const leadsPorts = require_("./src/lib/server/leadsPipelinePorts");
const { ensureAgencyFinanceFoundationRegistered } = require_("./src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation");

function pack(input) {
  return {
    partyKind: "lead",
    partyId: input.leadId,
    recipientName: "Buyer",
    recipientEmail: input.email || "buyer@example.test",
    lineItems: [{ description: "Website build", quantity: 1, unitCents: 120_000 }],
    taxCents: 24_000,
    currency: "gbp",
    dueAt: Date.now() + 7 * 86_400_000,
    billingCadence: "one-off",
    serviceLevel: "Website launch",
    agreementTitle: "Service agreement",
    agreementBody: "Build and launch the agreed website.",
  };
}

try {
  await storageModule.ensureHydrated();
  ensureAgencyFinanceFoundationRegistered();
  leadFoundation.registerLeadsPipelineFoundation({
    tenant: foundationPorts.tenantPort,
    activity: foundationPorts.activityPort,
    events: foundationPorts.eventBusPort,
    pluginInstalls: foundationPorts.pluginInstallStorePort,
    emailEnqueue: leadsPorts.emailEnqueuePort,
    pipeline: leadsPorts.pipelinePort,
  });
  let result;
  if (input.action === "seed") {
    const agency = tenants.createAgency({ name: "Commercial durable" });
    const install = installs.upsertInstall({ pluginId: "leads-pipeline", scope: { agencyId: agency.id }, enabled: true, config: {}, features: {}, installedBy: "durable" });
    installs.upsertInstall({ pluginId: "agency-finance", scope: { agencyId: agency.id }, enabled: true, config: { defaultCurrency: "gbp" }, features: {}, installedBy: "durable" });
    const container = leadFoundation.containerFor({ agencyId: agency.id, storage: makePluginStorage(install.id) });
    const first = await container.leads.upsert({ email: "first@example.test", name: "First", company: "First Ltd", source: "durable", tags: [] }, "durable");
    const second = await container.leads.upsert({ email: "second@example.test", name: "Second", company: "Second Ltd", source: "durable", tags: [] }, "durable");
    const saved = await container.commercial.save(pack({ leadId: first.lead.id, email: "first@example.test" }), "durable");
    result = { agencyId: agency.id, installId: install.id, firstLeadId: first.lead.id, secondLeadId: second.lead.id, invoiceNumber: saved.invoiceNumber };
  } else {
    if (input.readyPath) {
      await writeFile(input.readyPath, "ready", "utf8");
      while (true) {
        try { await access(input.goPath); break; }
        catch { await new Promise(resolve => setTimeout(resolve, 10)); }
      }
    }
    const base = makePluginStorage(input.installId);
    let storage = base;
    if (input.crashAfterLedgerClaim) {
      // Simulate a process dying after the payment ledger row is claimed but
      // before the pack projection is written: the first ordinary write after
      // a successful claim throws, and this process exits with that error.
      let armed = false;
      let tripped = false;
      storage = {
        ...base,
        async setIfAbsent(key, value) { const inserted = await base.setIfAbsent(key, value); if (inserted) armed = true; return inserted; },
        async set(key, value) { if (armed && !tripped) { tripped = true; throw new Error("forced crash after ledger claim: " + key); } return base.set(key, value); },
      };
    }
    const container = leadFoundation.containerFor({ agencyId: input.agencyId, storage });
    if (input.action === "payment") {
      const pack = await container.commercial.recordPayment("lead", input.leadId, { amountCents: input.amountCents, method: input.method || "bank-transfer", reference: input.reference }, "durable");
      result = { payments: pack.payments.map(payment => ({ id: payment.id, reference: payment.reference, amountCents: payment.amountCents })) };
    } else if (input.action === "save") {
      const saved = await container.commercial.save(pack({ leadId: input.leadId, email: input.email }), "durable");
      result = { invoiceNumber: saved.invoiceNumber };
    } else if (input.action === "get") {
      const current = await container.commercial.get("lead", input.leadId);
      result = current ? { invoiceNumber: current.invoiceNumber, payments: current.payments.map(payment => ({ id: payment.id, reference: payment.reference, amountCents: payment.amountCents })) } : null;
    } else {
      throw new Error("unknown action " + input.action);
    }
  }
  if (typeof storageModule.flushPendingWrites === "function") await storageModule.flushPendingWrites();
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  if (typeof storageModule.flushPendingWrites === "function") { try { await storageModule.flushPendingWrites(); } catch {} }
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }));
}
`;

interface ChildResult { ok: boolean; result?: unknown; error?: string }

function runChild(dataFile: string, input: Record<string, unknown>): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      tsxLoader,
      "--input-type=module",
      "--eval",
      childSource,
    ], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: dataFile,
        PORTAL_SESSION_SECRET: "commercial-durable-process-test-secret",
        TSX_TSCONFIG_PATH: join(root, "tsconfig.json"),
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
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { await access(path); return; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 10)); }
  }
  throw new Error(`child did not reach barrier: ${path}`);
}

async function collide(dataFile: string, common: Record<string, unknown>, left: Record<string, unknown>, right: Record<string, unknown>): Promise<[ChildResult, ChildResult]> {
  const barrier = join(sandbox, `barrier-${Math.random().toString(36).slice(2)}`);
  await mkdir(barrier, { recursive: true });
  const goPath = join(barrier, "go");
  const leftReady = join(barrier, "left");
  const rightReady = join(barrier, "right");
  const leftResult = runChild(dataFile, { ...common, ...left, readyPath: leftReady, goPath });
  const rightResult = runChild(dataFile, { ...common, ...right, readyPath: rightReady, goPath });
  await Promise.all([waitFor(leftReady), waitFor(rightReady)]);
  await writeFile(goPath, "go", "utf8");
  return Promise.all([leftResult, rightResult]);
}

function expectOk<T>(result: ChildResult, label: string): T {
  assert.equal(result.ok, true, `${label}: ${result.error}`);
  return result.result as T;
}

interface PaymentRow { id: string; reference?: string; amountCents: number }
interface PackView { invoiceNumber: string; payments: PaymentRow[] }

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

describe("real-process commercial durability", () => {
  it("two processes recording the same reference converge on one ledger payment, and a different amount is refused", async () => {
    const dataFile = join(sandbox, "same-reference.json");
    const seed = expectOk<{ agencyId: string; installId: string; firstLeadId: string }>(await runChild(dataFile, { action: "seed" }), "seed");
    const common = { action: "payment", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.firstLeadId, amountCents: 20_000 };
    const [left, right] = await collide(dataFile, common, { reference: "BANK-100" }, { reference: " bank-100 " });
    const leftView = expectOk<{ payments: PaymentRow[] }>(left, "left payment");
    const rightView = expectOk<{ payments: PaymentRow[] }>(right, "right payment");
    const after = expectOk<PackView>(await runChild(dataFile, { action: "get", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.firstLeadId }), "get");
    assert.equal(after.payments.length, 1, `exactly one payment must exist, saw ${JSON.stringify(after.payments)}`);
    assert.equal(after.payments[0].amountCents, 20_000);
    const ids = new Set([...leftView.payments, ...rightView.payments, ...after.payments].map(payment => payment.id));
    assert.equal(ids.size, 1, "both processes must report the single ledger payment id");

    const [okSide, conflictSide] = await collide(dataFile, { ...common, amountCents: 25_000 }, { reference: "BANK-200" }, { reference: "BANK-200", amountCents: 30_000 });
    const outcomes = [okSide, conflictSide];
    assert.equal(outcomes.filter(outcome => outcome.ok).length, 1, `exactly one of two different-amount claims wins: ${JSON.stringify(outcomes)}`);
    const refused = outcomes.find(outcome => !outcome.ok)!;
    assert.match(refused.error ?? "", /already attached to a different amount or method/);
    const final = expectOk<PackView>(await runChild(dataFile, { action: "get", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.firstLeadId }), "get");
    assert.equal(final.payments.length, 2);
  });

  it("two processes allocating invoice numbers for different parties never share a number", async () => {
    const dataFile = join(sandbox, "invoice-numbers.json");
    const seed = expectOk<{ agencyId: string; installId: string; firstLeadId: string; secondLeadId: string; invoiceNumber: string }>(await runChild(dataFile, { action: "seed" }), "seed");
    const year = new Date().getUTCFullYear();
    assert.match(seed.invoiceNumber, new RegExp(`^MM-${year}-\\d{4}$`));
    const common = { action: "save", agencyId: seed.agencyId, installId: seed.installId };
    // The first lead already holds a number; a re-save must keep it while the
    // second lead, saved at the same instant from another process, takes a new one.
    const [first, second] = await collide(dataFile, common, { leadId: seed.firstLeadId, email: "first@example.test" }, { leadId: seed.secondLeadId, email: "second@example.test" });
    const firstNumber = expectOk<{ invoiceNumber: string }>(first, "first save").invoiceNumber;
    const secondNumber = expectOk<{ invoiceNumber: string }>(second, "second save").invoiceNumber;
    assert.equal(firstNumber, seed.invoiceNumber, "a re-save keeps the party's allocated number");
    assert.notEqual(secondNumber, firstNumber, "two parties can never share an invoice number");
    assert.match(secondNumber, new RegExp(`^MM-${year}-\\d{4}$`));
    const firstView = expectOk<PackView>(await runChild(dataFile, { action: "get", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.firstLeadId }), "get first");
    const secondView = expectOk<PackView>(await runChild(dataFile, { action: "get", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.secondLeadId }), "get second");
    assert.equal(firstView.invoiceNumber, firstNumber);
    assert.equal(secondView.invoiceNumber, secondNumber);
  });

  it("a process that dies after claiming the ledger row leaves a retry that resumes the same payment once", async () => {
    const dataFile = join(sandbox, "crash-after-claim.json");
    const seed = expectOk<{ agencyId: string; installId: string; firstLeadId: string }>(await runChild(dataFile, { action: "seed" }), "seed");
    const common = { action: "payment", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.firstLeadId, amountCents: 40_000, reference: "BANK-CRASH" };
    const crashed = await runChild(dataFile, { ...common, crashAfterLedgerClaim: true });
    assert.equal(crashed.ok, false);
    assert.match(crashed.error ?? "", /forced crash after ledger claim/);
    const beforeRetry = expectOk<PackView>(await runChild(dataFile, { action: "get", agencyId: seed.agencyId, installId: seed.installId, leadId: seed.firstLeadId }), "get before retry");
    assert.equal(beforeRetry.payments.length, 0, "the crash must not have left a half-written payment on the pack");
    const retried = expectOk<{ payments: PaymentRow[] }>(await runChild(dataFile, common), "retry");
    assert.equal(retried.payments.length, 1);
    assert.equal(retried.payments[0].reference, "BANK-CRASH");
    const again = expectOk<{ payments: PaymentRow[] }>(await runChild(dataFile, common), "second retry");
    assert.equal(again.payments.length, 1, "a further retry must not duplicate the payment");
    assert.equal(again.payments[0].id, retried.payments[0].id, "every retry resumes the ledger's own payment id");
  });
});
