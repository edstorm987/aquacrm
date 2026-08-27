import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildAffiliatesContainer } from "../src/built-ins/modules/affiliates/src/server/index";
import type { EcommerceOrderProjection } from "../src/built-ins/modules/affiliates/src/server/ports";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
} from "../src/built-ins/modules/affiliates/src/server/ports";

const AGENCY_ID = "agency_affiliate_atomic";
const CLIENT_ID = "client_affiliate_atomic";
const ACTOR_ID = "owner_affiliate_atomic";

class FaultStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  failNextSetKey: string | null = null;
  failNextSetPrefix: string | null = null;
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    await Promise.resolve();
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await Promise.resolve();
    if (key === this.failNextSetKey || (this.failNextSetPrefix && key.startsWith(this.failNextSetPrefix))) {
      this.failNextSetKey = null;
      this.failNextSetPrefix = null;
      throw new Error(`forced affiliate atomic storage failure: ${key}`);
    }
    this.data.set(key, structuredClone(value));
  }

  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

function paidOrder(id: string, referralCodeId: string): EcommerceOrderProjection {
  return {
    id,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    amountTotal: 10_000,
    subtotal: 10_000,
    currency: "usd",
    status: "paid",
    paidAt: Date.now(),
    referralCodeId,
    createdAt: Date.now(),
  };
}

function buildWorld() {
  const storage = new FaultStorage();
  const orders = new Map<string, EcommerceOrderProjection>();
  const users = new Map([
    ["user_alice", { id: "user_alice", email: "alice@example.test", name: "Alice", agencyId: AGENCY_ID, clientId: CLIENT_ID }],
    ["user_bob", { id: "user_bob", email: "bob@example.test", name: "Bob", agencyId: AGENCY_ID, clientId: CLIENT_ID }],
    ["user_fault", { id: "user_fault", email: "fault@example.test", name: "Fault", agencyId: AGENCY_ID, clientId: CLIENT_ID }],
  ]);
  const activityRows = new Map<string, unknown>();
  const emitted: Array<{ name: string; payload: unknown }> = [];
  const activity: ActivityLogPort = {
    logActivity(input) {
      const key = input.idempotencyKey ?? `activity-${activityRows.size + 1}`;
      const existing = activityRows.get(key);
      if (existing) return existing as never;
      const row = { id: key, ts: Date.now(), ...input };
      activityRows.set(key, row);
      return row as never;
    },
    listActivity() { return [...activityRows.values()] as never; },
  };
  const events: EventBusPort = {
    emit(_scope, name, payload) { emitted.push({ name, payload }); },
  };
  const container = () => buildAffiliatesContainer({
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    storage,
    activity,
    events,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser(id) { return users.get(id) ?? null; } },
    pluginInstalls: { getInstall() { return null; } },
    ecommerceOrders: { getOrder(args) { return orders.get(args.orderId) ?? null; } },
  });
  return { storage, orders, activityRows, emitted, container };
}

test("install-wide claims collapse concurrent identities and preserve every shared index", async () => {
  const world = buildWorld();
  const left = world.container();
  const right = world.container();
  const aliceInput = {
    endCustomerUserId: "user_alice",
    displayName: "Alice Affiliate",
    payoutEmail: "alice-payouts@example.test",
  };
  const [aliceLeft, aliceRight] = await Promise.all([
    left.affiliates.enroll(aliceInput, ACTOR_ID),
    right.affiliates.enroll(aliceInput, ACTOR_ID),
  ]);
  assert.equal(aliceLeft.id, aliceRight.id, "same user adopts one claimed affiliate row");
  const bob = await right.affiliates.enroll({
    endCustomerUserId: "user_bob",
    displayName: "Bob Affiliate",
    payoutEmail: "bob-payouts@example.test",
  }, ACTOR_ID);
  assert.deepEqual(
    new Set(await world.storage.get<string[]>("affiliates/index")),
    new Set([aliceLeft.id, bob.id]),
    "different-user enrolments do not overwrite the global index",
  );
  await left.affiliates.update(aliceLeft.id, { status: "active" }, ACTOR_ID);
  await right.affiliates.update(bob.id, { status: "active" }, ACTOR_ID);

  const [aliceCodeLeft, aliceCodeRight] = await Promise.all([
    left.codes.create({ affiliateId: aliceLeft.id, code: "ALICE10" }, ACTOR_ID),
    right.codes.create({ affiliateId: aliceLeft.id, code: "alice10" }, ACTOR_ID),
  ]);
  assert.equal(aliceCodeLeft.id, aliceCodeRight.id, "same literal code adopts one claimed row");
  const bobCode = await right.codes.create({ affiliateId: bob.id, code: "BOB10" }, ACTOR_ID);
  assert.deepEqual(
    new Set(await world.storage.get<string[]>("codes/index")),
    new Set([aliceCodeLeft.id, bobCode.id]),
  );
  await assert.rejects(
    right.codes.create({ affiliateId: bob.id, code: "ALICE10" }, ACTOR_ID),
    /already exists|already claimed/i,
    "the claimed literal cannot be reassigned to another affiliate",
  );

  world.orders.set("order_alice_same", paidOrder("order_alice_same", aliceCodeLeft.id));
  const [sameLeft, sameRight] = await Promise.all([
    left.attributions.recordOrder({ orderId: "order_alice_same" }),
    right.attributions.recordOrder({ orderId: "order_alice_same" }),
  ]);
  assert.equal(sameLeft?.id, sameRight?.id, "same order adopts one claimed attribution");

  world.orders.set("order_alice_two", paidOrder("order_alice_two", aliceCodeLeft.id));
  world.orders.set("order_bob_one", paidOrder("order_bob_one", bobCode.id));
  const [aliceSecond, bobFirst] = await Promise.all([
    right.attributions.recordOrder({ orderId: "order_alice_two" }),
    left.attributions.recordOrder({ orderId: "order_bob_one" }),
  ]);
  assert.ok(aliceSecond && bobFirst);
  assert.equal((await left.affiliates.get(aliceLeft.id))?.totalReferred, 2);
  assert.equal((await right.affiliates.get(bob.id))?.totalReferred, 1);
  assert.equal((await left.codes.get(aliceCodeLeft.id))?.redemptionCount, 2);
  assert.equal((await right.codes.get(bobCode.id))?.redemptionCount, 1);
  assert.equal(new Set(await world.storage.get<string[]>("attributions/index")).size, 3);

  await Promise.all([
    left.attributions.approve(sameLeft!.id, ACTOR_ID),
    left.attributions.approve(aliceSecond!.id, ACTOR_ID),
    right.attributions.approve(bobFirst!.id, ACTOR_ID),
  ]);
  const [alicePayout, bobPayout] = await Promise.all([
    left.payouts.schedule({ affiliateId: aliceLeft.id, operationId: "alice-payout" }, ACTOR_ID),
    right.payouts.schedule({ affiliateId: bob.id, operationId: "bob-payout" }, ACTOR_ID),
  ]);
  assert.ok(alicePayout && bobPayout);
  assert.deepEqual(
    new Set(await world.storage.get<string[]>("payouts/index")),
    new Set([alicePayout.id, bobPayout.id]),
    "different-affiliate schedules do not overwrite the global payout index",
  );
});

test("pending enrolment and code claims recover the original row after interrupted writes", async () => {
  const world = buildWorld();
  let services = world.container();
  const affiliateInput = {
    endCustomerUserId: "user_fault",
    displayName: "Fault Recovery",
    payoutEmail: "fault-payouts@example.test",
  };
  world.storage.failNextSetKey = "affiliates/by-user/user_fault";
  await assert.rejects(services.affiliates.enroll(affiliateInput, ACTOR_ID), /forced affiliate atomic/);
  const affiliateClaim = await world.storage.get<{ row: { id: string } }>("affiliates/claims/user/user_fault");
  assert.ok(affiliateClaim?.row.id);
  services = world.container();
  const recoveredAffiliate = await services.affiliates.enroll(affiliateInput, ACTOR_ID);
  assert.equal(recoveredAffiliate.id, affiliateClaim?.row.id);
  assert.equal(await world.storage.get<string>("affiliates/by-user/user_fault"), recoveredAffiliate.id);
  assert.deepEqual(await world.storage.get<string[]>("affiliates/index"), [recoveredAffiliate.id]);
  await services.affiliates.update(recoveredAffiliate.id, { status: "active" }, ACTOR_ID);

  world.storage.failNextSetKey = "codes/by-code/FAULT10";
  await assert.rejects(
    services.codes.create({ affiliateId: recoveredAffiliate.id, code: "FAULT10" }, ACTOR_ID),
    /forced affiliate atomic/,
  );
  const codeClaim = await world.storage.get<{ row: { id: string } }>("codes/claims/by-code/FAULT10");
  assert.ok(codeClaim?.row.id);
  services = world.container();
  const recoveredCode = await services.codes.create({
    affiliateId: recoveredAffiliate.id,
    code: "fault10",
  }, ACTOR_ID);
  assert.equal(recoveredCode.id, codeClaim?.row.id);
  assert.equal(await world.storage.get<string>("codes/by-code/FAULT10"), recoveredCode.id);
  assert.deepEqual(await world.storage.get<string[]>("codes/index"), [recoveredCode.id]);
});

test("attribution recovery repairs indexes and makes both counters exactly once", async () => {
  const world = buildWorld();
  let services = world.container();
  const affiliate = await services.affiliates.enroll({
    endCustomerUserId: "user_alice",
    displayName: "Alice Atomic",
    payoutEmail: "alice-atomic@example.test",
  }, ACTOR_ID);
  await services.affiliates.update(affiliate.id, { status: "active" }, ACTOR_ID);
  const code = await services.codes.create({ affiliateId: affiliate.id, code: "ATOMIC10" }, ACTOR_ID);
  world.orders.set("order_fault_counter", paidOrder("order_fault_counter", code.id));

  world.storage.failNextSetPrefix = `affiliates/counter-operation/${affiliate.id}/`;
  await assert.rejects(
    services.attributions.recordOrder({ orderId: "order_fault_counter" }),
    /forced affiliate atomic/,
  );
  const claim = await world.storage.get<{ row: { id: string } }>(
    "attributions/claims/by-order/order_fault_counter",
  );
  assert.ok(claim?.row.id);

  services = world.container();
  const recovered = await services.attributions.recordOrder({ orderId: "order_fault_counter" });
  const replay = await services.attributions.recordOrder({ orderId: "order_fault_counter" });
  assert.equal(recovered?.id, claim?.row.id);
  assert.equal(replay?.id, recovered?.id);
  assert.deepEqual(await world.storage.get<string[]>("attributions/index"), [recovered?.id]);
  assert.deepEqual(await world.storage.get<string[]>(`attributions/by-affiliate/${affiliate.id}`), [recovered?.id]);
  assert.equal(await world.storage.get<string>("attributions/by-order/order_fault_counter"), recovered?.id);
  assert.equal((await services.codes.get(code.id))?.redemptionCount, 1);
  assert.equal((await services.affiliates.get(affiliate.id))?.totalReferred, 1);
  assert.equal(
    [...world.activityRows.keys()].filter(key => key.startsWith("affiliates:attribution-record:")).length,
    1,
  );
});

test("atomic-claim services use durable locks and identity-first records", async () => {
  const [affiliates, codes, attributions, payouts] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/affiliates.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/codes.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/attributions.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/payouts.ts"), "utf8"),
  ]);
  assert.match(affiliates, /enrollmentClaimKey/);
  assert.match(affiliates, /runExclusive/);
  assert.match(codes, /codeClaimKey/);
  assert.match(codes, /redemptionOperationKey/);
  assert.match(attributions, /attributionClaimKey/);
  assert.match(attributions, /lockHeld/);
  assert.match(payouts, /withLock\("schedule-collection"/);
});
