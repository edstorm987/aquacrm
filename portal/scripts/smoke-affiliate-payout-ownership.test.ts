import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { buildAffiliatesContainer } from "../src/built-ins/modules/affiliates/src/server/index";
import { isStripeConnectAvailable } from "../src/built-ins/modules/affiliates/src/server/foundationAdapter";
// Importing the runtime adapter REGISTERS the affiliates foundation as a side
// effect — which is the point: these tests exercise the registration that
// production boots with, not a hand-assembled one.
import {
  affiliatesStripeConnectFor,
  affiliatesStripeConnectKeysFor,
} from "../src/built-ins/runtime/foundation-adapters/affiliatesFoundation";
import {
  makeAffiliatesStripeConnectPort,
  type StripeConnectClientLike,
} from "../src/built-ins/runtime/foundation-adapters/_affiliatesStripeConnectAdapter";
import { MyAffiliatePanel } from "../src/built-ins/modules/affiliates/src/components/MyAffiliatePanel";
import { processViaStripeBlockReason } from "../src/built-ins/modules/affiliates/src/components/PayoutsList";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { writePluginSettings } from "../src/lib/server/plugins/pluginSettingsSurface";
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

// ─── Stripe Connect: a real driver, and honest availability ───────────────
//
// todo:506 / issues #45. `affiliatesFoundation.ts` registered six ports and no
// `stripeConnect` at all, so `containerFor(...)` never built an
// OnboardingService: /me/stripe/onboard, /me/stripe/refresh, the webhook and
// processPayout could ONLY answer 422 — while the customer panel offered "Set
// up payouts via Stripe" unconditionally and the admin card offered "Process
// via Stripe" to any affiliate whose own onboarding looked complete. Three
// contracts below: availability is derived from the client's real keys, the
// driver maps onto the SDK, and the mounted controls gate on the capability.

/**
 * Rendered text of a React tree, without react-dom/server (which does not
 * resolve under `--conditions react-server`), plus the names of every function
 * component reached.
 *
 * A subtree that needs a client runtime (anything calling `useState`) yields no
 * text rather than failing the walk — but its component name is still recorded,
 * which is how the hook-using branch is asserted at all.
 */
async function walk(node: unknown, components: string[] = []): Promise<{
  text: string;
  components: string[];
}> {
  const text = await textOf(node, components);
  return { text, components };
}

async function textOf(node: unknown, components: string[]): Promise<string> {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    return (await Promise.all(node.map(child => textOf(child, components)))).join(" ");
  }
  if (typeof node === "object" && typeof (node as { then?: unknown }).then === "function") {
    return textOf(await (node as Promise<unknown>), components);
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (!("type" in element)) return "";
  if (typeof element.type === "function") {
    components.push((element.type as { name?: string }).name ?? "anonymous");
    try {
      return await textOf((element.type as (props: unknown) => unknown)(element.props ?? {}), components);
    } catch {
      return "";
    }
  }
  return textOf(element.props?.children, components);
}

test("affiliate Stripe Connect is unavailable until the client's ecommerce install really has a key", async () => {
  await ensureHydrated();
  const agency = createAgency({ name: "Affiliate Connect Co", slug: `aff-connect-${Date.now()}` });
  const client = createClient(agency.id, { name: "Selling Client", slug: `selling-${Date.now()}` });
  const scope = { agencyId: agency.id, clientId: client.id };

  // Nothing installed at all — the state the whole item was filed about.
  assert.equal(affiliatesStripeConnectKeysFor(scope), null);
  assert.equal(affiliatesStripeConnectFor(scope), null);
  assert.equal(
    isStripeConnectAvailable(scope),
    false,
    "no ecommerce install means no Connect — this must not read as available",
  );

  // ecommerce installed but never configured.
  upsertInstall({ pluginId: "ecommerce", scope, enabled: true, config: {}, features: {} });
  assert.equal(
    isStripeConnectAvailable(scope),
    false,
    "an ecommerce install with no secret key is not a configured Stripe",
  );

  // Keys saved through the real settings write path (they land in the
  // encrypted vault, never on the browser-visible install.config).
  writePluginSettings({
    pluginId: "ecommerce",
    scope,
    values: {
      stripeSecretKey: "sk_test_affiliates_0001",
      stripeWebhookSecret: "whsec_affiliates_0002",
    },
    actorUserId: "user_aff_stripe_test",
  });

  const keys = affiliatesStripeConnectKeysFor(scope);
  assert.equal(keys?.secretKey, "sk_test_affiliates_0001");
  assert.equal(keys?.webhookSecret, "whsec_affiliates_0002");
  assert.equal(
    getInstall(scope, "ecommerce")?.config.stripeSecretKey,
    undefined,
    "the secret came from the vault, not from install.config",
  );
  assert.equal(isStripeConnectAvailable(scope), true, "a configured install reports available");
  assert.ok(affiliatesStripeConnectFor(scope), "and yields a real StripeConnectPort");

  // Scope is exact: another client of the same agency is still unconfigured.
  const other = createClient(agency.id, { name: "Other Client", slug: `aff-other-${Date.now()}` });
  assert.equal(
    isStripeConnectAvailable({ agencyId: agency.id, clientId: other.id }),
    false,
    "one client's Stripe keys must not make another client's affiliate payouts look automatable",
  );
});

test("the Connect driver maps every StripeConnectPort method onto the SDK", async () => {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, ...args: unknown[]) => { calls.push({ method, args }); };
  const lastCall = (method: string) => [...calls].reverse().find(c => c.method === method);
  let constructShouldThrow = false;

  const fake: StripeConnectClientLike = {
    accounts: {
      async create(params, options) {
        record("accounts.create", params, options);
        return { id: "acct_new" };
      },
      async retrieve(id) {
        record("accounts.retrieve", id);
        return {
          id,
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
          requirements: { disabled_reason: "requirements.past_due" },
        };
      },
    },
    accountLinks: {
      async create(params, options) {
        record("accountLinks.create", params, options);
        return { url: "https://connect.stripe.test/setup/acct_new", expires_at: 1_700_000_300 };
      },
    },
    transfers: {
      async create(params, options) {
        record("transfers.create", params, options);
        return { id: "tr_new", created: 1_700_000_000 };
      },
    },
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        record("webhooks.constructEvent", rawBody, signature, secret);
        if (constructShouldThrow) throw new Error("signature mismatch");
        return { id: "evt_1", type: "account.updated" };
      },
    },
  };

  const port = makeAffiliatesStripeConnectPort(
    { secretKey: "sk_test_x", webhookSecret: "whsec_x" },
    fake,
  );

  const created = await port.createAccount({
    email: "affiliate@connect.test",
    affiliateId: "aff_1",
    agencyId: "agency_1",
    clientId: "client_1",
  });
  assert.equal(created.accountId, "acct_new");
  const accountParams = lastCall("accounts.create")?.args[0] as Record<string, unknown>;
  assert.equal(accountParams.type, "express", "affiliates onboard as Express accounts");
  assert.equal(accountParams.email, "affiliate@connect.test");
  assert.deepEqual(
    (accountParams.metadata as Record<string, string>),
    { aquaAffiliateId: "aff_1", aquaAgencyId: "agency_1", aquaClientId: "client_1" },
    "the connected account carries the scope it belongs to",
  );
  assert.equal(
    (lastCall("accounts.create")?.args[1] as { idempotencyKey?: string })?.idempotencyKey,
    "affiliate-account:client_1:aff_1",
    "a double-click must not create a second connected account",
  );

  const link = await port.createOnboardingLink({
    accountId: "acct_new",
    returnUrl: "https://portal.test/done",
    refreshUrl: "https://portal.test/again",
  });
  const linkParams = lastCall("accountLinks.create")?.args[0] as Record<string, unknown>;
  assert.equal(linkParams.type, "account_onboarding");
  assert.equal(linkParams.account, "acct_new");
  assert.equal(linkParams.return_url, "https://portal.test/done");
  assert.equal(linkParams.refresh_url, "https://portal.test/again");
  assert.equal(link.url, "https://connect.stripe.test/setup/acct_new");
  assert.equal(link.expiresAt, 1_700_000_300_000, "Stripe reports seconds; the port is milliseconds");

  const snapshot = await port.retrieveAccount("acct_new");
  assert.deepEqual(snapshot, {
    accountId: "acct_new",
    chargesEnabled: true,
    payoutsEnabled: false,
    detailsSubmitted: true,
    disabledReason: "requirements.past_due",
    onboardingStatus: "restricted",
  }, "a disabled_reason collapses to restricted, not to a payable 'complete'");

  const transfer = await port.createTransfer({
    destinationAccountId: "acct_new",
    amountCents: 1234,
    currency: "gbp",
    idempotencyKey: "payout:payout_9",
    description: "Affiliate payout payout_9",
    transferGroup: "affiliate:aff_1",
  });
  const transferParams = lastCall("transfers.create")?.args[0] as Record<string, unknown>;
  assert.equal(transferParams.amount, 1234);
  assert.equal(transferParams.currency, "gbp");
  assert.equal(transferParams.destination, "acct_new");
  assert.equal(transferParams.transfer_group, "affiliate:aff_1");
  assert.equal(
    (lastCall("transfers.create")?.args[1] as { idempotencyKey?: string })?.idempotencyKey,
    "payout:payout_9",
    "the payout-derived key is what stops a retry paying an affiliate twice",
  );
  assert.equal(transfer.transferId, "tr_new");
  assert.equal(transfer.created, 1_700_000_000_000);

  assert.equal(
    await port.verifyWebhookSignature({ rawBody: "{}", signature: "t=1,v1=good" }),
    true,
  );
  constructShouldThrow = true;
  assert.equal(
    await port.verifyWebhookSignature({ rawBody: "{}", signature: "t=1,v1=forged" }),
    false,
    "a forged signature must not be trusted anyway",
  );
  constructShouldThrow = false;
  assert.equal(
    await port.verifyWebhookSignature({ rawBody: "{}", signature: null }),
    false,
    "no signature header is not a verified webhook",
  );
  const unsecured = makeAffiliatesStripeConnectPort({ secretKey: "sk_test_x" }, fake);
  assert.equal(
    await unsecured.verifyWebhookSignature({ rawBody: "{}", signature: "t=1,v1=good" }),
    false,
    "without a signing secret nothing can be proven to have come from Stripe",
  );
});

test("the mounted payout controls gate on the install's capability, not just the affiliate", async () => {
  const onboarded: Affiliate = {
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
    stripeAccountId: "acct_ready",
    stripeOnboardingStatus: "complete",
  };

  // Admin card. A fully onboarded affiliate is still not processable when the
  // install cannot SETTLE — and the reason must name the install, not blame
  // the affiliate.
  //
  // The flag is transfer readiness, not merely "a Stripe key exists": the only
  // route from `in_progress` to `completed` is the `transfer.paid` webhook, so
  // a scope that cannot verify webhooks would move real money into a payout
  // with no control left to finish it. The copy therefore says "not ready"
  // rather than "not configured" — a key may well be configured.
  const blocked = processViaStripeBlockReason({ stripeConnectAvailable: false, affiliate: onboarded });
  assert.ok(blocked, "Process via Stripe must be blocked when the install cannot settle");
  assert.match(blocked!, /not ready for this client/i, "the reason must name the install/scope");
  assert.match(blocked!, /mark this payout paid/i, "it must say how the payout IS dealt with");
  assert.doesNotMatch(blocked!, /onboarding is/i, "the affiliate is not the reason here");

  assert.equal(
    processViaStripeBlockReason({ stripeConnectAvailable: true, affiliate: onboarded }),
    null,
    "a configured install plus a complete affiliate is processable",
  );
  assert.match(
    processViaStripeBlockReason({
      stripeConnectAvailable: true,
      affiliate: { ...onboarded, stripeOnboardingStatus: "pending" },
    }) ?? "",
    /onboarding is pending/i,
  );
  assert.match(
    processViaStripeBlockReason({ stripeConnectAvailable: true, affiliate: undefined }) ?? "",
    /affiliate not found/i,
  );

  // Customer panel. The setup CTA used to render unconditionally.
  const notYetOnboarded = {
    ...onboarded,
    stripeAccountId: undefined,
    stripeOnboardingStatus: undefined,
  };
  const withConnect = await walk(MyAffiliatePanel({
    affiliate: notYetOnboarded,
    codes: [], attributions: [], payouts: [],
    apiBase: "/api/portal/affiliates",
    stripeConnectAvailable: true,
  }));
  assert.ok(
    withConnect.components.includes("StripeConnectPanel"),
    "a configured install still mounts the real setup panel",
  );
  assert.ok(!withConnect.components.includes("StripeConnectUnavailableNotice"));

  const withoutConnect = await walk(MyAffiliatePanel({
    affiliate: notYetOnboarded,
    codes: [], attributions: [], payouts: [],
    apiBase: "/api/portal/affiliates",
    stripeConnectAvailable: false,
  }));
  assert.ok(
    !withoutConnect.components.includes("StripeConnectPanel"),
    "an install with no Connect must not mount a CTA whose endpoint can only 422",
  );
  assert.match(withoutConnect.text, /does not have automated Stripe payouts/i);
  assert.match(
    withoutConnect.text,
    /affiliate@example\.test/,
    "and must say how the payout IS dealt with — off-system, to the email on file",
  );
  assert.doesNotMatch(
    withoutConnect.text,
    /Set up payouts via Stripe/i,
    "no setup button survives anywhere in the unavailable tree",
  );
});

test("the affiliates foundation registers a per-client Connect factory", async () => {
  const [registration, adapter, container] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/runtime/foundation-adapters/affiliatesFoundation.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/runtime/foundation-adapters/_affiliatesStripeConnectAdapter.ts"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/affiliates/src/server/foundationAdapter.ts"), "utf8"),
  ]);
  assert.match(registration, /stripeConnectFor\(args/, "the registration must supply the Connect factory");
  assert.match(registration, /installConfigWithSecrets/, "keys come from the encrypted vault");
  assert.match(adapter, /accountLinks/);
  assert.match(adapter, /idempotencyKey: args\.idempotencyKey/);
  assert.match(container, /export function isStripeConnectAvailable/);
});
