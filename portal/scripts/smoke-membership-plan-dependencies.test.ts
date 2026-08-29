// Who is still on a plan, and what deleting it does to them.
//
// The roadmap's dependency-safe-membership-affiliate-retirement item says:
// *"Plan DELETE leaves a subscriber row but hides it from admin lists and
// removes benefits without reconciling billing."* This file verifies that, and
// the mechanism turns out to be worse than "hides".
//
// ── The subscriber becomes UNREACHABLE, not merely hidden ─────────────────
//
// `SubscriptionService.list()` does not walk subscriptions. It walks the
// surviving PLANS and collects each one's member set. Delete the plan and the
// only path to its members is gone — the subscription rows and the `by-plan`
// set both still exist, and nothing can reach them.
//
// Three things happen at once, and the third is what makes the first two
// dangerous:
//
//   1. the subscription row survives, so external billing is untouched and the
//      member keeps paying;
//   2. benefits resolve through `plans.get(sub.planId)`, which is now null, so
//      the member silently loses what they are paying for;
//   3. no admin list can show them, so nobody can find out.
//
// A paying member who receives nothing and appears nowhere is a billing problem,
// not a tidiness one. All three are asserted below.
//
// This file asserts NO retirement policy. `PlanService.archive` already exists
// and is the documented ordinary path — it keeps existing subscribers paying
// while hiding the plan from new signups. Whether hard deletion should be
// forbidden, or defined as an explicit purge that reconciles billing, is Ed's
// decision. The last test records today's behaviour so it is made against facts.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMembershipsContainer } from "../src/built-ins/modules/memberships/src/server/index";
import { planDependencyInventory } from "../src/built-ins/modules/memberships/src/server/dependencies";
import type { ActivityLogPort, EventBusPort, StoragePort } from "../src/built-ins/modules/memberships/src/server/ports";

const AGENCY_ID = "agency_plan_deps";
const CLIENT_ID = "client_plan_deps";
const PLAN_ID = "plan_paid_deps";
const OTHER_PLAN_ID = "plan_other_deps";
const MEMBER = "member_paying";
const ACTOR = "owner_deps";

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  private readonly tails = new Map<string, Promise<void>>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.data.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.data.set(key, structuredClone(value)); }
  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> { return [...this.data.keys()].filter(key => key.startsWith(prefix)); }
  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try { return await operation(); } finally { release(); if (this.tails.get(key) === tail) this.tails.delete(key); }
  }
}

function plan(id: string, name: string) {
  return {
    id, agencyId: AGENCY_ID, clientId: CLIENT_ID, name,
    priceMonthly: 2_500, priceAnnual: 25_000, currency: "gbp",
    features: [], benefitIds: [], status: "active", order: 10, createdAt: 1, updatedAt: 1,
  };
}

async function seedWorld() {
  const storage = new MemoryStorage();
  storage.data.set("memberships/plans/index", [PLAN_ID, OTHER_PLAN_ID]);
  storage.data.set(`memberships/plans/${PLAN_ID}`, plan(PLAN_ID, "Paid"));
  storage.data.set(`memberships/plans/${OTHER_PLAN_ID}`, plan(OTHER_PLAN_ID, "Other"));

  // A paying member on the plan that is about to be deleted.
  storage.data.set(`memberships/subscribers/${MEMBER}`, {
    id: `sub_${MEMBER}`, agencyId: AGENCY_ID, clientId: CLIENT_ID,
    endCustomerUserId: MEMBER, planId: PLAN_ID,
    stripeSubscriptionId: "sub_stripe_live", billing: "monthly",
    status: "active", cancelAtPeriodEnd: false, createdAt: 1, updatedAt: 1,
  });
  storage.data.set(`memberships/by-plan/${PLAN_ID}`, [MEMBER]);

  const activity: ActivityLogPort = {
    logActivity(input) { return { id: "act", ts: Date.now(), ...input } as never; },
    listActivity() { return [] as never; },
  };
  const events: EventBusPort = { emit() {} };
  const services = buildMembershipsContainer({
    agencyId: AGENCY_ID, clientId: CLIENT_ID, storage, activity, events,
    stripe: undefined as never,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
  } as never);
  return { storage, services };
}

describe("the inventory says who is still on the plan", () => {
  it("finds the subscriber, and says they are BILLABLE", async () => {
    const { storage, services } = await seedWorld();
    const inventory = await planDependencyInventory(services, storage, PLAN_ID);
    assert.equal(inventory.total, 1);
    assert.equal(inventory.billableSubscribers, 1,
      "an active subscriber is no longer counted as billable — deleting the plan would look free");
    assert.equal(inventory.dependants[0].userId, MEMBER);
  });

  it("warns that they would become UNREACHABLE, which is the part nobody sees", async () => {
    const { storage, services } = await seedWorld();
    const inventory = await planDependencyInventory(services, storage, PLAN_ID);
    assert.equal(inventory.wouldBecomeUnreachable, true);
  });

  it("a plan with nobody on it comes back empty — the count means something", async () => {
    const { storage, services } = await seedWorld();
    const inventory = await planDependencyInventory(services, storage, OTHER_PLAN_ID);
    assert.equal(inventory.total, 0);
    assert.equal(inventory.billableSubscribers, 0);
    assert.equal(inventory.wouldBecomeUnreachable, false);
  });
});

describe("what plan DELETE does today, recorded rather than asserted as correct", () => {
  it("the member keeps their subscription, loses the plan, and vanishes from every list", async () => {
    const { storage, services } = await seedWorld();

    // Before: the admin can see them.
    assert.equal((await services.subscriptions.list()).length, 1, "the fixture's member was not listed");

    const deleted = await services.plans.delete(PLAN_ID, ACTOR);
    assert.equal(deleted, true);

    // 1. The subscription row SURVIVES — so external billing is untouched and
    //    the member keeps paying.
    const surviving = await services.subscriptions.getByUser(MEMBER);
    assert.ok(surviving, "the subscription row was removed — if that is now the policy, record it here");
    assert.equal(surviving!.status, "active", "the subscription was not cancelled, so billing continues");
    assert.equal(surviving!.stripeSubscriptionId, "sub_stripe_live",
      "the external billing reference is still attached and unreconciled");

    // 2. …and their plan is gone, so what they pay for cannot be resolved.
    assert.equal(await services.plans.get(PLAN_ID), null);

    // 3. …and no admin list can reach them, because `list()` enumerates by
    //    surviving plan. This is the one that hides the other two.
    const listed = await services.subscriptions.list();
    assert.equal(listed.length, 0,
      "subscribers are reachable after their plan is deleted — a retirement policy has landed, "
      + "and this test should assert it rather than the old vanish-from-view behaviour");

    // The data is still there. Nothing can see it.
    assert.ok(storage.data.has(`memberships/subscribers/${MEMBER}`), "the row really is retained");
    assert.deepEqual(storage.data.get(`memberships/by-plan/${PLAN_ID}`), [MEMBER],
      "the member set is retained too — the only path to it is the plan that was deleted");
  });

  it("archive — the documented ordinary path — keeps them visible and paying", async () => {
    // The contrast that makes the case: the safe path already exists.
    const { storage, services } = await seedWorld();
    const archived = await services.plans.archive(PLAN_ID, ACTOR);
    assert.equal(archived?.status, "archived");

    assert.equal((await services.subscriptions.list()).length, 1,
      "archiving a plan lost its subscribers — the documented ordinary retirement path is broken");
    const inventory = await planDependencyInventory(services, storage, PLAN_ID);
    assert.equal(inventory.billableSubscribers, 1, "the archived plan's member stopped being billable");
  });
});
