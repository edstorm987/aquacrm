// Affiliates plugin smoke. node:test via tsx --test.
//
// Builds an in-memory foundation + a mock EcommerceOrdersPort that
// stages orders with `referralCodeId`s, and walks the lifecycle:
//
//   - enroll happy path + double-enrol rejection
//   - findByCode returns active code, archived returns null
//   - recordOrder creates pending Attribution; second call same orderId is idempotent
//   - approve flips pending → approved; double-approve no-op
//   - schedule rolls approved → Payout; pending excluded
//   - markPaid flips attributions to paid + bumps lifetime earnings
//   - side-effects: activity log + event bus

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  EndCustomerProfile,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EcommerceOrderProjection,
  EcommerceOrdersPort,
  EventBusPort,
  PluginInstallStorePort,
  StripeConnectAccountSnapshot,
  StripeConnectPort,
  TenantPort,
  UserPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";

const AGENCY_ID: AgencyId = "agency_aff_smoke";
const CLIENT_ID: ClientId = "client_aff_smoke";
const ACTOR: UserId = "user_admin";
const ALICE: UserId = "user_alice";              // becomes affiliate
const BOB_BUYER: UserId = "user_bob_buyer";      // referred customer

function buildWorld() {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const orders = new Map<string, EcommerceOrderProjection>();

  const client: Client = {
    id: CLIENT_ID, agencyId: AGENCY_ID, name: "Smoke Affiliate Co", slug: "smoke-aff",
    brand: { primaryColor: "#000" }, stage: "live", status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const profiles: Record<string, EndCustomerProfile> = {
    [ALICE]: { id: ALICE, email: "alice@smoke-aff.test", name: "Alice", agencyId: AGENCY_ID, clientId: CLIENT_ID },
  };

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
    getClient: id => (id === CLIENT_ID ? client : null),
    getClientForAgency: (a, id) => (a === AGENCY_ID && id === CLIENT_ID ? client : null),
  };
  const user: UserPort = {
    getUser: id => profiles[id] ?? null,
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
    listActivity(filter) {
      return activityLog.filter(e => e.agencyId === filter.agencyId);
    },
  };
  const eventBus: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; },
  };
  const ecommerceOrders: EcommerceOrdersPort = {
    async getOrder(args) { return orders.get(args.orderId) ?? null; },
  };

  // R12 — mock Stripe Connect driver. Records every call so the smoke
  // can assert idempotency-key shape + transfer destination.
  const stripeCalls: { kind: string; payload: unknown }[] = [];
  const stripeAccounts = new Map<string, StripeConnectAccountSnapshot>();
  let stripeAccountSeq = 1;
  let stripeTransferSeq = 1;
  const stripeConnect: StripeConnectPort = {
    async createAccount(args) {
      const accountId = `acct_smoke_${String(stripeAccountSeq++).padStart(3, "0")}`;
      stripeAccounts.set(accountId, {
        accountId,
        onboardingStatus: "pending",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      });
      stripeCalls.push({ kind: "createAccount", payload: { ...args, accountId } });
      return { accountId };
    },
    async createOnboardingLink(args) {
      stripeCalls.push({ kind: "createOnboardingLink", payload: args });
      return {
        url: `https://connect.stripe.test/setup/${args.accountId}`,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
    },
    async retrieveAccount(accountId) {
      stripeCalls.push({ kind: "retrieveAccount", payload: { accountId } });
      return stripeAccounts.get(accountId) ?? {
        accountId,
        onboardingStatus: "pending",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    },
    async createTransfer(args) {
      stripeCalls.push({ kind: "createTransfer", payload: args });
      return { transferId: `tr_smoke_${String(stripeTransferSeq++).padStart(3, "0")}`, created: Date.now() };
    },
    verifyWebhookSignature({ signature }) {
      stripeCalls.push({ kind: "verifyWebhookSignature", payload: { hasSig: !!signature } });
      return signature === "sig_smoke_ok";
    },
  };

  function setStripeAccountState(accountId: string, patch: Partial<StripeConnectAccountSnapshot>) {
    const cur = stripeAccounts.get(accountId);
    if (!cur) return;
    stripeAccounts.set(accountId, { ...cur, ...patch });
  }

  return {
    storage, tenant, user, activity, events: eventBus, pluginInstalls, ecommerceOrders, stripeConnect,
    inspect: { activityLog, events, orders, stripeCalls, stripeAccounts, setStripeAccountState },
  };
}

describe("affiliates smoke", () => {
  let world: ReturnType<typeof buildWorld>;
  let services: ReturnType<typeof containerWithDeps>;
  let aliceAffiliateId: string;
  let codeId: string;
  let codeRaw: string;
  let attribution1Id: string;

  before(() => {
    world = buildWorld();
    services = containerWithDeps({
      agencyId: AGENCY_ID, clientId: CLIENT_ID,
      storage: world.storage,
      tenant: world.tenant, user: world.user,
      activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls,
      ecommerceOrders: world.ecommerceOrders,
      stripeConnect: world.stripeConnect,
    });
  });

  test("step 0: enroll + double-enrol rejected", async () => {
    const aff = await services.affiliates.enroll({
      endCustomerUserId: ALICE,
      displayName: "Alice the Affiliate",
      payoutEmail: "alice-payouts@smoke-aff.test",
    }, ACTOR);
    aliceAffiliateId = aff.id;
    assert.equal(aff.status, "pending", "enrolment lands in pending");
    assert.equal(aff.totalReferred, 0);

    await assert.rejects(
      services.affiliates.enroll({
        endCustomerUserId: ALICE,
        displayName: "Alice 2",
        payoutEmail: "x@y.z",
      }, ACTOR),
      /already an affiliate/i,
    );

    // Owner approves.
    const updated = await services.affiliates.update(aliceAffiliateId, { status: "active" }, ACTOR);
    assert.equal(updated?.status, "active");
  });

  test("step 1: create code + findByCode + collision detection", async () => {
    const code = await services.codes.create({
      affiliateId: aliceAffiliateId,
      code: "ALICE10",
    }, ACTOR);
    codeId = code.id;
    codeRaw = code.code;
    assert.equal(code.code, "ALICE10");
    assert.equal(code.status, "active");
    assert.equal(code.redemptionCount, 0);

    // findByCode is case-insensitive + active-only.
    const found = await services.codes.findByCode("alice10");
    assert.ok(found);
    assert.equal(found?.id, code.id);

    // Collision rejected.
    await assert.rejects(
      services.codes.create({ affiliateId: aliceAffiliateId, code: "ALICE10" }, ACTOR),
      /already exists/i,
    );

    // Archived code not returned by findByCode.
    const arch = await services.codes.create({ affiliateId: aliceAffiliateId, code: "ARCHIVED1" }, ACTOR);
    await services.codes.update(arch.id, { status: "archived" }, ACTOR);
    const afterArchive = await services.codes.findByCode("ARCHIVED1");
    assert.equal(afterArchive, null, "archived code returns null");
  });

  test("step 2: recordOrder creates pending Attribution + idempotent", async () => {
    // Stage an ecommerce order that carries the referral code.
    world.inspect.orders.set("ord_001", {
      id: "ord_001",
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      endCustomerUserId: BOB_BUYER,
      amountTotal: 4500,           // post-discount
      currency: "usd",
      subtotal: 5000,              // pre-discount
      referralCodeId: codeId,
      createdAt: Date.now(),
    });

    const attr = await services.attributions.recordOrder({
      orderId: "ord_001",
      defaultCommissionPercent: 10,
    });
    assert.ok(attr);
    attribution1Id = attr!.id;
    assert.equal(attr?.status, "pending");
    assert.equal(attr?.commissionPercentSnapshot, 10);
    assert.equal(attr?.amountCents, 500);              // 10% of 5000

    // Idempotent — same orderId returns the same row.
    const second = await services.attributions.recordOrder({
      orderId: "ord_001",
      defaultCommissionPercent: 10,
    });
    assert.equal(second?.id, attr?.id);

    // Affiliate counters bumped.
    const aff = await services.affiliates.get(aliceAffiliateId);
    assert.equal(aff?.totalReferred, 1);

    // Code redemption count bumped.
    const code = await services.codes.get(codeId);
    assert.equal(code?.redemptionCount, 1);
  });

  test("step 3: recordOrder skipped when no code", async () => {
    world.inspect.orders.set("ord_no_code", {
      id: "ord_no_code", agencyId: AGENCY_ID, clientId: CLIENT_ID,
      amountTotal: 3000, currency: "usd", subtotal: 3000,
      createdAt: Date.now(),
    });
    const attr = await services.attributions.recordOrder({
      orderId: "ord_no_code",
      defaultCommissionPercent: 10,
    });
    assert.equal(attr, null, "no code → no attribution");
  });

  test("step 4: approve flips pending → approved (idempotent on approved)", async () => {
    const out = await services.attributions.approve(attribution1Id, ACTOR);
    assert.equal(out?.status, "approved");
    assert.ok(out?.approvedAt);

    // Double-approve is a no-op (returns same status).
    const second = await services.attributions.approve(attribution1Id, ACTOR);
    assert.equal(second?.status, "approved");
  });

  test("step 5: schedule rolls only approved attributions into Payout", async () => {
    // Create a second order so we have a pending attribution to exclude.
    world.inspect.orders.set("ord_002", {
      id: "ord_002", agencyId: AGENCY_ID, clientId: CLIENT_ID,
      endCustomerUserId: BOB_BUYER,
      amountTotal: 2000, currency: "usd", subtotal: 2000,
      referralCodeId: codeId,
      createdAt: Date.now(),
    });
    const second = await services.attributions.recordOrder({
      orderId: "ord_002",
      defaultCommissionPercent: 10,
    });
    assert.equal(second?.status, "pending");

    const payout = await services.payouts.schedule(
      { affiliateId: aliceAffiliateId },
      ACTOR,
      "manual",
    );
    assert.ok(payout);
    assert.equal(payout?.status, "scheduled");
    assert.equal(payout?.method, "manual");
    assert.equal(payout?.attributionIds.length, 1, "only the approved attribution rolled in");
    assert.equal(payout?.amountCents, 500);

    // markPaid flips both the payout AND its rolled attributions.
    const paid = await services.payouts.markPaid(payout!.id, {
      externalRef: "PP-ABC123",
    }, ACTOR);
    assert.equal(paid?.status, "completed");
    assert.equal(paid?.externalRef, "PP-ABC123");

    const attr = await services.attributions.get(attribution1Id);
    assert.equal(attr?.status, "paid");
    assert.equal(attr?.payoutId, payout!.id);

    // Lifetime earnings bumped.
    const aff = await services.affiliates.get(aliceAffiliateId);
    assert.equal(aff?.lifetimeEarnings, 500);
  });

  test("step 6: schedule with no approved attributions returns null", async () => {
    const out = await services.payouts.schedule(
      { affiliateId: aliceAffiliateId },
      ACTOR,
      "manual",
    );
    assert.equal(out, null, "no approved attributions → no payout scheduled");
  });

  test("step 7: side-effects — activity log + event bus", async () => {
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, limit: 100 });
    const actions = log.map(e => e.action);
    assert.ok(actions.includes("affiliate.enrolled"));
    assert.ok(actions.includes("affiliate.code_created"));
    assert.ok(actions.includes("affiliate.attribution_recorded"));
    assert.ok(actions.includes("affiliate.attribution_approved"));
    assert.ok(actions.includes("affiliate.payout_scheduled"));
    assert.ok(actions.includes("affiliate.payout_completed"));

    const eventNames = world.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("affiliate.enrolled"));
    assert.ok(eventNames.includes("affiliate.code_created"));
    assert.ok(eventNames.includes("affiliate.attribution_recorded"));
    assert.ok(eventNames.includes("affiliate.payout_scheduled"));
    assert.ok(eventNames.includes("affiliate.payout_completed"));
  });

  test("step 8: customer view — getByUser + listForAffiliate", async () => {
    const aff = await services.affiliates.getByUser(ALICE);
    assert.ok(aff);
    assert.equal(aff?.id, aliceAffiliateId);

    const forAff = await services.attributions.listForAffiliate(aliceAffiliateId);
    assert.equal(forAff.length, 2, "both attributions surface");

    const codes = await services.codes.list({ affiliateId: aliceAffiliateId });
    assert.equal(codes.length, 2, "active + archived both list");
  });

  // ─── R12 — Stripe Connect onboarding + payout ────────────────────────────

  test("step 9: Stripe onboarding — start creates Connect account + AccountLink, status pending", async () => {
    assert.ok(services.onboarding, "OnboardingService present when stripeConnect provided");

    const out = await services.onboarding!.start({
      affiliateId: aliceAffiliateId,
      returnUrl: "https://luvandker.com/portal/customer/affiliates",
      refreshUrl: "https://luvandker.com/portal/customer/affiliates",
    }, ACTOR);

    assert.match(out.onboardingUrl, /^https:\/\/connect\.stripe\.test\/setup\/acct_smoke_/);
    assert.equal(out.affiliate.stripeOnboardingStatus, "pending");
    assert.match(out.affiliate.stripeAccountId ?? "", /^acct_smoke_/);

    // Idempotent — calling start again on the same affiliate reuses the
    // existing Connect account (does not call createAccount twice).
    const accountCallsBefore = world.inspect.stripeCalls.filter(c => c.kind === "createAccount").length;
    const second = await services.onboarding!.start({
      affiliateId: aliceAffiliateId,
      returnUrl: "https://luvandker.com/portal/customer/affiliates",
      refreshUrl: "https://luvandker.com/portal/customer/affiliates",
    }, ACTOR);
    const accountCallsAfter = world.inspect.stripeCalls.filter(c => c.kind === "createAccount").length;
    assert.equal(accountCallsAfter, accountCallsBefore, "createAccount NOT called on resume");
    assert.equal(second.affiliate.stripeAccountId, out.affiliate.stripeAccountId);
  });

  test("step 10: Stripe onboarding — webhook account.updated flips pending → complete", async () => {
    const aff = await services.affiliates.get(aliceAffiliateId);
    assert.ok(aff?.stripeAccountId);

    // Simulate Stripe finishing the hosted flow.
    world.inspect.setStripeAccountState(aff!.stripeAccountId!, {
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });

    // Webhook handler reads the snapshot we project from `account.updated`.
    const out = await services.onboarding!.applySnapshotForAccount(aff!.stripeAccountId!, {
      accountId: aff!.stripeAccountId!,
      onboardingStatus: "pending",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
    assert.equal(out?.stripeOnboardingStatus, "complete");

    // Restricted state — needs additional info.
    const restricted = await services.onboarding!.applySnapshotForAccount(aff!.stripeAccountId!, {
      accountId: aff!.stripeAccountId!,
      onboardingStatus: "pending",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      disabledReason: "requirements.past_due",
    });
    assert.equal(restricted?.stripeOnboardingStatus, "restricted");

    // Flip back to complete for the rest of the test.
    await services.onboarding!.applySnapshotForAccount(aff!.stripeAccountId!, {
      accountId: aff!.stripeAccountId!,
      onboardingStatus: "pending",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });
  });

  test("step 11: processPayout requires Stripe complete + creates real Transfer", async () => {
    // Create a third order so we have an approved attribution waiting.
    world.inspect.orders.set("ord_003", {
      id: "ord_003", agencyId: AGENCY_ID, clientId: CLIENT_ID,
      endCustomerUserId: BOB_BUYER,
      amountTotal: 8000, currency: "usd", subtotal: 8000,
      referralCodeId: codeId,
      createdAt: Date.now(),
    });
    const attr = await services.attributions.recordOrder({
      orderId: "ord_003",
      defaultCommissionPercent: 10,
    });
    await services.attributions.approve(attr!.id, ACTOR);

    const payout = await services.payouts.schedule(
      { affiliateId: aliceAffiliateId },
      ACTOR,
      "stripe-connect",
    );
    assert.ok(payout);
    assert.equal(payout?.status, "scheduled");
    assert.equal(payout?.amountCents, 800);

    const processed = await services.payouts.processPayout(payout!.id, ACTOR);
    assert.equal(processed?.status, "in_progress", "scheduled → in_progress on processPayout");
    assert.equal(processed?.method, "stripe-connect");
    assert.match(processed?.externalRef ?? "", /^tr_smoke_/);

    // Idempotent — second call short-circuits, no second Stripe call.
    const transferCallsBefore = world.inspect.stripeCalls.filter(c => c.kind === "createTransfer").length;
    const second = await services.payouts.processPayout(payout!.id, ACTOR);
    const transferCallsAfter = world.inspect.stripeCalls.filter(c => c.kind === "createTransfer").length;
    assert.equal(transferCallsAfter, transferCallsBefore, "no extra Stripe call on retry");
    assert.equal(second?.externalRef, processed?.externalRef);

    // Idempotency-key shape — `payout:<id>`.
    const lastTransfer = world.inspect.stripeCalls
      .filter(c => c.kind === "createTransfer").map(c => c.payload as { idempotencyKey: string }).at(-1);
    assert.equal(lastTransfer?.idempotencyKey, `payout:${payout!.id}`);
  });

  test("step 12: transfer.paid webhook flips in_progress → completed + bumps lifetime earnings", async () => {
    const inProgress = (await services.payouts.list({ status: "in_progress" }))[0];
    assert.ok(inProgress);
    const transferId = inProgress.externalRef!;
    assert.match(transferId, /^tr_smoke_/);

    const lifetimeBefore = (await services.affiliates.get(aliceAffiliateId))?.lifetimeEarnings ?? 0;

    const completed = await services.payouts.confirmTransferPaid(transferId, ACTOR);
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.method, "stripe-connect");
    assert.ok(completed?.completedAt);

    // Idempotent — webhook redelivery is fine.
    const second = await services.payouts.confirmTransferPaid(transferId, ACTOR);
    assert.equal(second?.status, "completed");

    // Attributions in this payout flipped to paid.
    for (const aid of inProgress.attributionIds) {
      const attr = await services.attributions.get(aid);
      assert.equal(attr?.status, "paid");
    }

    // Lifetime earnings advanced by the payout amount.
    const aff = await services.affiliates.get(aliceAffiliateId);
    assert.equal((aff?.lifetimeEarnings ?? 0), lifetimeBefore + inProgress.amountCents);
  });

  test("step 13: processPayout refuses when Stripe onboarding incomplete", async () => {
    // Add a second affiliate without Stripe.
    const charlieUserId = "user_charlie";
    // Profile patch — register Charlie in the world.
    const profile = { id: charlieUserId, email: "charlie@smoke.test", name: "Charlie", agencyId: AGENCY_ID, clientId: CLIENT_ID };
    (world.user as { getUser: (id: string) => unknown }).getUser =
      (id: string) => (id === ALICE
        ? { id: ALICE, email: "alice@smoke-aff.test", name: "Alice", agencyId: AGENCY_ID, clientId: CLIENT_ID }
        : id === charlieUserId ? profile : null);

    const charlie = await services.affiliates.enroll({
      endCustomerUserId: charlieUserId,
      displayName: "Charlie",
      payoutEmail: "charlie-payouts@smoke.test",
    }, ACTOR);
    await services.affiliates.update(charlie.id, { status: "active" }, ACTOR);

    // Approved attribution for Charlie.
    world.inspect.orders.set("ord_charlie_1", {
      id: "ord_charlie_1", agencyId: AGENCY_ID, clientId: CLIENT_ID,
      amountTotal: 1000, currency: "usd", subtotal: 1000,
      referralCodeId: codeId,    // doesn't matter for this test — point is we have an approved attr
      endCustomerUserId: BOB_BUYER,
      createdAt: Date.now(),
    });
    // Manually create an approved attribution by force — simplest path.
    const charlieCode = await services.codes.create({ affiliateId: charlie.id, code: "CHARLIE10" }, ACTOR);
    world.inspect.orders.set("ord_charlie_2", {
      id: "ord_charlie_2", agencyId: AGENCY_ID, clientId: CLIENT_ID,
      amountTotal: 1000, currency: "usd", subtotal: 1000,
      referralCodeId: charlieCode.id,
      endCustomerUserId: BOB_BUYER,
      createdAt: Date.now(),
    });
    const cAttr = await services.attributions.recordOrder({
      orderId: "ord_charlie_2", defaultCommissionPercent: 10,
    });
    await services.attributions.approve(cAttr!.id, ACTOR);

    const payout = await services.payouts.schedule(
      { affiliateId: charlie.id }, ACTOR, "stripe-connect",
    );
    assert.ok(payout);

    await assert.rejects(
      services.payouts.processPayout(payout!.id, ACTOR),
      /no Stripe Connect account|onboarding|complete/i,
      "processPayout rejected when onboardingStatus absent",
    );
  });
});
