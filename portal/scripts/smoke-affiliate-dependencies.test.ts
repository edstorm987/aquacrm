// What is still attached to an affiliate, before anyone decides to remove them.
//
// The roadmap's dependency-safe-membership-affiliate-retirement item states the
// failure: *"Affiliate DELETE leaves active codes, attributions and payouts tied
// to a missing parent."* This file verifies that claim rather than repeating it,
// and supplies the inventory the item names as its prerequisite.
//
// ── Why this one is worse than an untidy id ────────────────────────────────
//
// Two of the three orphans are FINANCIAL. An attribution records that somebody
// earned commission; a payout records that money is owed or was sent. Orphaning
// them does not merely break a screen — it detaches money from the person it
// belongs to, and the surfaces that would have shown it filter on an affiliate
// that no longer resolves, so it disappears quietly rather than erroring.
//
// A referral CODE is sharp in a different way: it stays ACTIVE. A live link
// keeps attributing sales to an affiliate who is gone.
//
// The retirement policy is RESTRICT: `removed` is the ordinary path, and hard
// deletion is allowed only while the authoritative dependency graph is empty.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAffiliatesContainer } from "../src/built-ins/modules/affiliates/src/server/index";
import {
  AffiliateHasDependantsError,
  affiliateDependencyInventory,
} from "../src/built-ins/modules/affiliates/src/server/dependencies";
import {
  clearAffiliatesFoundation,
  registerAffiliatesFoundation,
} from "../src/built-ins/modules/affiliates/src/server/foundationAdapter";
import { deleteAffiliateHandler } from "../src/built-ins/modules/affiliates/src/api/handlers";
import type { PluginCtx } from "../src/built-ins/modules/affiliates/src/lib/aquaPluginTypes";
import type { Affiliate, Attribution, Payout, ReferralCode } from "../src/built-ins/modules/affiliates/src/lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  StoragePort,
  StripeConnectPort,
} from "../src/built-ins/modules/affiliates/src/server/ports";

const AGENCY_ID = "agency_affiliate_deps";
const CLIENT_ID = "client_affiliate_deps";
const AFFILIATE_ID = "affiliate_deps_owner";
const OTHER_AFFILIATE_ID = "affiliate_deps_bystander";
const ACTOR_ID = "owner_deps";

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

function buildWorld(
  storage: MemoryStorage,
  activityOverride?: ActivityLogPort,
  stripeConnect?: StripeConnectPort,
) {
  const activity: ActivityLogPort = activityOverride ?? {
    logActivity(input) { return { id: "act", ts: Date.now(), ...input } as never; },
    listActivity() { return [] as never; },
  };
  const events: EventBusPort = { emit() {} };
  return buildAffiliatesContainer({
    agencyId: AGENCY_ID, clientId: CLIENT_ID, storage, activity, events,
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser() { return null; } },
    pluginInstalls: { getInstall() { return null; } },
    ecommerceOrders: { getOrder() { return null; } },
    stripeConnect,
  });
}

function stripeConnect(overrides: Partial<StripeConnectPort> = {}): StripeConnectPort {
  return {
    async createAccount() { return { accountId: "acct_default" }; },
    async createOnboardingLink({ accountId }) {
      return { url: `https://connect.test/${accountId}`, expiresAt: Date.now() + 60_000 };
    },
    async retrieveAccount(accountId) {
      return {
        accountId,
        onboardingStatus: "pending",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    },
    async createTransfer() { return { transferId: "tr_default", created: Date.now() }; },
    async verifyWebhookSignature() { return false; },
    ...overrides,
  };
}

async function seedAffiliate(storage: MemoryStorage, id: string, name: string): Promise<void> {
  const affiliate: Affiliate = {
    id, agencyId: AGENCY_ID, clientId: CLIENT_ID,
    endCustomerUserId: `${id}_user`, displayName: name, status: "active",
    payoutEmail: `${id}@example.test`, totalReferred: 0, lifetimeEarnings: 0,
    joinedAt: 1, createdAt: 1, updatedAt: 1,
  };
  await storage.set(`affiliates/by-id/${id}`, affiliate);
  const index = (await storage.get<string[]>("affiliates/index")) ?? [];
  await storage.set("affiliates/index", [...index, id]);
}

async function seedCode(storage: MemoryStorage, affiliateId: string, id: string, code: string): Promise<void> {
  const row: ReferralCode = {
    id, agencyId: AGENCY_ID, clientId: CLIENT_ID, affiliateId, code,
    status: "active", commissionPercent: 10, uses: 0, createdAt: 1, updatedAt: 1,
  } as ReferralCode;
  await storage.set(`codes/by-id/${id}`, row);
  const index = (await storage.get<string[]>("codes/index")) ?? [];
  await storage.set("codes/index", [...index, id]);
}

async function seedAttribution(storage: MemoryStorage, affiliateId: string, id: string): Promise<void> {
  const row: Attribution = {
    id, agencyId: AGENCY_ID, clientId: CLIENT_ID, orderId: `order_${id}`,
    affiliateId, referralCodeId: `code_${affiliateId}`, amountCents: 500, currency: "usd",
    orderAmountCents: 5_000, orderSubtotalCents: 5_000, orderStatusSnapshot: "paid",
    commissionPercentSnapshot: 10, status: "approved", createdAt: 1, approvedAt: 1,
  };
  await storage.set(`attributions/by-id/${id}`, row);
  const index = (await storage.get<string[]>("attributions/index")) ?? [];
  await storage.set("attributions/index", [...index, id]);
  const byAffiliate = (await storage.get<string[]>(`attributions/by-affiliate/${affiliateId}`)) ?? [];
  await storage.set(`attributions/by-affiliate/${affiliateId}`, [...byAffiliate, id]);
}

async function seedPayout(storage: MemoryStorage, affiliateId: string, id: string): Promise<void> {
  const row: Payout = {
    id, agencyId: AGENCY_ID, clientId: CLIENT_ID, affiliateId,
    amountCents: 500, currency: "usd", status: "pending",
    attributionIds: [], createdAt: 1, updatedAt: 1,
  } as Payout;
  await storage.set(`payouts/by-id/${id}`, row);
  const index = (await storage.get<string[]>("payouts/index")) ?? [];
  await storage.set("payouts/index", [...index, id]);
}

async function seedWorld() {
  const storage = new MemoryStorage();
  await seedAffiliate(storage, AFFILIATE_ID, "Owner");
  await seedAffiliate(storage, OTHER_AFFILIATE_ID, "Bystander");
  await seedCode(storage, AFFILIATE_ID, "code_owner", "OWNER10");
  await seedAttribution(storage, AFFILIATE_ID, "attr_owner");
  await seedPayout(storage, AFFILIATE_ID, "payout_owner");
  // The bystander exists so every count below can be wrong in a visible way.
  await seedCode(storage, OTHER_AFFILIATE_ID, "code_bystander", "BYSTANDER10");
  return { storage, services: buildWorld(storage) };
}

// The mounted route — `DELETE /api/portal/affiliates/affiliates?id=…` — resolves
// its container through the registered foundation rather than the one the tests
// build, so this registers one over the SAME storage. No Stripe Connect:
// removing an affiliate touches it on no path.
function mountedCtx(storage: MemoryStorage): PluginCtx {
  clearAffiliatesFoundation();
  registerAffiliatesFoundation({
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: { getUser() { return null; } },
    activity: {
      logActivity(input: unknown) { return { id: "act", ts: Date.now(), ...(input as object) } as never; },
      listActivity() { return [] as never; },
    },
    events: { emit() {} },
    pluginInstalls: { getInstall() { return null; } },
    ecommerceOrders: { getOrder() { return null; } },
  } as never);
  return {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    actor: ACTOR_ID,
    storage,
    install: {
      id: "inst_affiliate_deps", pluginId: "affiliates",
      agencyId: AGENCY_ID, clientId: CLIENT_ID, enabled: true, config: {}, features: {},
    } as never,
    services: {} as PluginCtx["services"],
  };
}

async function deleteViaRoute(ctx: PluginCtx, affiliateId: string) {
  const response = await deleteAffiliateHandler(
    new Request(`https://portal.test/api/portal/affiliates/affiliates?id=${affiliateId}`, { method: "DELETE" }),
    ctx,
  );
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("the inventory finds everything still attached", () => {
  it("finds the code, the attribution and the payout", async () => {
    const { services } = await seedWorld();
    const inventory = await affiliateDependencyInventory(services, AFFILIATE_ID);
    assert.equal(inventory.total, 3, `expected three dependants, got ${JSON.stringify(inventory.byKind)}`);
    assert.deepEqual(inventory.byKind, {
      "referral-code": 1,
      attribution: 1,
      payout: 1,
      "stripe-account": 0,
    });
  });

  it("says which are FINANCIAL, because that is what changes the decision", async () => {
    const { services } = await seedWorld();
    const inventory = await affiliateDependencyInventory(services, AFFILIATE_ID);
    assert.equal(inventory.hasFinancialDependants, true);
    assert.deepEqual(
      inventory.dependants.filter(dependant => dependant.financial).map(dependant => dependant.kind).sort(),
      ["attribution", "payout"],
      "commission and payout records are no longer flagged as financial — a purge would detach money silently",
    );
  });

  it("counts ACTIVE referral codes separately — a live link keeps attributing", async () => {
    const { services } = await seedWorld();
    const inventory = await affiliateDependencyInventory(services, AFFILIATE_ID);
    assert.equal(inventory.activeReferralCodes, 1);
  });

  it("does not count the OTHER affiliate's records", async () => {
    const { services } = await seedWorld();
    const inventory = await affiliateDependencyInventory(services, OTHER_AFFILIATE_ID);
    assert.equal(inventory.byKind["referral-code"], 1, "the bystander's own code went missing");
    assert.equal(inventory.byKind.attribution, 0, "another affiliate's attribution was counted");
    assert.equal(inventory.byKind.payout, 0, "another affiliate's payout was counted");
    assert.equal(inventory.hasFinancialDependants, false);
  });

  it("an affiliate with nothing attached comes back empty — the count means something", async () => {
    const { services } = await seedWorld();
    const inventory = await affiliateDependencyInventory(services, "affiliate_that_does_not_exist");
    assert.equal(inventory.total, 0);
    assert.equal(inventory.hasFinancialDependants, false);
  });
});

describe("the Affiliate service itself refuses to orphan dependants", () => {
  it("rejects a direct-service bypass and leaves the complete graph unchanged", async () => {
    const { storage, services } = await seedWorld();
    assert.equal((await affiliateDependencyInventory(services, AFFILIATE_ID)).total, 3);
    await assert.rejects(
      () => services.affiliates.delete(AFFILIATE_ID, ACTOR_ID),
      (error: unknown) => error instanceof AffiliateHasDependantsError
        && error.dependencies.total === 3
        && error.dependencies.hasFinancialDependants,
      "AffiliateService.delete bypassed the route guard and detached money from its owner",
    );
    assert.ok(await services.affiliates.get(AFFILIATE_ID), "the affiliate row was removed by the refused service command");
    assert.ok(storage.data.has("codes/by-id/code_owner"), "the referral code was touched");
    assert.ok(storage.data.has("attributions/by-id/attr_owner"), "the attribution was touched");
    assert.ok(storage.data.has("payouts/by-id/payout_owner"), "the payout was touched");
  });

  it("serializes referral-code creation against deletion, then refuses the now-dependent delete", async () => {
    const storage = new MemoryStorage();
    await seedAffiliate(storage, AFFILIATE_ID, "Owner");
    let codeWriteEntered!: () => void;
    let releaseCodeWrite!: () => void;
    const entered = new Promise<void>(resolve => { codeWriteEntered = resolve; });
    const release = new Promise<void>(resolve => { releaseCodeWrite = resolve; });
    const activity: ActivityLogPort = {
      async logActivity(input) {
        if (input.action === "affiliate.code_created") {
          codeWriteEntered();
          await release;
        }
        return { id: "act", ts: Date.now(), ...input } as never;
      },
      listActivity() { return [] as never; },
    };
    const services = buildWorld(storage, activity);

    const creating = services.codes.create({ affiliateId: AFFILIATE_ID, code: "RACE10" }, ACTOR_ID);
    await entered;
    let deleteSettled = false;
    const deleting = services.affiliates.delete(AFFILIATE_ID, ACTOR_ID).then(
      value => { deleteSettled = true; return value; },
      error => { deleteSettled = true; throw error; },
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(deleteSettled, false, "affiliate deletion crossed the in-flight referral-code graph mutation");

    releaseCodeWrite();
    const code = await creating;
    await assert.rejects(deleting, AffiliateHasDependantsError);
    assert.ok(await services.affiliates.get(AFFILIATE_ID), "the affiliate disappeared after its code committed");
    assert.equal(code.affiliateId, AFFILIATE_ID);
    assert.equal((await services.codes.list({ affiliateId: AFFILIATE_ID })).length, 1, "the committed code was orphaned or hidden");
  });

  it("treats an interrupted referral-code claim as a dependant before its primary row exists", async () => {
    const storage = new MemoryStorage();
    await seedAffiliate(storage, AFFILIATE_ID, "Owner");
    const recoveryCode: ReferralCode = {
      id: "code_recovery_owner",
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      affiliateId: AFFILIATE_ID,
      code: "RECOVERY10",
      status: "active",
      commissionPercent: 10,
      uses: 0,
      createdAt: 1,
      updatedAt: 1,
    } as ReferralCode;
    await storage.set("codes/claims/by-code/RECOVERY10", {
      signature: "code-recovery-signature",
      row: recoveryCode,
      status: "pending",
      updatedAt: 1,
    });
    const services = buildWorld(storage);

    assert.equal((await services.codes.list({ affiliateId: AFFILIATE_ID })).length, 0,
      "the fixture must exercise a claim that is not yet visible through the primary index");
    await assert.rejects(
      () => services.affiliates.delete(AFFILIATE_ID, ACTOR_ID),
      (error: unknown) => error instanceof AffiliateHasDependantsError
        && error.dependencies.total === 1
        && error.dependencies.byKind["referral-code"] === 1,
      "a pending code claim could replay after its affiliate was purged",
    );
    assert.ok(await services.affiliates.get(AFFILIATE_ID), "the affiliate was removed despite its durable code owner");
    assert.ok(storage.data.has("codes/claims/by-code/RECOVERY10"), "the refused delete touched the durable code owner");
  });
});

describe("Stripe onboarding owns a durable affiliate dependency", () => {
  it("collapses concurrent starts onto one account and one durable intent", async () => {
    const storage = new MemoryStorage();
    await seedAffiliate(storage, AFFILIATE_ID, "Owner");
    let accountCalls = 0;
    const services = buildWorld(storage, undefined, stripeConnect({
      async createAccount() {
        accountCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 15));
        return { accountId: `acct_concurrent_${accountCalls}` };
      },
    }));

    const input = {
      affiliateId: AFFILIATE_ID,
      returnUrl: "https://portal.test/affiliate/return",
      refreshUrl: "https://portal.test/affiliate/refresh",
    };
    const [first, second] = await Promise.all([
      services.onboarding!.start(input, ACTOR_ID),
      services.onboarding!.start(input, ACTOR_ID),
    ]);

    assert.equal(accountCalls, 1, "concurrent starts provisioned two connected accounts");
    assert.equal(first.affiliate.stripeAccountId, "acct_concurrent_1");
    assert.equal(second.affiliate.stripeAccountId, first.affiliate.stripeAccountId);
    const intent = storage.data.get(`affiliates/onboarding-intent/${AFFILIATE_ID}`) as {
      idempotencyKey?: string; stage?: string; accountId?: string;
    };
    assert.equal(intent.stage, "account_attached");
    assert.equal(intent.accountId, first.affiliate.stripeAccountId);
    assert.match(intent.idempotencyKey ?? "", /affiliate-account:.*affiliate_deps_owner/);
  });

  it("refuses deletion while Stripe is delayed, without holding the graph lock across provider I/O", async () => {
    const storage = new MemoryStorage();
    await seedAffiliate(storage, AFFILIATE_ID, "Owner");
    let enteredProvider!: () => void;
    let releaseProvider!: () => void;
    const providerEntered = new Promise<void>(resolve => { enteredProvider = resolve; });
    const providerRelease = new Promise<void>(resolve => { releaseProvider = resolve; });
    const services = buildWorld(storage, undefined, stripeConnect({
      async createAccount() {
        enteredProvider();
        await providerRelease;
        return { accountId: "acct_delete_race" };
      },
    }));

    const starting = services.onboarding!.start({
      affiliateId: AFFILIATE_ID,
      returnUrl: "https://portal.test/affiliate/return",
      refreshUrl: "https://portal.test/affiliate/refresh",
    }, ACTOR_ID);
    await providerEntered;

    const deletion = await Promise.race([
      services.affiliates.delete(AFFILIATE_ID, ACTOR_ID).then(
        value => ({ kind: "resolved" as const, value }),
        error => ({ kind: "rejected" as const, error }),
      ),
      new Promise<{ kind: "timeout" }>(resolve => setTimeout(() => resolve({ kind: "timeout" }), 100)),
    ]);
    assert.notEqual(deletion.kind, "timeout", "delete waited behind the Stripe provider call");
    assert.equal(deletion.kind, "rejected", "delete crossed the durable onboarding intent");
    if (deletion.kind === "rejected") assert.ok(deletion.error instanceof AffiliateHasDependantsError);
    assert.ok(await services.affiliates.get(AFFILIATE_ID), "delete removed the onboarding target");

    releaseProvider();
    const started = await starting;
    assert.equal(started.affiliate.stripeAccountId, "acct_delete_race");
  });

  it("does not report success if a non-cooperating writer removes the target before the final check", async () => {
    const storage = new MemoryStorage();
    await seedAffiliate(storage, AFFILIATE_ID, "Owner");
    const services = buildWorld(storage, undefined, stripeConnect({
      async createAccount() { return { accountId: "acct_final_validation" }; },
      async createOnboardingLink({ accountId }) {
        await storage.del(`affiliates/by-id/${AFFILIATE_ID}`);
        return { url: `https://connect.test/${accountId}`, expiresAt: Date.now() + 60_000 };
      },
    }));

    await assert.rejects(
      services.onboarding!.start({
        affiliateId: AFFILIATE_ID,
        returnUrl: "https://portal.test/affiliate/return",
        refreshUrl: "https://portal.test/affiliate/refresh",
      }, ACTOR_ID),
      /no longer owns Stripe Connect account/,
      "a stale onboarding request returned success for a deleted affiliate",
    );
  });
});

// ── The mounted route translates the service refusal ───────────────────────

describe("DELETE /affiliates refuses to orphan money", () => {
  it("answers 422 with the inventory, and names the path that works", async () => {
    const { storage } = await seedWorld();
    const ctx = mountedCtx(storage);

    const { status, body } = await deleteViaRoute(ctx, AFFILIATE_ID);

    assert.equal(status, 422, "an affiliate with a payout attached was deleted by the mounted route");
    assert.equal(body.ok, false);
    assert.equal(body.reason, "affiliate_has_dependants");

    const dependencies = body.dependencies as {
      total: number; hasFinancialDependants: boolean; activeReferralCodes: number;
    };
    assert.equal(dependencies.total, 3);
    assert.equal(dependencies.hasFinancialDependants, true, "the refusal did not carry the financial flag");
    assert.equal(dependencies.activeReferralCodes, 1);

    // It says no AND says how to deal with it — and names the two sharp things
    // rather than reporting a bare count.
    assert.match(String(body.error), /removed/i,
      'the refusal does not name the "removed" status — an admin is told no with nowhere to go');
    assert.match(String(body.error), /ACTIVE/,
      "the still-live referral code is not named in the refusal");
  });

  it("changes nothing — the affiliate and all three records survive", async () => {
    const { storage } = await seedWorld();
    const ctx = mountedCtx(storage);

    await deleteViaRoute(ctx, AFFILIATE_ID);

    const retry = await deleteViaRoute(ctx, AFFILIATE_ID);
    assert.equal(retry.status, 422, "the second attempt succeeded — the first one deleted something after all");
    assert.equal((retry.body.dependencies as { total: number }).total, 3);

    assert.ok(storage.data.has(`affiliates/by-id/${AFFILIATE_ID}`), "the affiliate row was removed by a refused delete");
    assert.ok(storage.data.has("codes/by-id/code_owner"), "the referral code was touched by a refused delete");
    assert.ok(storage.data.has("attributions/by-id/attr_owner"), "the attribution was touched by a refused delete");
    assert.ok(storage.data.has("payouts/by-id/payout_owner"), "the payout was touched by a refused delete");
  });

  it("is a guard, not a ban — an affiliate with nothing attached still deletes", async () => {
    const { storage } = await seedWorld();
    await seedAffiliate(storage, "affiliate_clean", "Clean");
    const ctx = mountedCtx(storage);

    const { status, body } = await deleteViaRoute(ctx, "affiliate_clean");
    assert.equal(status, 200, `an affiliate with no dependants was refused: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);
    assert.equal(storage.data.has("affiliates/by-id/affiliate_clean"), false, "the empty affiliate survived a 200");
  });

  it("still answers 404 for an affiliate that does not exist", async () => {
    const { storage } = await seedWorld();
    const ctx = mountedCtx(storage);
    const { status } = await deleteViaRoute(ctx, "affiliate_never_existed");
    assert.equal(status, 404, "an unknown id must stay a 404, not become a dependency refusal");
  });
});
