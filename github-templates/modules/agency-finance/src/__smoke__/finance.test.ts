// Agency-finance plugin smoke. node:test via tsx --test.
//
// Walks: seedDefaults idempotent, invoice CRUD + status transitions,
// expense submit → approve → reimburse, revenueSnapshot aggregates,
// activity log + event bus side-effects.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
  UserProjection,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";

const AGENCY_ID: AgencyId = "agency_fin_smoke";
const CLIENT_ID: ClientId = "client_fin_smoke";
const ACTOR: UserId = "user_admin";
const STAFF_ID: UserId = "user_staff";

function buildWorld() {
  const agency: Agency = {
    id: AGENCY_ID, name: "Smoke Finance Agency", slug: "smoke-fin",
    brand: { primaryColor: "#000" }, status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const client: Client = {
    id: CLIENT_ID, agencyId: AGENCY_ID, name: "Felicia Smoke", slug: "felicia",
    brand: { primaryColor: "#f80" }, stage: "live", status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const profile: UserProjection = {
    id: STAFF_ID, email: "staff@smoke-fin.test", name: "Staff Member", agencyId: AGENCY_ID,
  };

  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  const tenant: TenantPort = {
    getAgency: id => (id === AGENCY_ID ? agency : null),
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };
  const user: UserPort = {
    getUser: id => (id === STAFF_ID ? profile : null),
  };
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) { return activityLog.filter(e => e.agencyId === filter.agencyId); },
  };
  const eventBus: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; },
  };
  return {
    storage, tenant, user, activity, events: eventBus, pluginInstalls,
    inspect: { activityLog, events },
  };
}

describe("agency-finance smoke", () => {
  let world: ReturnType<typeof buildWorld>;
  let services: ReturnType<typeof containerWithDeps>;
  let categoryId: string;
  let invoiceId: string;
  let expenseId: string;

  before(() => {
    world = buildWorld();
    services = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: world.storage,
      tenant: world.tenant,
      user: world.user,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
    });
  });

  test("step 0: seed default categories (idempotent)", async () => {
    const first = await services.categories.seedDefaults(ACTOR);
    assert.equal(first.seeded, 6, "six default categories seeded");
    const second = await services.categories.seedDefaults(ACTOR);
    assert.equal(second.seeded, 0);
    assert.equal(second.existed, 6);

    const list = await services.categories.list();
    assert.deepEqual(
      list.map(c => c.name).sort(),
      ["Marketing", "Office", "Other", "Salaries", "Software", "Travel"],
    );
    assert.ok(list.every(c => c.isDefault));
    categoryId = list.find(c => c.name === "Software")!.id;
  });

  test("step 1: create category fails on duplicate name", async () => {
    await assert.rejects(
      services.categories.create({ name: "software" }, ACTOR),
      /already exists/i,
    );
    // Adding a new unique category works.
    const cat = await services.categories.create({ name: "R&D" }, ACTOR);
    assert.equal(cat.isDefault, false);
  });

  test("step 2: invoice create + status transitions + markPaid", async () => {
    const inv = await services.invoices.create({
      clientId: CLIENT_ID,
      dueAt: Date.now() + 30 * 86400_000,
      lineItems: [
        { description: "Design retainer", quantity: 1, unitCents: 200000 },
        { description: "Hours over budget", quantity: 5, unitCents: 15000 },
      ],
      taxCents: 5000,
      currency: "usd",
    }, ACTOR);
    invoiceId = inv.id;
    assert.equal(inv.status, "draft");
    assert.equal(inv.subtotalCents, 200000 + 5 * 15000);          // 275000
    assert.equal(inv.totalCents, 275000 + 5000);                  // 280000
    assert.match(inv.number, /^INV-\d{4}-\d{4}$/);

    // draft → sent
    const sent = await services.invoices.update(invoiceId, { status: "sent" }, ACTOR);
    assert.equal(sent?.status, "sent");

    // Cannot delete a non-draft invoice.
    await assert.rejects(
      services.invoices.delete(invoiceId, ACTOR),
      /Only draft/i,
    );

    // update() refuses status:"paid" — markPaid is the sole path so
    // paidAt + paidVia + externalRef + activity + event fire together.
    await assert.rejects(
      services.invoices.update(invoiceId, { status: "paid" }, ACTOR),
      /Use markPaid/i,
    );
  });

  test("step 3: markPaid records payment + activity + event", async () => {
    const before = world.inspect.events.filter(e => e.name === "invoice.paid").length;
    const paid = await services.invoices.markPaid(invoiceId, {
      externalRef: "BANK-TXN-1234",
      paidVia: "bank-transfer",
    }, ACTOR);
    assert.equal(paid?.status, "paid");
    assert.equal(paid?.paidVia, "bank-transfer");
    assert.equal(paid?.externalRef, "BANK-TXN-1234");

    // Idempotent — second markPaid is a no-op.
    const second = await services.invoices.markPaid(invoiceId, { externalRef: "ignored" }, ACTOR);
    assert.equal(second?.externalRef, "BANK-TXN-1234", "first ref preserved");

    const after = world.inspect.events.filter(e => e.name === "invoice.paid").length;
    assert.equal(after, before + 1);
  });

  test("step 4: invoice HTML render", async () => {
    const html = await services.invoices.renderInvoiceHtml(invoiceId);
    assert.ok(html);
    assert.match(html ?? "", /INV-\d{4}-\d{4}/);
    assert.match(html ?? "", /Design retainer/);
    assert.match(html ?? "", /Felicia Smoke/);
  });

  test("step 5: expense submit → approve → reimburse", async () => {
    const exp = await services.expenses.create({
      categoryId,
      vendor: "GitHub",
      description: "Annual GitHub team plan",
      amountCents: 30000,
      staffId: STAFF_ID,
    }, ACTOR);
    expenseId = exp.id;
    assert.equal(exp.status, "pending");

    // Cannot reimburse without approval first.
    await assert.rejects(
      services.expenses.reimburse(expenseId, ACTOR),
      /must be approved/i,
    );

    const approved = await services.expenses.approve(expenseId, ACTOR, "Looks good");
    assert.equal(approved?.status, "approved");
    assert.equal(approved?.decisionNote, "Looks good");

    // Approving twice is a no-op (idempotent).
    const second = await services.expenses.approve(expenseId, ACTOR);
    assert.equal(second?.status, "approved");

    const reimbursed = await services.expenses.reimburse(expenseId, ACTOR);
    assert.equal(reimbursed?.status, "reimbursed");
    assert.ok(reimbursed?.reimbursedAt);
  });

  test("step 6: expense reject path", async () => {
    const exp = await services.expenses.create({
      categoryId,
      vendor: "Suspicious vendor",
      amountCents: 99999,
    }, ACTOR);
    const rejected = await services.expenses.reject(exp.id, ACTOR, "Out of policy");
    assert.equal(rejected?.status, "rejected");
    assert.equal(rejected?.decisionNote, "Out of policy");

    // Cannot edit a rejected expense.
    await assert.rejects(
      services.expenses.update(exp.id, { vendor: "Different" }, ACTOR),
      /Cannot edit/i,
    );
  });

  test("step 7: revenueSnapshot aggregates", async () => {
    const from = Date.now() - 365 * 86400_000;
    const to = Date.now() + 86400_000;
    const snap = await services.reports.revenueSnapshot({ from, to, currency: "usd" });
    assert.equal(snap.invoicesIssued, 1);
    assert.equal(snap.invoicesPaid, 1);
    assert.equal(snap.totalIssuedCents, 280000);
    assert.equal(snap.totalPaidCents, 280000);
    assert.equal(snap.totalExpensesCents, 30000, "only reimbursed expense counts");
    assert.equal(snap.netCents, 280000 - 30000);

    // Two expenses by category — but only Software (reimbursed +
    // rejected — wait, rejected gets filtered out). The Software
    // category has 1 reimbursed (30000); Suspicious-vendor on
    // Software is rejected → excluded.
    const softwareAgg = snap.expensesByCategory.find(c => c.categoryName === "Software");
    assert.ok(softwareAgg);
    assert.equal(softwareAgg?.amountCents, 30000);
    assert.equal(softwareAgg?.count, 1);
  });

  test("step 8: side-effects — activity + event bus", async () => {
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, limit: 100 });
    const actions = log.map(e => e.action);
    assert.ok(actions.includes("invoice.created"));
    assert.ok(actions.includes("invoice.sent"));
    assert.ok(actions.includes("invoice.paid"));
    assert.ok(actions.includes("expense.created"));
    assert.ok(actions.includes("expense.approved"));
    assert.ok(actions.includes("expense.reimbursed"));
    assert.ok(actions.includes("expense.rejected"));

    const eventNames = world.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("invoice.created"));
    assert.ok(eventNames.includes("invoice.sent"));
    assert.ok(eventNames.includes("invoice.paid"));
    assert.ok(eventNames.includes("expense.created"));
    assert.ok(eventNames.includes("expense.approved"));
    assert.ok(eventNames.includes("expense.reimbursed"));
    assert.ok(eventNames.includes("category.created"));
  });
});

// ─── R007: Payments / Plans / P&L ────────────────────────────────────────

describe("agency-finance R007 — Payments / Plans / P&L", () => {
  function freshContainer() {
    const w = buildWorld();
    const c = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: w.storage,
      tenant: w.tenant,
      user: w.user,
      activity: w.activity,
      events: w.events,
      pluginInstalls: w.pluginInstalls,
    });
    return { w, c };
  }

  async function makeInvoice(c: ReturnType<typeof containerWithDeps>, total: number): Promise<string> {
    const inv = await c.invoices.create({
      clientId: CLIENT_ID,
      issuedAt: Date.now(),
      dueAt: Date.now() + 7 * 86_400_000,
      lineItems: [{ description: "Service", quantity: 1, unitCents: total }],
      currency: "gbp",
    }, ACTOR);
    await c.invoices.update(inv.id, { status: "sent" }, ACTOR);
    return inv.id;
  }

  test("R007-1: PaymentService.record stores ciphertext-free payload + emits agency-finance.payment.recorded", async () => {
    const { w, c } = freshContainer();
    const invId = await makeInvoice(c, 5_000);
    const result = await c.payments.record(ACTOR, {
      invoiceId: invId, amountCents: 5_000, currency: "gbp", method: "bank-transfer",
    });
    assert.equal(result.payment.amountCents, 5_000);
    assert.equal(result.payment.clientId, CLIENT_ID);
    assert.ok(w.inspect.events.some(e => e.name === "agency-finance.payment.recorded"));
  });

  test("R007-2: payment >= total settles the invoice (status -> paid)", async () => {
    const { c } = freshContainer();
    const invId = await makeInvoice(c, 4_200);
    const r = await c.payments.record(ACTOR, {
      invoiceId: invId, amountCents: 4_200, currency: "gbp", method: "stripe",
    });
    assert.equal(r.settled, true);
    assert.equal(r.invoice.status, "paid");
  });

  test("R007-3: partial payments don't settle; second payment crossing total does", async () => {
    const { c } = freshContainer();
    const invId = await makeInvoice(c, 10_000);
    const r1 = await c.payments.record(ACTOR, {
      invoiceId: invId, amountCents: 4_000, currency: "gbp", method: "manual",
    });
    assert.equal(r1.settled, false);
    assert.equal(r1.invoice.status, "sent");
    const r2 = await c.payments.record(ACTOR, {
      invoiceId: invId, amountCents: 6_500, currency: "gbp", method: "manual",
    });
    assert.equal(r2.settled, true);
    assert.equal(r2.invoice.status, "paid");
  });

  test("R007-4: payment currency mismatch rejects", async () => {
    const { c } = freshContainer();
    const invId = await makeInvoice(c, 5_000);
    await assert.rejects(
      () => c.payments.record(ACTOR, { invoiceId: invId, amountCents: 5_000, currency: "usd", method: "manual" }),
      /currency must match/,
    );
  });

  test("R007-5: PlanService CRUD + assignClient moves a client between plans", async () => {
    const { c } = freshContainer();
    const a = await c.plans.create(ACTOR, { tier: "growth", label: "Growth", monthlyAmountCents: 50_000 });
    const b = await c.plans.create(ACTOR, { tier: "scale", label: "Scale", monthlyAmountCents: 150_000 });
    await c.plans.assignClient(ACTOR, CLIENT_ID, a.id);
    let aFresh = await c.plans.get(a.id);
    assert.deepEqual(aFresh?.clientIds, [CLIENT_ID]);
    await c.plans.assignClient(ACTOR, CLIENT_ID, b.id);
    aFresh = await c.plans.get(a.id);
    const bFresh = await c.plans.get(b.id);
    assert.deepEqual(aFresh?.clientIds, []);
    assert.deepEqual(bFresh?.clientIds, [CLIENT_ID]);
    // Unassign:
    await c.plans.assignClient(ACTOR, CLIENT_ID, null);
    const bAfter = await c.plans.get(b.id);
    assert.deepEqual(bAfter?.clientIds, []);
    assert.equal(await c.plans.getForClient(CLIENT_ID), null);
  });

  test("R007-6: PlanService rejects invalid input (empty label, negative monthly)", async () => {
    const { c } = freshContainer();
    await assert.rejects(() => c.plans.create(ACTOR, { tier: "starter", label: "", monthlyAmountCents: 1_000 }));
    await assert.rejects(() => c.plans.create(ACTOR, { tier: "starter", label: "x", monthlyAmountCents: -1 }));
  });

  test("R007-7: founderSnapshot honesty contract — empty world returns hasData:false, all zeroes", async () => {
    const { c } = freshContainer();
    const snap = await c.pnl.founderSnapshot(Date.now());
    assert.equal(snap.hasData, false);
    assert.equal(snap.mrrCents, 0);
    assert.equal(snap.arrCents, 0);
    assert.equal(snap.activeClients, 0);
    assert.equal(snap.churnRate, 0);
    assert.equal(snap.topClients.length, 0);
  });

  test("R007-8: founderSnapshot — MRR = sum(plan.monthlyAmountCents × clientIds.length); ARR = MRR × 12", async () => {
    const { c } = freshContainer();
    const growth = await c.plans.create(ACTOR, { tier: "growth", label: "G", monthlyAmountCents: 50_000 });
    await c.plans.assignClient(ACTOR, "client_a", growth.id);
    await c.plans.assignClient(ACTOR, "client_b", growth.id);
    const snap = await c.pnl.founderSnapshot(Date.now());
    assert.equal(snap.hasData, true);
    assert.equal(snap.mrrCents, 100_000);
    assert.equal(snap.arrCents, 1_200_000);
    assert.equal(snap.activeClients, 2);
  });

  test("R007-9: founderSnapshot.topClients ranks by lifetime payment sum", async () => {
    const { c } = freshContainer();
    // Two clients, two invoices each at varying payment totals.
    const inv1 = await c.invoices.create({
      clientId: CLIENT_ID, issuedAt: Date.now(), dueAt: Date.now() + 7 * 86_400_000,
      lineItems: [{ description: "A", quantity: 1, unitCents: 200_000 }],
      currency: "gbp",
    }, ACTOR);
    await c.invoices.update(inv1.id, { status: "sent" }, ACTOR);
    await c.payments.record(ACTOR, { invoiceId: inv1.id, amountCents: 200_000, currency: "gbp", method: "stripe" });

    const inv2 = await c.invoices.create({
      clientId: CLIENT_ID, issuedAt: Date.now(), dueAt: Date.now() + 7 * 86_400_000,
      lineItems: [{ description: "B", quantity: 1, unitCents: 50_000 }],
      currency: "gbp",
    }, ACTOR);
    await c.invoices.update(inv2.id, { status: "sent" }, ACTOR);
    await c.payments.record(ACTOR, { invoiceId: inv2.id, amountCents: 50_000, currency: "gbp", method: "stripe" });

    const snap = await c.pnl.founderSnapshot(Date.now());
    assert.equal(snap.topClients.length, 1);
    assert.equal(snap.topClients[0]?.clientId, CLIENT_ID);
    assert.equal(snap.topClients[0]?.lifetimeCents, 250_000);
  });

  test("R007-10: trailingMonths returns 12 contiguous months ending in ref month", async () => {
    const { c } = freshContainer();
    const refNow = Date.UTC(2026, 5, 15); // Jun 2026 (month 6)
    const months = await c.pnl.trailingMonths(refNow, 12);
    assert.equal(months.length, 12);
    // Last entry is the ref month.
    assert.equal(months[11]?.year, 2026);
    assert.equal(months[11]?.month, 6);
    // First entry is 11 months earlier → Jul 2025.
    assert.equal(months[0]?.year, 2025);
    assert.equal(months[0]?.month, 7);
    // All zero-net (no data seeded).
    assert.ok(months.every(m => m.revenueCents === 0 && m.expensesCents === 0 && m.netCents === 0));
  });

  test("R007-11: lockInRows surfaces clients on lock-in plans + paid status from notes/externalRef heuristic", async () => {
    const { c } = freshContainer();
    const lockPlan = await c.plans.create(ACTOR, {
      tier: "scale", label: "Scale 12mo", monthlyAmountCents: 150_000,
      lockInMonths: 12, lockInFeeCents: 100_000,
    });
    const noLockPlan = await c.plans.create(ACTOR, {
      tier: "starter", label: "Free trial", monthlyAmountCents: 0,
    });
    await c.plans.assignClient(ACTOR, CLIENT_ID, lockPlan.id);
    await c.plans.assignClient(ACTOR, "client_unlocked", noLockPlan.id);

    // Issue + pay a lock-in invoice tagged by externalRef prefix.
    const inv = await c.invoices.create({
      clientId: CLIENT_ID, issuedAt: Date.now(), dueAt: Date.now() + 7 * 86_400_000,
      lineItems: [{ description: "Lock-in fee", quantity: 1, unitCents: 100_000 }],
      currency: "gbp",
    }, ACTOR);
    await c.invoices.update(inv.id, { status: "sent" }, ACTOR);
    await c.payments.record(ACTOR, {
      invoiceId: inv.id, amountCents: 100_000, currency: "gbp", method: "stripe",
      externalRef: "lockin_acme_2026",
    });

    const rows = await c.pnl.lockInRows();
    assert.equal(rows.length, 1, "only the locked client surfaces");
    assert.equal(rows[0]?.clientId, CLIENT_ID);
    assert.equal(rows[0]?.paid, true);
    assert.equal(rows[0]?.paidCents, 100_000);
  });
});
