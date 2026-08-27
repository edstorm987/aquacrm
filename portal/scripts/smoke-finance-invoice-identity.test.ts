// Finance invoice identity — real separate-process proof over one isolated
// file-backed PortalState. This catches races that Promise.all in one module
// cannot: each child has its own module cache and storage snapshot.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-finance-invoice-"));
const STATE_FILE = join(SANDBOX, "portal-state.json");
const INSTALL_ID = "agency_invoice_cross_process|_agency|agency-finance";
const AGENCY_ID = "agency_invoice_cross_process";
const CLIENT_ID = "client_invoice_cross_process";

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
const client = { id: clientId, agencyId, name: "Cross Process Client", slug: "cross-process-client", brand: { primaryColor: "#000" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
const agency = { id: agencyId, name: "Cross Process Agency", slug: "cross-process-agency", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
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
const action = process.env.AQUA_ACTION;
const value = action === "create"
  ? await finance.invoices.create(JSON.parse(process.env.AQUA_INPUT), "owner")
  : await finance.invoices.list();
await portalStorageModule.flushPendingWrites();
process.stdout.write(JSON.stringify({ ok: true, value }));
`;

interface ChildResult<T = unknown> {
  ok: boolean;
  value: T;
}

function moduleUrl(path: string): string {
  return pathToFileURL(join(REPO_ROOT, path)).href;
}

async function runChild<T>(action: "create" | "list", input?: Record<string, unknown>): Promise<ChildResult<T>> {
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
        AQUA_INPUT: JSON.stringify(input ?? {}),
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
        rejectChild(new Error(`invoice child exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolveChild(JSON.parse(stdout) as ChildResult<T>);
      } catch {
        rejectChild(new Error(`invoice child returned non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

function invoiceInput(idempotencyKey: string, unitCents: number): Record<string, unknown> {
  return {
    clientId: CLIENT_ID,
    issuedAt: Date.parse("2026-08-26T09:00:00Z"),
    dueAt: Date.parse("2026-09-09T09:00:00Z"),
    lineItems: [{ description: "Cross-process work", quantity: 1, unitCents }],
    currency: "gbp",
    idempotencyKey,
  };
}

after(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});

test("distinct creates and a same-intent retry stay unique across processes and reload", async () => {
  const [alpha, beta] = await Promise.all([
    runChild<{ id: string; number: string }>("create", invoiceInput("form-alpha", 10_000)),
    runChild<{ id: string; number: string }>("create", invoiceInput("form-beta", 20_000)),
  ]);
  assert.notEqual(alpha.value.id, beta.value.id);
  assert.notEqual(alpha.value.number, beta.value.number, "two processes cannot reserve the same human number");

  const [first, retry] = await Promise.all([
    runChild<{ id: string; number: string }>("create", invoiceInput("form-shared-retry", 30_000)),
    runChild<{ id: string; number: string }>("create", invoiceInput("form-shared-retry", 30_000)),
  ]);
  assert.equal(first.value.id, retry.value.id, "both processes adopt the same deterministic invoice row");
  assert.equal(first.value.number, retry.value.number, "the retry adopts the reserved human number");

  const reloaded = await runChild<Array<{ id: string; number: string }>>("list");
  assert.equal(reloaded.value.length, 3, "a fresh process sees one row per intent");
  assert.equal(new Set(reloaded.value.map(invoice => invoice.id)).size, 3);
  assert.equal(new Set(reloaded.value.map(invoice => invoice.number)).size, 3, "every persisted invoice number is unique");

  const persisted = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { pluginData?: Record<string, Record<string, unknown>> };
  assert.equal(persisted.pluginData?.[INSTALL_ID]?.["invoices/seq/2026"], 3, "the retry did not consume a fourth number");
});

test("the mounted create form sends one stable operation key", () => {
  const source = readFileSync(join(REPO_ROOT, "src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx"), "utf8");
  assert.match(source, /const \[idempotencyKey\] = useState\(freshIdempotencyKey\)/);
  assert.match(source, /notes:[\s\S]{0,220}idempotencyKey,/);
});
