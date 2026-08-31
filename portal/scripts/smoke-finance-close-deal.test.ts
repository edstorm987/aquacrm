// Finance Phase 4a — the one-button "close the deal" (existing-client flavour).
//
// One action → contract (sent) + invoice (issued) + routed payment. Driven
// against the real InvoiceService over an in-memory container, with the
// contract persistence + Stripe pay-link injected. Record + surface only.

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [] } as never;

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../src/built-ins/modules/agency-finance/src/lib/tenancy";
import type { PluginStorage } from "../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/agency-finance/src/server/ports";
import type { ClientContract } from "../src/lib/clients/clientContracts";
import { containerWithDeps } from "../src/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { closeDealForClient, type CloseDealDeps } from "../src/lib/server/closeDeal";

const AGENCY_ID: AgencyId = "agency_close_smoke";
const CLIENT_ID: ClientId = "client_close_smoke";
const ACTOR: UserId = "user_owner";

function buildWorld() {
  const agency: Agency = { id: AGENCY_ID, name: "Close Smoke", slug: "close-smoke", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
  const client: Client = { id: CLIENT_ID, agencyId: AGENCY_ID, name: "Meeting Ltd", slug: "meeting", brand: { primaryColor: "#0af" }, stage: "live", status: "active", createdAt: 0, updatedAt: 0 };
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> { const keys = [...data.keys()]; return prefix ? keys.filter(k => k.startsWith(prefix)) : keys; },
  };
  const tenant: TenantPort = {
    getAgency: id => (id === AGENCY_ID ? agency : null),
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };
  const user: UserPort = { getUser: () => null };
  const activity: ActivityLogPort = { logActivity: (input) => ({ id: "act", ts: 0, ...input } as ActivityEntry), listActivity: () => [] };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall(_s: PluginInstallScope, _p: string): PluginInstall | null { return null; } };
  return { storage, tenant, user, activity, events, pluginInstalls };
}

let finance: ReturnType<typeof containerWithDeps>;
let idSeq = 0;

function depsFor(overrides: Partial<CloseDealDeps> = {}): { deps: CloseDealDeps; saved: ClientContract[][] } {
  const saved: ClientContract[][] = [];
  const deps: CloseDealDeps = {
    clientId: CLIENT_ID,
    finance,
    existingContracts: [],
    saveContracts: (contracts) => { saved.push(contracts); },
    makeId: (prefix) => `${prefix}_${(idSeq += 1)}`,
    now: 1_700_000_000_000,
    actor: ACTOR,
    ...overrides,
  };
  return { deps, saved };
}

before(() => {
  const world = buildWorld();
  finance = containerWithDeps({ agencyId: AGENCY_ID, storage: world.storage, tenant: world.tenant, user: world.user, activity: world.activity, events: world.events, pluginInstalls: world.pluginInstalls });
});

const TERMS = "Ten pages, four weeks, 50% on signature and 50% on launch.";

test("Stripe close: one action → sent contract + issued invoice + a pay-link", async () => {
  const { deps, saved } = depsFor({ createPayLink: async () => "https://checkout.stripe.test/cs_123" });
  const result = await closeDealForClient(
    { title: "Website build", amountCents: 250_000, currency: "gbp", channel: "stripe", dueAt: 1_700_500_000_000, contractSummary: "Full site + care", contractBody: TERMS },
    deps,
  );

  // Contract — created as sent, persisted. It reaches "sent" BECAUSE the agreed
  // terms were supplied; see the draft case below for what happens without them.
  assert.equal(result.contract.status, "sent");
  assert.equal(result.contract.body, TERMS);
  assert.equal(result.contract.issuedAt, 1_700_000_000_000, "an issued agreement carries the moment it went out");
  assert.equal(result.contract.title, "Website build");
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0].id, result.contract.id);

  // Invoice — created + issued for the amount.
  assert.equal(result.invoice.status, "sent");
  assert.equal(result.invoice.totalCents, 250_000);
  assert.equal(result.invoice.clientId, CLIENT_ID);
  const stored = await finance.invoices.get(result.invoice.id);
  assert.equal(stored?.status, "sent", "the invoice is really persisted as sent");

  // Routed payment — Stripe pay-link.
  assert.equal(result.channel, "stripe");
  assert.equal(result.payLink, "https://checkout.stripe.test/cs_123");
  assert.match(result.paymentInstruction, /pay-link/i);
});

// ─── Reviewable terms: a title is not an agreement (issues #39) ───────────────
//
// The close used to mint every contract directly as "sent", so a title-only
// record landed in the customer portal with an Accept button on it. It now
// reaches "sent" only when there is something to read.

test("a close with NO terms saves the agreement as a DRAFT, not as sent", async () => {
  const { deps, saved } = depsFor();
  const result = await closeDealForClient(
    { title: "Handshake deal", amountCents: 90_000, currency: "gbp", channel: "cash", dueAt: 1_700_500_000_000, contractSummary: "Agreed in the meeting" },
    deps,
  );

  assert.equal(result.contract.status, "draft", "a title + a summary is not something a client can agree to");
  assert.equal(result.contract.issuedAt, undefined, "nothing was issued, so no issued date is stamped");
  assert.equal(result.contract.body, undefined);
  assert.equal(saved.length, 1, "the agreement is still recorded — it is just honest about being a draft");
  assert.equal(saved[0][0].status, "draft", "and it is PERSISTED as a draft");
  assert.equal(result.invoice.status, "sent", "the close still bills: the invoice is the billing artifact");
});

test("an attached document is reviewable terms too — that close is sent", async () => {
  const { deps } = depsFor();
  const result = await closeDealForClient(
    { title: "Signed PDF deal", amountCents: 30_000, currency: "gbp", channel: "cash", dueAt: 1_700_500_000_000, contractDocumentUrl: "https://files.example.com/agreement.pdf", contractDocumentName: "agreement.pdf" },
    deps,
  );
  assert.equal(result.contract.status, "sent");
  assert.equal(result.contract.documentUrl, "https://files.example.com/agreement.pdf");
  assert.equal(result.contract.documentName, "agreement.pdf");
});

test("whitespace is not terms", async () => {
  const { deps } = depsFor();
  const result = await closeDealForClient(
    { title: "Blank terms", amountCents: 10_000, currency: "gbp", channel: "cash", dueAt: 1_700_500_000_000, contractBody: "   \n  " },
    deps,
  );
  assert.equal(result.contract.status, "draft", "a body of spaces cannot make an agreement sendable");
});

test("Bank-transfer close: contract + issued invoice, no pay-link, manual instruction", async () => {
  const { deps } = depsFor(); // no createPayLink
  const result = await closeDealForClient(
    { title: "Retainer", amountCents: 80_000, currency: "gbp", channel: "bank-transfer", dueAt: 1_700_500_000_000 },
    deps,
  );
  assert.equal(result.invoice.status, "sent");
  assert.equal(result.payLink, undefined);
  assert.match(result.paymentInstruction, /bank details/i);
});

test("Cash close routes to a cash instruction", async () => {
  const { deps } = depsFor();
  const result = await closeDealForClient(
    { title: "Workshop", amountCents: 20_000, currency: "gbp", channel: "cash", dueAt: 1_700_500_000_000 },
    deps,
  );
  assert.equal(result.payLink, undefined);
  assert.match(result.paymentInstruction, /cash/i);
});

test("Stripe channel but Stripe not configured (no pay-link fn) tells you to set it up", async () => {
  const { deps } = depsFor(); // channel stripe, but no createPayLink
  const result = await closeDealForClient(
    { title: "Ad-hoc", amountCents: 10_000, currency: "gbp", channel: "stripe", dueAt: 1_700_500_000_000 },
    deps,
  );
  assert.equal(result.payLink, undefined);
  assert.match(result.paymentInstruction, /set up stripe/i);
});

test("a failing Stripe pay-link is non-fatal — the contract + invoice still land", async () => {
  const { deps, saved } = depsFor({ createPayLink: async () => { throw new Error("stripe not installed"); } });
  const result = await closeDealForClient(
    { title: "Sprint", amountCents: 40_000, currency: "gbp", channel: "stripe", dueAt: 1_700_500_000_000 },
    deps,
  );
  assert.equal(result.invoice.status, "sent", "the invoice is still issued");
  assert.equal(saved.length, 1, "the contract is still saved");
  assert.equal(result.payLink, undefined);
  assert.match(result.paymentInstruction, /couldn't be created|check your Stripe/i);
});

test("a blank title or non-positive amount is refused before anything is created", async () => {
  const { deps, saved } = depsFor();
  await assert.rejects(closeDealForClient({ title: "  ", amountCents: 100, currency: "gbp", channel: "cash", dueAt: 1 }, deps), /title is required/i);
  await assert.rejects(closeDealForClient({ title: "X", amountCents: 0, currency: "gbp", channel: "cash", dueAt: 1 }, deps), /greater than zero/i);
  assert.equal(saved.length, 0, "nothing persisted on a rejected close");
});

// ─── Idempotency: a double-clicked close must not double-bill ─────────────────
//
// Each call rebuilds deps from a `store` (as the route rebuilds existingContracts
// from client.metadata per request), so this exercises the real re-read path.

function depsWithStore(store: { contracts: ClientContract[] }, overrides: Partial<CloseDealDeps> = {}): CloseDealDeps {
  return {
    clientId: CLIENT_ID,
    finance,
    existingContracts: store.contracts,
    saveContracts: (contracts) => { store.contracts = contracts; },
    makeId: (prefix) => `${prefix}_${(idSeq += 1)}`,
    now: 1_700_000_000_000,
    actor: ACTOR,
    ...overrides,
  };
}

test("close-deal is idempotent on the key: a resubmit reuses the one contract + invoice (no double-bill)", async () => {
  const store = { contracts: [] as ClientContract[] };
  let payLinks = 0;
  const input = { title: "Care plan", amountCents: 120_000, currency: "gbp" as const, channel: "stripe" as const, dueAt: 1_700_500_000_000, idempotencyKey: "close-key-1" };

  const first = await closeDealForClient(input, depsWithStore(store, { createPayLink: async () => `https://pay/${++payLinks}` }));
  const second = await closeDealForClient(input, depsWithStore(store, { createPayLink: async () => `https://pay/${++payLinks}` }));

  assert.equal(second.deduped, true, "the resubmit is recognised as a duplicate close");
  assert.equal(first.invoice.id, second.invoice.id, "same invoice — not a second bill");
  assert.equal(first.contract.id, second.contract.id, "same contract");
  assert.equal(store.contracts.length, 1, "exactly one contract persisted");
  assert.equal(store.contracts.filter(c => c.id === first.contract.id).length, 1, "no duplicate contract in the list");
  assert.equal(payLinks, 1, "no second Stripe pay-link created on the resubmit");
  const invoicesForClient = await finance.invoices.list({ clientId: CLIENT_ID });
  assert.equal(invoicesForClient.filter(i => i.id === first.invoice.id).length, 1, "one invoice with that id");
});

test("a genuinely separate close (new key) is allowed — two contracts + two invoices", async () => {
  const store = { contracts: [] as ClientContract[] };
  const a = await closeDealForClient({ title: "Phase 1", amountCents: 50_000, currency: "gbp", channel: "bank-transfer", dueAt: 1_700_500_000_000, idempotencyKey: "close-A" }, depsWithStore(store));
  const b = await closeDealForClient({ title: "Phase 2", amountCents: 70_000, currency: "gbp", channel: "bank-transfer", dueAt: 1_700_500_000_000, idempotencyKey: "close-B" }, depsWithStore(store));

  assert.equal(a.deduped ?? false, false);
  assert.equal(b.deduped ?? false, false);
  assert.notEqual(a.invoice.id, b.invoice.id, "two distinct invoices");
  assert.notEqual(a.contract.id, b.contract.id, "two distinct contracts");
  assert.equal(store.contracts.length, 2, "both closes persisted");
});
