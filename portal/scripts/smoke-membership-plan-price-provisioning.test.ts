import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Plan } from "../src/built-ins/modules/memberships/src/lib/domain";
import { operationForPlanDraft } from "../src/built-ins/modules/memberships/src/lib/planDraftOperation";
import type { PluginCtx } from "../src/built-ins/modules/memberships/src/lib/aquaPluginTypes";
import {
  createPlanHandler,
  updatePlanHandler,
} from "../src/built-ins/modules/memberships/src/api/handlers";
import { buildMembershipsContainer } from "../src/built-ins/modules/memberships/src/server/index";
import { PlanHasDependantsError } from "../src/built-ins/modules/memberships/src/server/dependencies";
import {
  clearMembershipsFoundation,
  registerMembershipsFoundation,
} from "../src/built-ins/modules/memberships/src/server/foundationAdapter";
import {
  PLAN_PRICE_COMMAND_PREFIX,
  PlanPriceOperationConflictError,
  type PlanPriceProvisioningCommand,
} from "../src/built-ins/modules/memberships/src/server/plans";
import type {
  ActivityLogPort,
  StoragePort,
  StripePort,
  StripePrice,
  StripePriceInput,
} from "../src/built-ins/modules/memberships/src/server/ports";

const AGENCY_ID = "agency_plan_prices";
const CLIENT_ID = "client_plan_prices";
const ACTOR = "owner_plan_prices";

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  private readonly tails = new Map<string, Promise<void>>();
  failNextPlanRowWrite = false;
  failNextGetKey: string | null = null;
  activeTransactions = 0;

  constructor(private readonly productionGlobalLease = false) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (this.failNextGetKey === key) {
      this.failNextGetKey = null;
      throw new Error("simulated storage read failure");
    }
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (
      this.failNextPlanRowWrite
      && key.startsWith("memberships/plans/")
      && key !== "memberships/plans/index"
      && key !== "memberships/plans/seed-report"
    ) {
      this.failNextPlanRowWrite = false;
      throw new Error("simulated plan-row commit failure");
    }
    this.data.set(key, structuredClone(value));
  }

  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }

  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = this.productionGlobalLease ? "portal-state-global-lease" : key;
    const previous = this.tails.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(lockKey, tail);
    await previous.catch(() => undefined);
    this.activeTransactions += 1;
    try {
      return await operation();
    } finally {
      this.activeTransactions -= 1;
      release();
      if (this.tails.get(lockKey) === tail) this.tails.delete(lockKey);
    }
  }
}

interface Deferred {
  entered: Promise<void>;
  release: () => void;
}

function deferred(): Deferred & { signal: () => void; wait: Promise<void> } {
  let signal!: () => void;
  let release!: () => void;
  return {
    entered: new Promise<void>(resolve => { signal = resolve; }),
    wait: new Promise<void>(resolve => { release = resolve; }),
    signal: () => signal(),
    release: () => release(),
  };
}

class PriceProvider {
  readonly calls: StripePriceInput[] = [];
  readonly outcomes = new Map<string, StripePrice>();
  failAnnualOnce = false;
  delayCadence: "monthly" | "annual" | null = null;
  delay: ReturnType<typeof deferred> | null = null;
  beforeCall?: () => void;
  private sequence = 0;

  async createPrice(input: StripePriceInput): Promise<StripePrice> {
    this.beforeCall?.();
    this.calls.push(structuredClone(input));
    const cadence = input.recurring.interval === "month" ? "monthly" : "annual";
    if (this.delayCadence === cadence && this.delay) {
      const gate = this.delay;
      this.delayCadence = null;
      gate.signal();
      await gate.wait;
    }
    if (cadence === "annual" && this.failAnnualOnce) {
      this.failAnnualOnce = false;
      throw new Error("simulated annual Stripe failure");
    }
    const key = input.idempotencyKey;
    assert.ok(key, "plan price provider call did not carry an idempotency key");
    const prior = this.outcomes.get(key);
    if (prior) return prior;
    const price = { id: `price_${cadence}_${++this.sequence}`, productId: `product_${this.sequence}` };
    this.outcomes.set(key, price);
    return price;
  }
}

function basePlan(id: string, name = "Existing"): Plan {
  return {
    id,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    name,
    priceMonthly: 1_000,
    priceAnnual: 10_000,
    currency: "gbp",
    stripePriceIdMonthly: `price_old_monthly_${id}`,
    stripePriceIdAnnual: `price_old_annual_${id}`,
    features: [],
    benefitIds: [],
    status: "active",
    order: 10,
    createdAt: 1,
    updatedAt: 1,
  };
}

function seedPlan(storage: MemoryStorage, plan: Plan): void {
  const index = (storage.data.get("memberships/plans/index") as string[] | undefined) ?? [];
  storage.data.set("memberships/plans/index", [...index, plan.id]);
  storage.data.set(`memberships/plans/${plan.id}`, structuredClone(plan));
}

function services(storage: MemoryStorage, provider: PriceProvider) {
  const activityByKey = new Map<string, unknown>();
  const activity: ActivityLogPort = {
    logActivity(input) {
      const key = input.idempotencyKey ?? `activity-${activityByKey.size + 1}`;
      const existing = activityByKey.get(key);
      if (existing) return existing as never;
      const entry = { id: key, ts: Date.now(), ...input };
      activityByKey.set(key, entry);
      return entry as never;
    },
    listActivity() { return [...activityByKey.values()] as never; },
  };
  return buildMembershipsContainer({
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    storage,
    activity,
    events: { emit() {} },
    stripe: { createPrice: input => provider.createPrice(input) } as StripePort,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
  });
}

function mountedCtx(storage: MemoryStorage, provider: PriceProvider): PluginCtx {
  clearMembershipsFoundation();
  registerMembershipsFoundation({
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser() { return null; } },
    activity: {
      logActivity(input: unknown) { return { id: "activity", ts: Date.now(), ...(input as object) } as never; },
      listActivity() { return [] as never; },
    },
    events: { emit() {} },
    pluginInstalls: { getInstall() { return null; } },
    stripeFor: () => ({ createPrice: input => provider.createPrice(input) }) as StripePort,
  } as never);
  return {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    actor: ACTOR,
    storage,
    install: {
      id: "install_plan_prices",
      pluginId: "memberships",
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      enabled: true,
      config: {},
      features: {},
    } as never,
    services: {} as PluginCtx["services"],
  };
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

const paidInput = {
  name: "Replayable",
  description: "Two provider steps",
  priceMonthly: 2_000,
  priceAnnual: 20_000,
  currency: "gbp" as const,
  benefitIds: [],
};

async function within<T>(promise: Promise<T>, message: string): Promise<T> {
  const result = await Promise.race([
    promise.then(value => ({ value })),
    new Promise<{ timeout: true }>(resolve => setTimeout(() => resolve({ timeout: true }), 100)),
  ]);
  assert.ok(!("timeout" in result), message);
  return result.value;
}

describe("membership plan price provisioning", () => {
  it("keeps an exact form retry id but rotates it after the user edits the intent", () => {
    let sequence = 0;
    const first = operationForPlanDraft(null, paidInput, () => `operation-${++sequence}`);
    const exactRetry = operationForPlanDraft(first, { ...paidInput }, () => `operation-${++sequence}`);
    const editedRetry = operationForPlanDraft(first, { ...paidInput, name: "Edited" }, () => `operation-${++sequence}`);

    assert.equal(exactRetry.operationId, first.operationId);
    assert.notEqual(editedRetry.operationId, first.operationId);
    assert.equal(sequence, 2, "an exact retry unnecessarily consumed a new operation identity");
  });

  it("keeps ordinary PATCH compatible and requires an operation id only for provider-price changes", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const target = basePlan("plan_patch_contract");
    seedPlan(storage, target);
    const ctx = mountedCtx(storage, provider);

    const metadataResponse = await updatePlanHandler(new Request("https://portal.test/api/portal/memberships/plans", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: target.id, patch: { status: "archived" } }),
    }), ctx);
    const metadataBody = await responseBody(metadataResponse);
    assert.equal(metadataResponse.status, 200);
    assert.equal((metadataBody.plan as Plan).status, "archived");
    assert.equal("operationId" in metadataBody, false, "a direct PATCH falsely promised operation replay semantics");

    const missingOperation = await updatePlanHandler(new Request("https://portal.test/api/portal/memberships/plans", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: target.id, patch: { priceMonthly: 1_500 } }),
    }), ctx);
    assert.equal(missingOperation.status, 400);
    assert.match(String((await responseBody(missingOperation)).error), /price changes/i);
    assert.equal(provider.calls.length, 0);
  });

  it("reports provider and post-provider storage failures as retryable under the same operation id", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    provider.failAnnualOnce = true;
    const ctx = mountedCtx(storage, provider);
    const operationId = "route-provider-retry";
    const request = () => new Request("https://portal.test/api/portal/memberships/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paidInput, operationId }),
    });

    const failedProvider = await createPlanHandler(request(), ctx);
    const failedProviderBody = await responseBody(failedProvider);
    assert.equal(failedProvider.status, 503);
    assert.equal(failedProviderBody.retryable, true);
    assert.equal(failedProviderBody.operationId, operationId);

    const recovered = await createPlanHandler(request(), ctx);
    assert.equal(recovered.status, 201);
    assert.equal(provider.calls.filter(call => call.recurring.interval === "month").length, 1);

    const storageOperationId = "route-storage-retry";
    storage.failNextPlanRowWrite = true;
    const storageRequest = () => new Request("https://portal.test/api/portal/memberships/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...paidInput,
        name: "Storage retry",
        operationId: storageOperationId,
      }),
    });
    const failedStorage = await createPlanHandler(storageRequest(), ctx);
    const failedStorageBody = await responseBody(failedStorage);
    assert.equal(failedStorage.status, 503);
    assert.equal(failedStorageBody.retryable, true);
    assert.equal(failedStorageBody.operationId, storageOperationId);
    const recoveredStorage = await createPlanHandler(storageRequest(), ctx);
    assert.equal(recoveredStorage.status, 201);
  });

  it("keeps invalid plan input non-retryable instead of conflating it with storage failure", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const ctx = mountedCtx(storage, provider);
    const response = await createPlanHandler(new Request("https://portal.test/api/portal/memberships/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...paidInput, priceMonthly: 1.5, operationId: "invalid-input" }),
    }), ctx);

    const body = await responseBody(response);
    assert.equal(response.status, 422);
    assert.equal(body.retryable, undefined);
    assert.equal(provider.calls.length, 0);
  });

  it("does not keep the install graph locked while a different plan waits on Stripe", async () => {
    // File/Postgres production storage deliberately maps every logical key to
    // one PortalState lease. This fixture does the same, so a regression that
    // wraps Stripe in storage.runExclusive blocks the unrelated delete below.
    const storage = new MemoryStorage(true);
    const provider = new PriceProvider();
    provider.beforeCall = () => assert.equal(
      storage.activeTransactions,
      0,
      "Stripe was called while the production-shaped PortalState lease was held",
    );
    const existing = basePlan("plan_unrelated");
    seedPlan(storage, existing);
    provider.delay = deferred();
    provider.delayCadence = "monthly";
    const world = services(storage, provider);

    const creating = world.plans.create(paidInput, ACTOR, "create-delayed-provider");
    await provider.delay.entered;

    const visible = await within(world.plans.get(existing.id), "an unrelated graph read waited behind Stripe");
    assert.equal(visible?.id, existing.id);
    const deleted = await within(
      world.plans.delete(existing.id, ACTOR),
      "an unrelated graph delete waited behind Stripe",
    );
    assert.equal(deleted, true);

    provider.delay.release();
    assert.equal((await creating).name, paidInput.name);
  });

  it("publishes an update intent before provider I/O so target deletion is refused", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const target = basePlan("plan_delete_guard");
    seedPlan(storage, target);
    provider.delay = deferred();
    provider.delayCadence = "monthly";
    const world = services(storage, provider);

    const updating = world.plans.update(
      target.id,
      { priceMonthly: 1_500 },
      ACTOR,
      "update-delete-guard",
    );
    await provider.delay.entered;
    await assert.rejects(
      world.plans.delete(target.id, ACTOR),
      (error: unknown) => error instanceof PlanHasDependantsError
        && error.dependencies.pendingPlanChanges === 1,
    );
    provider.delay.release();
    assert.equal((await updating)?.priceMonthly, 1_500);
  });

  it("converges concurrent duplicate operations on one plan and one price per cadence", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const firstContainer = services(storage, provider);
    const secondContainer = services(storage, provider);
    const [first, second] = await Promise.all([
      firstContainer.plans.create(paidInput, ACTOR, "duplicate-create"),
      secondContainer.plans.create(paidInput, ACTOR, "duplicate-create"),
    ]);

    assert.equal(first.id, second.id);
    assert.equal(first.stripePriceIdMonthly, second.stripePriceIdMonthly);
    assert.equal(first.stripePriceIdAnnual, second.stripePriceIdAnnual);
    assert.equal(provider.calls.filter(call => call.recurring.interval === "month").length, 1);
    assert.equal(provider.calls.filter(call => call.recurring.interval === "year").length, 1);
    assert.deepEqual(await firstContainer.plans.list(), [first]);
    await assert.rejects(
      firstContainer.plans.create({ ...paidInput, name: "Different intent" }, ACTOR, "duplicate-create"),
      (error: unknown) => error instanceof PlanPriceOperationConflictError,
      "one operation id was accepted for different plan input",
    );
    assert.equal(provider.calls.length, 2, "an operation-id conflict reached Stripe");
  });

  it("retries annual after failure without creating a second monthly price", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    provider.failAnnualOnce = true;
    const world = services(storage, provider);

    await assert.rejects(
      world.plans.create(paidInput, ACTOR, "annual-retry"),
      /simulated annual Stripe failure/,
    );
    const commandKey = [...storage.data.keys()].find(key => key.startsWith(PLAN_PRICE_COMMAND_PREFIX));
    const interrupted = commandKey
      ? storage.data.get(commandKey) as PlanPriceProvisioningCommand
      : undefined;
    assert.equal(interrupted?.stage, "pending");
    assert.ok(interrupted?.monthlyPrice, "the successful monthly outcome was not durably checkpointed");

    const plan = await world.plans.create(paidInput, ACTOR, "annual-retry");
    assert.ok(plan.stripePriceIdMonthly);
    assert.ok(plan.stripePriceIdAnnual);
    assert.equal(provider.calls.filter(call => call.recurring.interval === "month").length, 1);
    assert.equal(provider.calls.filter(call => call.recurring.interval === "year").length, 2);
  });

  it("replays a provider-applied command in a rebuilt container after commit failure", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const firstContainer = services(storage, provider);
    storage.failNextPlanRowWrite = true;

    await assert.rejects(
      firstContainer.plans.create(paidInput, ACTOR, "container-replay"),
      /simulated plan-row commit failure/,
    );
    assert.equal(provider.calls.length, 2);

    const rebuiltContainer = services(storage, provider);
    const recovered = await rebuiltContainer.plans.create(paidInput, ACTOR, "container-replay");
    assert.equal(provider.calls.length, 2, "container replay called Stripe again after both outcomes were durable");
    assert.equal((await rebuiltContainer.plans.get(recovered.id))?.id, recovered.id);
  });

  it("does not poison a provider-applied command when final reference storage briefly fails", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const benefitId = "benefit_storage_retry";
    storage.data.set(`memberships/benefits/${benefitId}`, {
      id: benefitId,
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
    });
    provider.delay = deferred();
    provider.delayCadence = "monthly";
    const world = services(storage, provider);
    const input = { ...paidInput, benefitIds: [benefitId] };

    const creating = world.plans.create(input, ACTOR, "reference-storage-retry");
    await provider.delay.entered;
    storage.failNextGetKey = `memberships/benefits/${benefitId}`;
    provider.delay.release();
    await assert.rejects(creating, /simulated storage read failure/);

    const interrupted = [...storage.data.values()].find(value =>
      (value as PlanPriceProvisioningCommand | undefined)?.id === "reference-storage-retry") as PlanPriceProvisioningCommand;
    assert.equal(interrupted.stage, "provider_applied");
    assert.equal(provider.calls.length, 2);

    const recovered = await world.plans.create(input, ACTOR, "reference-storage-retry");
    assert.equal(recovered.benefitIds[0], benefitId);
    assert.equal(provider.calls.length, 2, "storage retry minted replacement Stripe prices");
  });

  it("rejects a stale update outcome and preserves the intervening plan edit", async () => {
    const storage = new MemoryStorage();
    const provider = new PriceProvider();
    const target = basePlan("plan_stale_update");
    seedPlan(storage, target);
    provider.delay = deferred();
    provider.delayCadence = "monthly";
    const world = services(storage, provider);

    const pricing = world.plans.update(
      target.id,
      { priceMonthly: 3_000, priceAnnual: 0 },
      ACTOR,
      "stale-price-update",
    );
    await provider.delay.entered;
    const renamed = await world.plans.update(
      target.id,
      { name: "Intervening edit" },
      ACTOR,
      "intervening-name-update",
    );
    assert.equal(renamed?.name, "Intervening edit");
    provider.delay.release();

    await assert.rejects(
      pricing,
      (error: unknown) => error instanceof PlanPriceOperationConflictError,
    );
    const persisted = await world.plans.get(target.id);
    assert.equal(persisted?.name, "Intervening edit");
    assert.equal(persisted?.priceMonthly, target.priceMonthly);
    assert.equal(persisted?.stripePriceIdMonthly, target.stripePriceIdMonthly);
    const command = [...storage.data.values()].find(value =>
      (value as PlanPriceProvisioningCommand | undefined)?.id === "stale-price-update") as PlanPriceProvisioningCommand;
    assert.equal(command.stage, "conflicted");

    assert.equal(
      await world.plans.delete(target.id, ACTOR),
      true,
      "a terminal stale command kept blocking plan retirement",
    );
  });
});
