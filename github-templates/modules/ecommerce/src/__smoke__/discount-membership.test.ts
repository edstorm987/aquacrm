// R5 — ecommerce ↔ memberships discount integration smoke.
//
// Covers DiscountService.resolveForUser. Mocks all four ports + a
// MembershipBenefitsPort, walks the discount path with and without the
// port wired, and asserts the AppliedDiscount + persisted order shape.
//
// Run from `04-the-final-portal/plugins/ecommerce/`:
//   npm run smoke

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type {
  ActivityPort,
  EcommerceEventName,
  EventBusPort,
  MembershipBenefitsPort,
  MembershipDiscountSnapshot,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
} from "../server/ports";
import { buildEcommerceContainer } from "../server/index";

const AGENCY_ID: AgencyId = "agency_disc_smoke";
const CLIENT_ID: ClientId = "client_disc_smoke";
const MEMBER_USER: UserId = "user_member";
const NON_MEMBER_USER: UserId = "user_guest";

function buildWorld(membershipPort?: MembershipBenefitsPort) {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: EcommerceEventName | string; payload: unknown }[] = [];

  const storage: StoragePort = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  const client: Client = {
    id: CLIENT_ID, agencyId: AGENCY_ID, name: "Smoke Disc Co", slug: "smoke-disc",
    brand: { primaryColor: "#000" }, stage: "live", status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const tenant: TenantPort = {
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };
  let actSeq = 1;
  const activity: ActivityPort = {
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
    listActivity(filter) {
      const out = activityLog.filter(e => e.agencyId === filter.agencyId);
      return out;
    },
  };
  const eventBus: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; },
  };
  return { storage, tenant, activity, events: eventBus, pluginInstalls, membershipPort, inspect: { activityLog, events } };
}

// Fixed snapshot the mock port returns. Covers the happy path; null
// case is exercised by passing an undefined port.
const MOCK_SNAPSHOT: MembershipDiscountSnapshot = {
  percent: 20,
  planId: "plan_silver",
  planName: "Silver",
  benefitId: "ben_disc_20",
};

describe("R5 — ecommerce ↔ memberships discount", () => {
  describe("port wired (memberships installed)", () => {
    let world: ReturnType<typeof buildWorld>;
    let services: ReturnType<typeof buildEcommerceContainer>;

    before(() => {
      const port: MembershipBenefitsPort = {
        async getDiscountPercentForUser(args) {
          if (args.userId === MEMBER_USER) return MOCK_SNAPSHOT;
          return null;
        },
      };
      world = buildWorld(port);
      services = buildEcommerceContainer({
        storage: world.storage,
        tenant: world.tenant,
        activity: world.activity,
        events: world.events,
        pluginInstalls: world.pluginInstalls,
        membershipBenefits: port,
      });
    });

    test("step 1: member user → 20% off applied", async () => {
      const result = await services.discounts.resolveForUser({
        agencyId: AGENCY_ID, clientId: CLIENT_ID,
        userId: MEMBER_USER, subtotal: 5000,            // £50.00
      });
      assert.ok(result, "membership discount returned");
      assert.equal(result?.type, "membership");
      assert.equal(result?.amountOff, 1000);            // 20% of 5000
      assert.equal(result?.membershipSnapshot?.planId, "plan_silver");
      assert.equal(result?.membershipSnapshot?.percent, 20);
      assert.match(result?.label ?? "", /20% off/);
      assert.match(result?.code ?? "", /^MEMBER:/);
    });

    test("step 2: non-member user → null", async () => {
      const result = await services.discounts.resolveForUser({
        agencyId: AGENCY_ID, clientId: CLIENT_ID,
        userId: NON_MEMBER_USER, subtotal: 5000,
      });
      assert.equal(result, null);
    });

    test("step 3: blocked when other discount already applied", async () => {
      const result = await services.discounts.resolveForUser({
        agencyId: AGENCY_ID, clientId: CLIENT_ID,
        userId: MEMBER_USER, subtotal: 5000,
        alreadyAppliedTypes: ["referral"],
      });
      assert.equal(result, null, "memberships is lowest-priority — won't stack");
    });

    test("step 4: zero subtotal → null", async () => {
      const result = await services.discounts.resolveForUser({
        agencyId: AGENCY_ID, clientId: CLIENT_ID,
        userId: MEMBER_USER, subtotal: 0,
      });
      assert.equal(result, null);
    });

    test("step 5: order persistence carries discountSource + snapshot", async () => {
      const { order, isNew } = await services.orders.upsertOrderByStripeSession({
        clientId: CLIENT_ID,
        stripeSessionId: "cs_disc_001",
        amountTotal: 4000,
        currency: "gbp",
        items: [{ name: "T-shirt", quantity: 1, unitAmount: 5000, currency: "gbp" }],
        endCustomerUserId: MEMBER_USER,
        discountSource: "membership",
        discountAmount: 1000,
        discountCode: "MEMBER:Silver",
        discountSnapshot: MOCK_SNAPSHOT,
      });
      assert.equal(isNew, true, "first upsert is a fresh insert");
      assert.equal(order.discountSource, "membership");
      assert.equal(order.discountAmount, 1000);
      assert.equal(order.discountSnapshot?.planId, "plan_silver");
      assert.equal(order.endCustomerUserId, MEMBER_USER);

      // Idempotent on stripeSessionId — re-call doesn't overwrite source.
      const second = await services.orders.upsertOrderByStripeSession({
        clientId: CLIENT_ID,
        stripeSessionId: "cs_disc_001",
        amountTotal: 4000,
        currency: "gbp",
        items: [],
        // Pretend a webhook retry came in without the discount metadata.
      });
      assert.equal(second.isNew, false, "retry is a patch, not an insert");
      assert.equal(second.order.id, order.id);
      assert.equal(second.order.discountSource, "membership", "discount source preserved across upsert");
      assert.equal(second.order.discountSnapshot?.planId, "plan_silver");
    });
  });

  describe("port not wired (memberships not installed)", () => {
    let services: ReturnType<typeof buildEcommerceContainer>;

    before(() => {
      const world = buildWorld();
      services = buildEcommerceContainer({
        storage: world.storage,
        tenant: world.tenant,
        activity: world.activity,
        events: world.events,
        pluginInstalls: world.pluginInstalls,
        // membershipBenefits omitted — backward-compat path
      });
    });

    test("step 6: resolveForUser returns null when port absent", async () => {
      const result = await services.discounts.resolveForUser({
        agencyId: AGENCY_ID, clientId: CLIENT_ID,
        userId: MEMBER_USER, subtotal: 5000,
      });
      assert.equal(result, null);
    });

    test("step 7: existing code resolver still works without port", async () => {
      // Drop a custom code via the public surface and resolve it.
      await services.discounts.upsertCustomCode({
        code: "SAVE10", type: "percent", value: 10,
        active: true, uses: 0, createdAt: Date.now(),
      });
      const result = await services.discounts.resolveCode("SAVE10", 5000, []);
      assert.ok(result.ok);
      if (!result.ok) return;
      assert.equal(result.discount.type, "promo");
      assert.equal(result.discount.amountOff, 500);
    });
  });
});
