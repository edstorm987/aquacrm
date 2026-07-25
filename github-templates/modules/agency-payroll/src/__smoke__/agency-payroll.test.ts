// Agency-payroll smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  PayrollClosedError,
  PayrollNotFoundError,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const ALICE: UserId = "user_alice";
const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(): World {
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
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  return { storage, activity, events: eventBus, inspect: { activityLog, events } };
}

function container(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
  });
}

describe("@aqua/plugin-agency-payroll smoke", () => {
  test("1. open(year, month) creates a period; idempotent — re-opening same year/month returns the existing row", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const a = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const b = await c.periods.open(ALICE, { year: 2026, month: 5 });
    assert.equal(a.id, b.id, "idempotent — same id returned");
    assert.equal(a.status, "open");
    assert.equal(a.year, 2026);
    assert.equal(a.month, 5);
    const list = await c.periods.list();
    assert.equal(list.length, 1, "no duplicate index entry");
    resetClock();
  });

  test("2. open rejects invalid year + invalid month", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    await assert.rejects(() => c.periods.open(ALICE, { year: 2026, month: 0 }));
    await assert.rejects(() => c.periods.open(ALICE, { year: 2026, month: 13 }));
    await assert.rejects(() => c.periods.open(ALICE, { year: 1999, month: 5 }));
    await assert.rejects(() => c.periods.open(ALICE, { year: 2.5 as unknown as number, month: 5 }));
    resetClock();
  });

  test("3. close transitions open→closed + emits payroll.period.closed; idempotent on second close", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const closed = await c.periods.close(ALICE, p.id);
    assert.equal(closed.status, "closed");
    assert.ok(closed.closedAt && closed.closedAt >= T0);
    const closedEvents = w.inspect.events.filter(e => e.name === "payroll.period.closed").length;
    assert.equal(closedEvents, 1);
    // Idempotent — second close re-returns row, does NOT re-emit.
    await c.periods.close(ALICE, p.id);
    const closedEvents2 = w.inspect.events.filter(e => e.name === "payroll.period.closed").length;
    assert.equal(closedEvents2, 1, "second close is no-op (no second emit)");
    resetClock();
  });

  test("4. createPayslip stores; paidAt undefined initially; emits payroll.payslip.created", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const slip = await c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "staff_x", payeeKind: "employee",
      payeeName: "Jamie", gross: 350000, net: 245000, currency: "GBP",
    });
    assert.equal(slip.payeeName, "Jamie");
    assert.equal(slip.gross, 350000);
    assert.equal(slip.paidAt, undefined);
    assert.equal(slip.currency, "GBP");
    assert.ok(w.inspect.events.some(e => e.name === "payroll.payslip.created"));
    resetClock();
  });

  test("5. createPayslip rejects negative gross/net; rejects creating payslip on closed period", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    await assert.rejects(() => c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "x", payeeKind: "employee",
      payeeName: "Bad", gross: -1, net: 0,
    }));
    await assert.rejects(() => c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "x", payeeKind: "employee",
      payeeName: "Bad", gross: 0, net: -1,
    }));
    // Zero is allowed (e.g. zero-net unpaid leave slip).
    const zeroSlip = await c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "x", payeeKind: "employee",
      payeeName: "Zero", gross: 0, net: 0,
    });
    assert.equal(zeroSlip.gross, 0);

    // Closed period rejects.
    await c.periods.close(ALICE, p.id);
    await assert.rejects(
      () => c.payslips.create(ALICE, {
        periodId: p.id, payeeId: "x", payeeKind: "employee",
        payeeName: "Late", gross: 100, net: 80,
      }),
      (err: unknown) => err instanceof PayrollClosedError,
    );
    resetClock();
  });

  test("6. update patches gross/net/notes + emits payslip.updated; rejects negative patch", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const slip = await c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "x", payeeKind: "employee",
      payeeName: "Jamie", gross: 100000, net: 70000,
    });
    const u = await c.payslips.update(ALICE, slip.id, { gross: 110000, notes: "bonus" });
    assert.equal(u.gross, 110000);
    assert.equal(u.notes, "bonus");
    assert.ok(w.inspect.events.some(e => e.name === "payroll.payslip.updated"));
    await assert.rejects(() => c.payslips.update(ALICE, slip.id, { net: -1 }));
    resetClock();
  });

  test("7. markPaid sets paidAt + emits payroll.payslip.paid ONCE; second call is no-op (no second emit)", async () => {
    let t = T0;
    setClock(() => t);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const slip = await c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "x", payeeKind: "employee",
      payeeName: "Jamie", gross: 100000, net: 70000,
    });
    t = T0 + 1000;
    const paid1 = await c.payslips.markPaid(ALICE, slip.id);
    assert.equal(paid1.paidAt, t, "paidAt set to now()");
    const emits1 = w.inspect.events.filter(e => e.name === "payroll.payslip.paid").length;
    assert.equal(emits1, 1);
    // Second markPaid — no-op, no re-emit.
    t = T0 + 2000;
    const paid2 = await c.payslips.markPaid(ALICE, slip.id);
    assert.equal(paid2.paidAt, paid1.paidAt, "paidAt unchanged on re-mark");
    const emits2 = w.inspect.events.filter(e => e.name === "payroll.payslip.paid").length;
    assert.equal(emits2, 1, "no second emit on re-mark");
    resetClock();
  });

  test("8. list filters by periodId + payeeKind + paidOnly/unpaidOnly", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p1 = await c.periods.open(ALICE, { year: 2026, month: 4 });
    const p2 = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const a = await c.payslips.create(ALICE, { periodId: p1.id, payeeId: "e1", payeeKind: "employee",   payeeName: "E1", gross: 100, net: 80 });
    const b = await c.payslips.create(ALICE, { periodId: p2.id, payeeId: "c1", payeeKind: "contractor", payeeName: "C1", gross: 200, net: 160 });
    await c.payslips.create(ALICE, { periodId: p2.id, payeeId: "e2", payeeKind: "employee",   payeeName: "E2", gross: 300, net: 240 });

    const inP2 = await c.payslips.list({ periodId: p2.id });
    assert.equal(inP2.length, 2);
    const empOnly = await c.payslips.list({ payeeKind: "employee" });
    assert.equal(empOnly.length, 2);
    await c.payslips.markPaid(ALICE, a.id);
    const paidOnly = await c.payslips.list({ paidOnly: true });
    assert.equal(paidOnly.length, 1);
    assert.equal(paidOnly[0]!.id, a.id);
    const unpaidOnly = await c.payslips.list({ unpaidOnly: true });
    assert.equal(unpaidOnly.length, 2);
    void b;
    resetClock();
  });

  test("9. totalsForPeriod — honesty: hasData=false until ≥1 paid payslip; sums gross/net + by-kind", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const e = await c.payslips.create(ALICE, { periodId: p.id, payeeId: "e1", payeeKind: "employee",   payeeName: "E1", gross: 100000, net: 70000 });
    const ct = await c.payslips.create(ALICE, { periodId: p.id, payeeId: "c1", payeeKind: "contractor", payeeName: "C1", gross: 200000, net: 200000 });
    const empty = await c.reports.totalsForPeriod(p.id);
    assert.equal(empty.hasData, false, "no paid payslips → hasData false");
    assert.equal(empty.paidCount, 0);
    assert.equal(empty.totalCount, 2);
    await c.payslips.markPaid(ALICE, e.id);
    await c.payslips.markPaid(ALICE, ct.id);
    const full = await c.reports.totalsForPeriod(p.id);
    assert.equal(full.hasData, true);
    assert.equal(full.paidCount, 2);
    assert.equal(full.paidGross, 300000);
    assert.equal(full.paidNet, 270000);
    assert.equal(full.byKind.employee.paidCount, 1);
    assert.equal(full.byKind.contractor.paidCount, 1);
    assert.equal(full.byKind.contractor.paidGross, 200000);
    resetClock();
  });

  test("10. createContractor stores + list returns; archive flips archived + emits archived event", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const ct = await c.contractors.create(ALICE, { name: "Sam Smith", email: "sam@example.com", hourlyRate: 5000, currency: "gbp" });
    assert.equal(ct.name, "Sam Smith");
    assert.equal(ct.currency, "GBP", "currency uppercased");
    assert.equal(ct.archived, false);
    const list1 = await c.contractors.list();
    assert.equal(list1.length, 1);
    await c.contractors.update(ALICE, ct.id, { archived: true });
    const list2 = await c.contractors.list();
    assert.equal(list2.length, 0, "archived excluded by default");
    const list3 = await c.contractors.list({ includeArchived: true });
    assert.equal(list3.length, 1);
    assert.ok(w.inspect.events.some(e => e.name === "payroll.contractor.archived"));
    // No archived event re-emit on a no-op update.
    const before = w.inspect.events.filter(e => e.name === "payroll.contractor.archived").length;
    await c.contractors.update(ALICE, ct.id, { archived: true });
    const after = w.inspect.events.filter(e => e.name === "payroll.contractor.archived").length;
    assert.equal(after, before, "no re-emit on already-archived update");
    resetClock();
  });

  test("11. delete payslip removes from list + index + emits payslip.deleted; not-found throws", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const slip = await c.payslips.create(ALICE, { periodId: p.id, payeeId: "x", payeeKind: "employee", payeeName: "X", gross: 100, net: 80 });
    await c.payslips.delete(ALICE, slip.id);
    const list = await c.payslips.list();
    assert.equal(list.length, 0);
    assert.ok(w.inspect.events.some(e => e.name === "payroll.payslip.deleted"));
    await assert.rejects(
      () => c.payslips.delete(ALICE, "ps_missing"),
      (err: unknown) => err instanceof PayrollNotFoundError,
    );
    resetClock();
  });

  test("12. activity — period.opened/closed + payslip.created/paid + contractor.created log under category 'hr' with `payroll.*` action prefix", async () => {
    setClock(() => T0);
    const w = buildWorld();
    const c = container(w);
    const p = await c.periods.open(ALICE, { year: 2026, month: 5 });
    const slip = await c.payslips.create(ALICE, {
      periodId: p.id, payeeId: "x", payeeKind: "employee",
      payeeName: "X", gross: 100, net: 80,
    });
    await c.payslips.markPaid(ALICE, slip.id);
    await c.contractors.create(ALICE, { name: "Sam" });
    await c.periods.close(ALICE, p.id);
    const actions = w.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("payroll.period.opened"));
    assert.ok(actions.includes("payroll.period.closed"));
    assert.ok(actions.includes("payroll.payslip.created"));
    assert.ok(actions.includes("payroll.payslip.paid"));
    assert.ok(actions.includes("payroll.contractor.created"));
    // All entries under category 'hr' (R+1 — extend ActivityCategory union with 'payroll').
    assert.ok(w.inspect.activityLog.every(e => e.category === "hr"));
    assert.ok(w.inspect.activityLog.every(e => e.action.startsWith("payroll.")));
    resetClock();
  });
});

resetClock();
