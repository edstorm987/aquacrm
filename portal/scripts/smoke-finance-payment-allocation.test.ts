// Finance payment allocation — real separate-process proof over one isolated
// file-backed PortalState. Each child has its own module cache and storage
// snapshot, matching multiple app processes rather than Promise.all in one VM.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { after, test } from "node:test";

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-finance-payment-allocation-"));
const STATE_FILE = join(SANDBOX, "portal-state.json");
const INSTALL_ID = "agency_payment_allocation|_agency|agency-finance";
const AGENCY_ID = "agency_payment_allocation";
const CLIENT_ID = "client_payment_allocation";

const CHILD_SOURCE = String.raw`
const [pluginStorageImported, financeImported, portalStorageImported] = await Promise.all([
  import(process.env.AQUA_PLUGIN_STORAGE_MODULE),
  import(process.env.AQUA_FINANCE_MODULE),
  import(process.env.AQUA_PORTAL_STORAGE_MODULE),
]);
const pluginStorageModule = pluginStorageImported.default || pluginStorageImported;
const financeModule = financeImported.default || financeImported;
const portalStorageModule = portalStorageImported.default || portalStorageImported;
await portalStorageModule.ensureHydrated({ fresh: true });
const agencyId = process.env.AQUA_AGENCY_ID;
const clientId = process.env.AQUA_CLIENT_ID;
const client = { id: clientId, agencyId, name: "Allocation Client", slug: "allocation-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
const agency = { id: agencyId, name: "Allocation Agency", slug: "allocation-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
const storage = pluginStorageModule.makePluginStorage(process.env.AQUA_INSTALL_ID);
const finance = financeModule.containerWithDeps({
  agencyId,
  storage,
  tenant: {
    getAgency: id => id === agencyId ? agency : null,
    getClient: id => id === clientId ? client : null,
    getClientForAgency: (requestedAgencyId, id) => requestedAgencyId === agencyId && id === clientId ? client : null,
  },
  user: { getUser: () => null },
  activity: {
    logActivity: input => ({ id: "activity", ts: Date.now(), ...input }),
    listActivity: () => [],
  },
  events: { emit() {} },
  pluginInstalls: { getInstall: () => null },
});
const input = JSON.parse(process.env.AQUA_INPUT || "{}");
try {
  let value;
  if (process.env.AQUA_ACTION === "seed") {
    let invoice = await finance.invoices.create({
      clientId,
      issuedAt: Date.parse("2026-08-26T09:00:00Z"),
      dueAt: Date.parse("2026-09-09T09:00:00Z"),
      lineItems: [{ description: "Allocation proof", quantity: 1, unitCents: input.totalCents }],
      currency: "gbp",
      idempotencyKey: input.key,
    }, "owner");
    if (input.status !== "draft") {
      invoice = await finance.invoices.update(invoice.id, { status: input.status === "void" ? "void" : "sent" }, "owner");
    }
    if (input.status === "overdue") {
      invoice = await finance.invoices.update(invoice.id, { status: "overdue" }, "owner");
    }
    if (input.status === "paid" || input.status === "refunded") {
      const settled = await finance.payments.record("owner", {
        invoiceId: invoice.id,
        amountCents: input.totalCents,
        currency: "gbp",
        method: "bank-transfer",
        idempotencyKey: "seed-payment:" + input.key,
      });
      invoice = settled.invoice;
    }
    if (input.status === "refunded") {
      invoice = await finance.invoices.update(invoice.id, { status: "refunded" }, "owner");
    }
    value = invoice;
  } else if (process.env.AQUA_ACTION === "record") {
    value = await finance.payments.record("owner", input);
  } else if (process.env.AQUA_ACTION === "snapshot") {
    const refNow = Date.now();
    value = {
      invoice: await finance.invoices.get(input.invoiceId),
      payments: await finance.payments.listForInvoice(input.invoiceId),
      pnl: await finance.pnl.founderSnapshot(refNow),
      report: await finance.reports.revenueSnapshot({ from: 0, to: Date.parse("2027-01-01T00:00:00Z"), currency: "gbp" }),
    };
  } else {
    throw new Error("unknown child action");
  }
  await portalStorageModule.flushPendingWrites();
  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) {
  await portalStorageModule.flushPendingWrites();
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}
`;

interface ChildResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}

interface InvoiceSummary {
  id: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void" | "refunded";
  totalCents: number;
}

interface PaymentSummary {
  id: string;
  invoiceId: string;
  amountCents: number;
}

interface PaymentResult {
  payment: PaymentSummary;
  invoice: InvoiceSummary;
  settled: boolean;
  deduped: boolean;
}

interface Snapshot {
  invoice: InvoiceSummary;
  payments: PaymentSummary[];
  pnl: {
    topClients: Array<{ clientId: string; lifetimeCents: number }>;
    trailingMonths: Array<{ revenueCents: number }>;
  };
  report: { totalPaidCents: number };
}

function moduleUrl(path: string): string {
  return pathToFileURL(join(REPO_ROOT, path)).href;
}

async function runChild<T>(action: "seed" | "record" | "snapshot", input: Record<string, unknown>): Promise<ChildResult<T>> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      TSX_LOADER,
      "--input-type=module",
      "--eval",
      CHILD_SOURCE,
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: STATE_FILE,
        TSX_TSCONFIG_PATH: join(REPO_ROOT, "tsconfig.json"),
        AQUA_ACTION: action,
        AQUA_INPUT: JSON.stringify(input),
        AQUA_INSTALL_ID: INSTALL_ID,
        AQUA_AGENCY_ID: AGENCY_ID,
        AQUA_CLIENT_ID: CLIENT_ID,
        AQUA_PLUGIN_STORAGE_MODULE: moduleUrl("src/lib/server/pluginStorage.ts"),
        AQUA_FINANCE_MODULE: moduleUrl("src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts"),
        AQUA_PORTAL_STORAGE_MODULE: moduleUrl("src/server/storage.ts"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) {
        rejectChild(new Error(`payment-allocation child exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolveChild(JSON.parse(stdout) as ChildResult<T>);
      } catch {
        rejectChild(new Error(`payment-allocation child returned non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

async function seed(key: string, status: InvoiceSummary["status"] = "sent", totalCents = 10_000): Promise<InvoiceSummary> {
  const result = await runChild<InvoiceSummary>("seed", { key, status, totalCents });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.value);
  return result.value;
}

function paymentInput(invoiceId: string, amountCents: number, idempotencyKey: string): Record<string, unknown> {
  return { invoiceId, amountCents, currency: "gbp", method: "bank-transfer", idempotencyKey };
}

async function snapshot(invoiceId: string): Promise<Snapshot> {
  const result = await runChild<Snapshot>("snapshot", { invoiceId });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.value);
  return result.value;
}

function paidCents(value: Snapshot): number {
  return value.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
}

after(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});

test("cross-process allocations never exceed the live outstanding balance", async () => {
  const racedInvoice = await seed("race-over-allocation");
  const [raceA, raceB] = await Promise.all([
    runChild<PaymentResult>("record", paymentInput(racedInvoice.id, 7_000, "race-a")),
    runChild<PaymentResult>("record", paymentInput(racedInvoice.id, 7_000, "race-b")),
  ]);
  const winners = [raceA, raceB].filter(result => result.ok);
  const rejected = [raceA, raceB].filter(result => !result.ok);
  assert.equal(winners.length, 1, "only one competing 70% allocation is accepted");
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].error ?? "", /exceeds outstanding balance of 3000 GBP/);

  let current = await snapshot(racedInvoice.id);
  assert.equal(current.invoice.status, "sent");
  assert.equal(current.payments.length, 1);
  assert.equal(paidCents(current), 7_000, "a fresh process sees no over-allocation");

  const tail = await runChild<PaymentResult>("record", paymentInput(racedInvoice.id, 3_000, "race-tail"));
  assert.equal(tail.ok, true, tail.error);
  assert.equal(tail.value?.settled, true);
  current = await snapshot(racedInvoice.id);
  assert.equal(current.invoice.status, "paid");
  assert.equal(paidCents(current), 10_000);
  assert.equal(current.pnl.topClients.find(row => row.clientId === CLIENT_ID)?.lifetimeCents, 10_000);
  assert.equal(current.pnl.trailingMonths.reduce((sum, month) => sum + month.revenueCents, 0), 10_000);
  assert.equal(current.report.totalPaidCents, 10_000, "the settled-invoice report agrees with the capped ledger");

  const winning = winners[0].value;
  assert.ok(winning);
  const winningKey = raceA.ok ? "race-a" : "race-b";
  const retry = await runChild<PaymentResult>("record", paymentInput(
    racedInvoice.id,
    winning.payment.amountCents,
    winningKey,
  ));
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.value?.deduped, true, "the winning intent remains retryable after settlement");
  assert.equal(retry.value?.payment.id, winning.payment.id);
  assert.equal(paidCents(await snapshot(racedInvoice.id)), 10_000);

  const complementaryInvoice = await seed("race-complementary");
  const complementary = await Promise.all([
    runChild<PaymentResult>("record", paymentInput(complementaryInvoice.id, 4_000, "complementary-a")),
    runChild<PaymentResult>("record", paymentInput(complementaryInvoice.id, 6_000, "complementary-b")),
  ]);
  assert.ok(complementary.every(result => result.ok), "two valid partials both survive the race");
  const complementarySnapshot = await snapshot(complementaryInvoice.id);
  assert.equal(complementarySnapshot.invoice.status, "paid");
  assert.equal(complementarySnapshot.payments.length, 2);
  assert.equal(paidCents(complementarySnapshot), 10_000);
  assert.equal(complementarySnapshot.pnl.topClients.find(row => row.clientId === CLIENT_ID)?.lifetimeCents, 20_000);
  assert.equal(complementarySnapshot.report.totalPaidCents, 20_000);
});

test("overpayments and non-collectible invoice states leave the ledger unchanged", async () => {
  const overpaymentInvoice = await seed("single-overpayment");
  const overpayment = await runChild<PaymentResult>("record", paymentInput(overpaymentInvoice.id, 10_001, "too-much"));
  assert.equal(overpayment.ok, false);
  assert.match(overpayment.error ?? "", /exceeds outstanding balance of 10000 GBP/);
  const unchanged = await snapshot(overpaymentInvoice.id);
  assert.equal(unchanged.invoice.status, "sent");
  assert.equal(unchanged.payments.length, 0);

  for (const status of ["draft", "void", "paid", "refunded"] as const) {
    const invoice = await seed(`non-collectible-${status}`, status);
    const before = await snapshot(invoice.id);
    const attempt = await runChild<PaymentResult>("record", paymentInput(invoice.id, 1, `blocked-${status}`));
    assert.equal(attempt.ok, false, `${status} must reject a new payment`);
    assert.match(attempt.error ?? "", new RegExp(`${status} invoice is not collectible`));
    const afterAttempt = await snapshot(invoice.id);
    assert.equal(afterAttempt.invoice.status, status);
    assert.equal(afterAttempt.payments.length, before.payments.length);
    assert.equal(paidCents(afterAttempt), paidCents(before));
  }
});

test("income and Stripe checkout surfaces use the same collectible outstanding calculation", () => {
  const incomeSource = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx"), "utf8");
  assert.match(incomeSource, /invoices\.filter\(invoice => isCollectibleInvoiceStatus\(invoice\.status\) && invoiceOutstandingCents\(invoice, payments, refunds\) > 0\)/);
  assert.match(incomeSource, /max=\{\(remaining \/ 100\)\.toFixed\(2\)\}/);
  assert.match(incomeSource, /No collectible invoice has an outstanding balance\./);

  const stripeSource = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts"), "utf8");
  assert.match(stripeSource, /if \(!isCollectibleInvoiceStatus\(invoice\.status\)\)/);
  assert.match(stripeSource, /invoiceOutstandingCents\(invoice, payments, refunds\)/);
  assert.match(stripeSource, /amountCents: outstandingCents,/);
});
