// Client-CRM plugin smoke. node:test via tsx --test.

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
  MembershipBenefitsPort,
  MembershipSnapshot,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import { setClock, resetClock } from "../lib/time";

const AGENCY_ID: AgencyId = "agency_crm_smoke";
const CLIENT_ID: ClientId = "client_crm_smoke";
const ACTOR: UserId = "user_admin";
const USER_ALICE: UserId = "user_alice";        // existing User, signed up
const USER_BOB: UserId = "user_bob";            // imported manually first, signs up later

interface World {
  storage: PluginStorage;
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  membershipBenefits?: MembershipBenefitsPort;
  ecommerceOrders?: EcommerceOrdersPort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    ecommerceCalls: number;
  };
}

function buildWorld(opts?: {
  membershipPlanFor?: Record<UserId, MembershipSnapshot>;
  ecommerceOrdersFor?: Record<UserId, EcommerceOrderProjection[]>;
  ecommerceOrdersByEmail?: Record<string, EcommerceOrderProjection[]>;
}): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  let ecommerceCalls = 0;

  const client: Client = {
    id: CLIENT_ID, agencyId: AGENCY_ID, name: "Smoke CRM Co", slug: "smoke-crm",
    brand: { primaryColor: "#000" }, stage: "live", status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const profiles: Record<string, EndCustomerProfile> = {
    [USER_ALICE]: { id: USER_ALICE, email: "alice@smoke-crm.test", name: "Alice", agencyId: AGENCY_ID, clientId: CLIENT_ID },
    [USER_BOB]:   { id: USER_BOB,   email: "bob@smoke-crm.test",   name: "Bob",   agencyId: AGENCY_ID, clientId: CLIENT_ID },
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
    getUserByEmail: ({ email }) => Object.values(profiles).find(p => p.email.toLowerCase() === email.toLowerCase()) ?? null,
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
  const membershipBenefits: MembershipBenefitsPort | undefined = opts?.membershipPlanFor
    ? {
        async getMembershipForUser({ userId }) {
          return opts!.membershipPlanFor![userId] ?? null;
        },
      }
    : undefined;
  const ecommerceOrders: EcommerceOrdersPort | undefined = (opts?.ecommerceOrdersFor || opts?.ecommerceOrdersByEmail)
    ? {
        async listForUser({ userId, email }) {
          ecommerceCalls += 1;
          const byUser = userId ? opts!.ecommerceOrdersFor?.[userId] ?? [] : [];
          const byEmail = email ? opts!.ecommerceOrdersByEmail?.[email.toLowerCase()] ?? [] : [];
          return [...byUser, ...byEmail];
        },
      }
    : undefined;

  return {
    storage, tenant, user, activity, events: eventBus, pluginInstalls,
    membershipBenefits, ecommerceOrders,
    inspect: { activityLog, events, get ecommerceCalls() { return ecommerceCalls; } } as World["inspect"],
  };
}

describe("client-crm smoke", () => {
  let world: World;
  let services: ReturnType<typeof containerWithDeps>;
  let aliceContactId: string;
  let bobContactId: string;
  let manualEmailContactId: string;

  before(() => {
    setClock(() => 1730000000000);   // fixed clock for stable segment time-windows
    world = buildWorld({
      membershipPlanFor: {
        [USER_ALICE]: { planId: "plan_silver", planName: "Silver", status: "active" },
      },
      ecommerceOrdersFor: {
        [USER_ALICE]: [
          { orderId: "ord_1", endCustomerUserId: USER_ALICE, customerEmail: "alice@smoke-crm.test", amountTotal: 5000, currency: "usd", createdAt: 1729900000000 },
        ],
      },
    });
    services = containerWithDeps({
      agencyId: AGENCY_ID, clientId: CLIENT_ID,
      storage: world.storage,
      tenant: world.tenant, user: world.user,
      activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls,
      membershipBenefits: world.membershipBenefits,
      ecommerceOrders: world.ecommerceOrders,
    });
  });

  test("step 0: seed default segments (idempotent)", async () => {
    const first = await services.segments.seedDefaults(ACTOR);
    assert.equal(first.seeded, 4, "All / New / Engaged / Dormant seeded");
    const second = await services.segments.seedDefaults(ACTOR);
    assert.equal(second.seeded, 0);
    assert.equal(second.existed, 4);

    const list = await services.segments.list();
    assert.equal(list.length, 4);
    assert.deepEqual(list.map(s => s.name), ["All", "New", "Engaged", "Dormant"]);
    assert.ok(list.every(s => s.isDefault));

    // Default segments can't be deleted.
    const allSeg = list[0]!;
    await assert.rejects(
      services.segments.delete(allSeg.id, ACTOR),
      /Cannot delete default/i,
    );
  });

  test("step 1: contact create + email uniqueness scoped to (agencyId, clientId)", async () => {
    const aliceContact = await services.contacts.create({
      email: "alice@smoke-crm.test",
      name: "Alice",
      endCustomerUserId: USER_ALICE,
      source: "signup",
      tags: ["vip"],
    }, ACTOR);
    aliceContactId = aliceContact.id;
    assert.equal(aliceContact.status, "active");
    assert.equal(aliceContact.endCustomerUserId, USER_ALICE);

    // Duplicate email rejected (case-insensitive).
    await assert.rejects(
      services.contacts.create({ email: "ALICE@smoke-crm.test", name: "x" }, ACTOR),
      /already exists/i,
    );

    // Different email is fine.
    const manual = await services.contacts.create({
      email: "bob@smoke-crm.test",            // matches Bob's profile, but no userId yet
      name: "Bob (imported)",
      source: "import",
    }, ACTOR);
    manualEmailContactId = manual.id;
    assert.equal(manual.endCustomerUserId, undefined);
  });

  test("step 2: mergeFromUser reconciles a manual contact with a foundation User by email", async () => {
    // Bob signs up later. Their User profile has email matching the
    // manual contact created in step 1. mergeFromUser should attach
    // userId to the existing contact, NOT create a duplicate.
    const merged = await services.contacts.mergeFromUser(USER_BOB, ACTOR);
    assert.ok(merged);
    bobContactId = merged!.id;
    assert.equal(merged?.id, manualEmailContactId, "merged into existing contact");
    assert.equal(merged?.endCustomerUserId, USER_BOB);

    // Re-running mergeFromUser is a no-op.
    const second = await services.contacts.mergeFromUser(USER_BOB, ACTOR);
    assert.equal(second?.id, bobContactId);
  });

  test("step 3: bulk import — new + duplicate email patches", async () => {
    const result = await services.contacts.importBulk([
      { email: "carol@smoke-crm.test", name: "Carol", tags: ["import-cohort-1"] },
      { email: "alice@smoke-crm.test", name: "Alice (Updated)", tags: ["vip-2"] }, // existing
      { email: "", name: "no email" }, // skipped
    ], ACTOR);
    assert.equal(result.total, 3);
    assert.equal(result.created, 1, "Carol new");
    assert.equal(result.updated, 1, "Alice patched");
    assert.equal(result.skipped, 1);
    assert.equal(result.contactIds.length, 2);

    // Existing tags merged (deduped).
    const alice = await services.contacts.get(aliceContactId);
    assert.ok(alice?.tags.includes("vip"));
    assert.ok(alice?.tags.includes("vip-2"));
  });

  test("step 4: segment evaluate / listMembers correctness", async () => {
    const all = (await services.segments.list()).find(s => s.name === "All")!;
    const newSeg = (await services.segments.list()).find(s => s.name === "New")!;
    const engaged = (await services.segments.list()).find(s => s.name === "Engaged")!;

    // "All" should match every active contact.
    const allMembers = await services.segments.listMembers(all.id);
    assert.equal(allMembers.length, 3, "Alice, Bob, Carol all match All");

    // "New" — firstSeenAt is `now()` at create time (fixed clock); rule
    // is "after now-7d", which evaluates to now-7d at evaluate time.
    // Since we created and evaluate at same fixed clock, all 3 contacts'
    // firstSeenAt > now-7d → all 3 match.
    const newMembers = await services.segments.listMembers(newSeg.id);
    assert.equal(newMembers.length, 3);

    // Custom segment: tag === "vip-2" → only Alice.
    const vipSeg = await services.segments.create({
      name: "VIP-2",
      rules: [{ field: "tag", op: "eq", value: "vip-2" }],
    }, ACTOR);
    const vipMembers = await services.segments.listMembers(vipSeg.id);
    assert.equal(vipMembers.length, 1);
    assert.equal(vipMembers[0]?.id, aliceContactId);

    // Membership-based segment: planId === "plan_silver" → only Alice
    // (the membership port mock returns Silver for Alice only).
    const silverSeg = await services.segments.create({
      name: "Silver members",
      rules: [{ field: "membershipPlanId", op: "eq", value: "plan_silver" }],
    }, ACTOR);
    const silverMembers = await services.segments.listMembers(silverSeg.id);
    assert.equal(silverMembers.length, 1);
    assert.equal(silverMembers[0]?.id, aliceContactId);

    // Engaged — none of the contacts have lastSeenAt yet (no activity
    // recorded). Should be empty.
    const engagedMembers = await services.segments.listMembers(engaged.id);
    assert.equal(engagedMembers.length, 0);
  });

  test("step 5: activity timeline append + chronological ordering", async () => {
    // Add a note — kind: "note", does NOT bump lastSeenAt.
    const note = await services.activity.addNote(aliceContactId, "Reached out via DM", ACTOR);
    assert.equal(note.kind, "note");

    // Ingest an order.created event for Alice.
    const occurredAt = 1730000000000 - 1000;
    const orderActivity = await services.activity.ingestOrderCreated({
      orderId: "ord_42",
      endCustomerUserId: USER_ALICE,
      amountTotal: 10000,
      currency: "usd",
      occurredAt,
    }, ACTOR);
    assert.ok(orderActivity);
    assert.equal(orderActivity?.kind, "order");

    // Idempotent: same orderId → null (already ingested).
    const replay = await services.activity.ingestOrderCreated({
      orderId: "ord_42",
      endCustomerUserId: USER_ALICE,
      amountTotal: 10000,
      currency: "usd",
      occurredAt,
    }, ACTOR);
    assert.equal(replay, null);

    // listForContact returns newest-first.
    const log = await services.activity.listForContact(aliceContactId);
    assert.equal(log.length, 2);
    assert.ok(log[0]!.occurredAt >= log[1]!.occurredAt);

    // Engagement-kind ingest bumped Alice's lastSeenAt.
    const alice = await services.contacts.get(aliceContactId);
    assert.equal(alice?.lastSeenAt, occurredAt);

    // Now Engaged segment matches Alice (lastSeenAt > now-30d).
    const engaged = (await services.segments.list()).find(s => s.name === "Engaged")!;
    const engagedMembers = await services.segments.listMembers(engaged.id);
    assert.ok(engagedMembers.some(c => c.id === aliceContactId));
  });

  test("step 6: subscription + affiliate ingest with auto-create", async () => {
    // Order ingest for an unknown user, only email — should auto-create
    // a Contact with source "order".
    const newOrder = await services.activity.ingestOrderCreated({
      orderId: "ord_99",
      customerEmail: "fresh@smoke-crm.test",
      amountTotal: 4500,
      currency: "usd",
    }, ACTOR);
    assert.ok(newOrder);
    const fresh = await services.contacts.getByEmail("fresh@smoke-crm.test");
    assert.ok(fresh);
    assert.equal(fresh?.source, "order");

    // Subscription started for Bob → activity row.
    const sub = await services.activity.ingestSubscription({
      endCustomerUserId: USER_BOB,
      planId: "plan_gold",
      status: "started",
    }, ACTOR);
    assert.ok(sub);
    assert.equal(sub?.kind, "subscription_started");

    // Idempotent on (planId, status).
    const replay = await services.activity.ingestSubscription({
      endCustomerUserId: USER_BOB,
      planId: "plan_gold",
      status: "started",
    }, ACTOR);
    assert.equal(replay, null);

    // Affiliate attribution.
    const aff = await services.activity.ingestAffiliateAttribution({
      affiliateUserId: USER_ALICE,
      orderId: "ord_42_referred",
      amountCents: 500,
    }, ACTOR);
    assert.ok(aff);
    assert.equal(aff?.kind, "affiliate_referral");
  });

  test("step 7: ecommerce backfill via optional port", async () => {
    const recorded = await services.activity.backfillFromEcommerce(aliceContactId, ACTOR);
    // Alice's mock has 1 order → 1 backfilled.
    assert.equal(recorded, 1);
    assert.ok(world.inspect.ecommerceCalls > 0, "ecommerce port called");
  });

  test("step 8: optional ports absent — graceful null handling", async () => {
    // Build a parallel container without membership / ecommerce ports.
    const w = buildWorld();
    const s = containerWithDeps({
      agencyId: AGENCY_ID, clientId: CLIENT_ID,
      storage: w.storage,
      tenant: w.tenant, user: w.user,
      activity: w.activity, events: w.events,
      pluginInstalls: w.pluginInstalls,
      // membershipBenefits / ecommerceOrders omitted
    });
    await s.segments.seedDefaults(ACTOR);
    await s.contacts.create({
      email: "lonely@smoke-crm.test",
      endCustomerUserId: USER_ALICE,
      source: "signup",
    }, ACTOR);

    // membership-rule segment evaluates to false-no-match (snapshot null).
    const silverOnly = await s.segments.create({
      name: "Silver Only",
      rules: [{ field: "membershipPlanId", op: "eq", value: "plan_silver" }],
    }, ACTOR);
    const members = await s.segments.listMembers(silverOnly.id);
    assert.equal(members.length, 0);

    // backfill returns 0 when ecommerce port absent.
    const contacts = await s.contacts.list();
    const recorded = await s.activity.backfillFromEcommerce(contacts[0]!.id, ACTOR);
    assert.equal(recorded, 0);
  });

  test("step 9: side-effects — activity log + event bus", async () => {
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, limit: 200 });
    const actions = log.map(e => e.action);
    assert.ok(actions.includes("crm.contact.created"));
    assert.ok(actions.includes("crm.contact.updated"));
    assert.ok(actions.includes("crm.contact.merged"));
    assert.ok(actions.includes("crm.contact.imported"));
    assert.ok(actions.includes("crm.segment.created"));
    assert.ok(actions.includes("crm.activity.recorded"));

    const eventNames = world.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("crm.contact.created"));
    assert.ok(eventNames.includes("crm.contact.merged"));
    assert.ok(eventNames.includes("crm.contact.imported"));
    assert.ok(eventNames.includes("crm.segment.created"));
    assert.ok(eventNames.includes("crm.activity.recorded"));

    resetClock();
  });
});
