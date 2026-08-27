import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildAffiliatesContainer } from "../src/built-ins/modules/affiliates/src/server/index";
import type { Affiliate, Attribution, Payout } from "../src/built-ins/modules/affiliates/src/lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
} from "../src/built-ins/modules/affiliates/src/server/ports";

const AGENCY_ID = "agency_affiliate_payout";
const CLIENT_ID = "client_affiliate_payout";
const AFFILIATE_ID = "affiliate_payout_owner";
const ACTOR_ID = "owner_payout";

class FaultStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  failNextSetKey: string | null = null;
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (key === this.failNextSetKey) {
      this.failNextSetKey = null;
      throw new Error(`forced affiliate storage failure: ${key}`);
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
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

function buildWorld(storage: FaultStorage) {
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
  const events: EventBusPort = { emit(_scope, name, payload) { emitted.push({ name, payload }); } };
  const services = buildAffiliatesContainer({
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    storage,
    activity,
    events,
    tenant: {
      getClient() { return null; },
      getClientForAgency() { return null; },
    },
    user: { getUser() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
    ecommerceOrders: { getOrder() { return null; } },
  });
  return { services, activityRows, emitted };
}

async function seedAffiliate(storage: FaultStorage): Promise<void> {
  const affiliate: Affiliate = {
    id: AFFILIATE_ID,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    endCustomerUserId: "affiliate_user",
    displayName: "Payout Owner",
    status: "active",
    payoutEmail: "affiliate@example.test",
    totalReferred: 0,
    lifetimeEarnings: 0,
    joinedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  await storage.set(`affiliates/by-id/${AFFILIATE_ID}`, affiliate);
  await storage.set("affiliates/index", [AFFILIATE_ID]);
}

async function addApprovedAttribution(
  storage: FaultStorage,
  id: string,
  amountCents: number,
): Promise<void> {
  const attribution: Attribution = {
    id,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    orderId: `order_${id}`,
    affiliateId: AFFILIATE_ID,
    referralCodeId: "code_payout",
    amountCents,
    currency: "usd",
    orderAmountCents: amountCents * 10,
    orderSubtotalCents: amountCents * 10,
    orderStatusSnapshot: "paid",
    commissionPercentSnapshot: 10,
    status: "approved",
    createdAt: Date.now(),
    approvedAt: Date.now(),
  };
  await storage.set(`attributions/by-id/${id}`, attribution);
  const index = (await storage.get<string[]>("attributions/index")) ?? [];
  await storage.set("attributions/index", [...index, id]);
  const affiliateIndex = (await storage.get<string[]>(`attributions/by-affiliate/${AFFILIATE_ID}`)) ?? [];
  await storage.set(`attributions/by-affiliate/${AFFILIATE_ID}`, [...affiliateIndex, id]);
}

test("schedule claims each approved attribution into exactly one recoverable payout", async () => {
  const storage = new FaultStorage();
  await seedAffiliate(storage);
  await addApprovedAttribution(storage, "attr_fault", 500);
  let world = buildWorld(storage);
  storage.failNextSetKey = "payouts/index";
  await assert.rejects(
    world.services.payouts.schedule({
      affiliateId: AFFILIATE_ID,
      operationId: "schedule-fault",
    }, ACTOR_ID),
    /forced affiliate storage failure/,
  );
  const claimedAfterFault = await world.services.attributions.get("attr_fault");
  assert.ok(claimedAfterFault?.payoutId, "claim survives so retry can adopt the same payout");

  world = buildWorld(storage);
  const recovered = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    operationId: "new-browser-id-after-fault",
  }, ACTOR_ID);
  assert.equal(recovered?.id, claimedAfterFault?.payoutId);
  assert.deepEqual(await storage.get<string[]>("payouts/index"), [recovered?.id]);
  const replay = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    operationId: "schedule-fault",
  }, ACTOR_ID);
  assert.equal(replay?.id, recovered?.id);

  await addApprovedAttribution(storage, "attr_concurrent", 700);
  const concurrent = await Promise.all([
    world.services.payouts.schedule({ affiliateId: AFFILIATE_ID, operationId: "schedule-a" }, ACTOR_ID),
    world.services.payouts.schedule({ affiliateId: AFFILIATE_ID, operationId: "schedule-b" }, ACTOR_ID),
  ]);
  assert.equal(concurrent.filter(Boolean).length, 1, "competing schedules create one payout");
  const payoutIds = await storage.get<string[]>("payouts/index");
  assert.equal(payoutIds?.length, 2);
  const rows = await world.services.payouts.listForAffiliate(AFFILIATE_ID);
  const allAttributionIds = rows.flatMap(row => row.attributionIds);
  assert.equal(new Set(allAttributionIds).size, allAttributionIds.length, "payout ownership never overlaps");
  assert.equal((await world.services.attributions.get("attr_concurrent"))?.payoutId, concurrent.find(Boolean)?.id);
});

test("completion resumes after partial failure and reconciles earnings exactly once", async () => {
  const storage = new FaultStorage();
  await seedAffiliate(storage);
  await addApprovedAttribution(storage, "attr_complete", 900);
  let world = buildWorld(storage);
  const payout = await world.services.payouts.schedule({
    affiliateId: AFFILIATE_ID,
    operationId: "schedule-complete",
  }, ACTOR_ID);
  assert.ok(payout);

  storage.failNextSetKey = `affiliates/by-id/${AFFILIATE_ID}`;
  await assert.rejects(
    world.services.payouts.markPaid(payout!.id, { externalRef: "manual-900" }, ACTOR_ID),
    /forced affiliate storage failure/,
  );
  assert.equal((await world.services.attributions.get("attr_complete"))?.status, "paid");
  assert.equal((await world.services.payouts.get(payout!.id))?.status, "completed");
  assert.equal((await world.services.affiliates.get(AFFILIATE_ID))?.lifetimeEarnings, 0);

  world = buildWorld(storage);
  const recovered = await world.services.payouts.markPaid(
    payout!.id,
    { externalRef: "manual-900" },
    ACTOR_ID,
  );
  assert.equal(recovered?.status, "completed");
  assert.equal((await world.services.affiliates.get(AFFILIATE_ID))?.lifetimeEarnings, 900);

  const replays = await Promise.all([
    world.services.payouts.markPaid(payout!.id, { externalRef: "manual-900" }, ACTOR_ID),
    world.services.payouts.markPaid(payout!.id, { externalRef: "manual-900" }, ACTOR_ID),
  ]);
  assert.ok(replays.every(row => row?.status === "completed"));
  assert.equal((await world.services.affiliates.get(AFFILIATE_ID))?.lifetimeEarnings, 900);

  const duplicateLegacyPayout: Payout = {
    ...payout!,
    id: "payout_legacy_duplicate",
    status: "scheduled",
    externalRef: undefined,
    completedAt: undefined,
  };
  await storage.set(`payouts/by-id/${duplicateLegacyPayout.id}`, duplicateLegacyPayout);
  await storage.set("payouts/index", [...((await storage.get<string[]>("payouts/index")) ?? []), duplicateLegacyPayout.id]);
  await assert.rejects(
    world.services.payouts.markPaid(
      duplicateLegacyPayout.id,
      { externalRef: "must-not-double-pay" },
      ACTOR_ID,
    ),
    /belongs to payout/,
  );
  assert.equal((await world.services.affiliates.get(AFFILIATE_ID))?.lifetimeEarnings, 900);
});

test("mounted admin payout page can schedule its first payout with an operation id", async () => {
  const [component, handler, service] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/components/PayoutsList.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/api/handlers.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/payouts.ts"), "utf8"),
  ]);
  assert.match(component, /Schedule approved/);
  assert.match(component, /affiliate-payout-schedule-/);
  assert.match(handler, /operationId: body\.operationId/);
  assert.match(service, /_claimForPayout/);
  assert.match(service, /_setLifetimeEarnings/);
});
