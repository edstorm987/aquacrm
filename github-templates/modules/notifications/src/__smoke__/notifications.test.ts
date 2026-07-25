// Notifications plugin smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  ChannelDriver,
  EmailSenderPort,
  EventBusPort,
  UserPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import { defaultDrivers } from "../server/drivers";
import { now, setClock, resetClock } from "../lib/time";
import type { ActivityShape, DispatchInput, DispatchResult } from "../lib/domain";

const AGENCY: AgencyId = "agency_aqua";
const ALICE: UserId = "user_alice";
const BOB: UserId = "user_bob";
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

interface RecordingDriver extends ChannelDriver {
  calls: DispatchInput[];
}

function recordingDriver(channel: ChannelDriver["channel"], result: Omit<DispatchResult, "channel" | "attemptedAt"> = { status: "sent" }): RecordingDriver {
  const calls: DispatchInput[] = [];
  return {
    channel,
    calls,
    dispatch(input) {
      calls.push(input);
      return { ...result, channel, attemptedAt: now() };
    },
  };
}

function activityFor(category: ActivityCategory, opts: Partial<ActivityShape> = {}): ActivityShape {
  return {
    id: opts.id ?? "evt_1",
    agencyId: AGENCY,
    clientId: opts.clientId,
    category,
    action: opts.action ?? `${category}.thing`,
    message: opts.message ?? `${category} happened`,
    ts: opts.ts ?? T0,
  };
}

function container(world: World, drivers: Record<string, ChannelDriver>) {
  return containerWithDeps({
    agencyId: AGENCY,
    storage: world.storage,
    activity: world.activity,
    events: world.events,
    drivers,
  });
}

describe("@aqua/plugin-notifications smoke", () => {
  test("1. createRule rejects an empty channels array; happy path stores + indexes a rule", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world, {});
    await assert.rejects(() => c.notifications.createRule({ userId: ALICE, channels: [] as never }));
    const rule = await c.notifications.createRule({
      userId: ALICE, channels: ["email"], eventCategories: ["finance"],
    });
    const list = await c.notifications.listRules();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, rule.id);
    resetClock();
  });

  test("2. matching rule fan-outs to channel drivers; non-matching category does not", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const slack = recordingDriver("slack");
    const email = recordingDriver("email");
    const c = container(world, { slack, email });
    await c.notifications.createRule({ userId: ALICE, channels: ["slack", "email"], eventCategories: ["finance"] });
    const matches = await c.notifications.onActivityEvent(activityFor("finance"));
    assert.equal(matches.length, 2);
    assert.equal(slack.calls.length, 1);
    assert.equal(email.calls.length, 1);

    const noMatch = await c.notifications.onActivityEvent(activityFor("kanban", { id: "evt_2" }));
    assert.equal(noMatch.length, 0);
    resetClock();
  });

  test("3. empty eventCategories matches every category (all-events rule)", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const slack = recordingDriver("slack");
    const c = container(world, { slack });
    await c.notifications.createRule({ userId: ALICE, channels: ["slack"], eventCategories: [] });
    await c.notifications.onActivityEvent(activityFor("auth"));
    await c.notifications.onActivityEvent(activityFor("ecommerce", { id: "evt_2" }));
    assert.equal(slack.calls.length, 2);
    resetClock();
  });

  test("4. clientIds filter narrows by event.clientId; agency-level events excluded when filter set", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const slack = recordingDriver("slack");
    const c = container(world, { slack });
    await c.notifications.createRule({
      userId: ALICE, channels: ["slack"], eventCategories: [], clientIds: ["c1"],
    });
    await c.notifications.onActivityEvent(activityFor("auth", { clientId: "c1" }));
    await c.notifications.onActivityEvent(activityFor("auth", { id: "evt_2", clientId: "c2" }));
    await c.notifications.onActivityEvent(activityFor("auth", { id: "evt_3" })); // no clientId
    assert.equal(slack.calls.length, 1);
    assert.equal(slack.calls[0]?.metadata?.clientId, "c1");
    resetClock();
  });

  test("5. cooldown dedup — same (userId, eventId) within window suppresses; different eventId still dispatches", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const slack = recordingDriver("slack");
    const c = container(world, { slack });
    await c.notifications.createRule({
      userId: ALICE, channels: ["slack"], eventCategories: [], cooldownSeconds: 60,
    });
    const m1 = await c.notifications.onActivityEvent(activityFor("auth", { id: "evt_a" }));
    t += 10_000;
    const m2 = await c.notifications.onActivityEvent(activityFor("auth", { id: "evt_a" }));
    t += 10_000;
    const m3 = await c.notifications.onActivityEvent(activityFor("auth", { id: "evt_b" }));
    assert.equal(m1[0]?.suppressed, false);
    assert.equal(m2[0]?.suppressed, true);
    assert.equal(m3[0]?.suppressed, false);
    assert.equal(slack.calls.length, 2);
    assert.ok(world.inspect.events.some(e => e.name === "notifications.dispatch.suppressed"));
    resetClock();
  });

  test("6. cooldown is per-user — same eventId for two users dispatches to both", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const slack = recordingDriver("slack");
    const c = container(world, { slack });
    await c.notifications.createRule({ userId: ALICE, channels: ["slack"], eventCategories: [], cooldownSeconds: 60 });
    await c.notifications.createRule({ userId: BOB, channels: ["slack"], eventCategories: [], cooldownSeconds: 60 });
    const matches = await c.notifications.onActivityEvent(activityFor("auth", { id: "shared" }));
    assert.equal(matches.length, 2);
    assert.equal(slack.calls.length, 2);
    resetClock();
  });

  test("7. disabled rule does not fire; updateRule re-enables", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const slack = recordingDriver("slack");
    const c = container(world, { slack });
    const r = await c.notifications.createRule({ userId: ALICE, channels: ["slack"], eventCategories: [], enabled: false });
    let matches = await c.notifications.onActivityEvent(activityFor("auth"));
    assert.equal(matches.length, 0);
    await c.notifications.updateRule(r.id, { enabled: true });
    matches = await c.notifications.onActivityEvent(activityFor("auth", { id: "evt_2" }));
    assert.equal(matches.length, 1);
    assert.equal(slack.calls.length, 1);
    resetClock();
  });

  test("8. graceful fallback — slack driver with NO webhookUrl returns skipped:slack_webhook_url_missing; engine reports skipped, no throw", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const drivers = defaultDrivers({ agencyId: AGENCY });
    const c = container(world, drivers);
    await c.notifications.createRule({ userId: ALICE, channels: ["slack"], eventCategories: [] });
    // No setConfig() — so webhookUrl is undefined.
    const matches = await c.notifications.onActivityEvent(activityFor("auth"));
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.result?.status, "skipped");
    assert.equal(matches[0]?.result?.reason, "slack_webhook_url_missing");
    assert.ok(world.inspect.events.some(e => e.name === "notifications.dispatch.skipped"));
    resetClock();
  });

  test("9. email driver — graceful fallback when emailSender port absent → skipped:email_sender_not_installed", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const drivers = defaultDrivers({ agencyId: AGENCY }); // no emailSender, no user
    const c = container(world, drivers);
    await c.notifications.createRule({ userId: ALICE, channels: ["email"], eventCategories: [] });
    const matches = await c.notifications.onActivityEvent(activityFor("auth"));
    assert.equal(matches[0]?.result?.reason, "email_sender_not_installed");
    resetClock();
  });

  test("10. email driver — when emailSender + user port present, sends to user.email and reports sent", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const sent: { to: string; subject: string }[] = [];
    const emailSender: EmailSenderPort = {
      send({ to, subject }) {
        sent.push({ to, subject });
        return { ok: true };
      },
    };
    const userPort: UserPort = {
      getUser(id) {
        if (id === ALICE) return { id: ALICE, email: "alice@example.com", agencyId: AGENCY };
        return null;
      },
    };
    const drivers = defaultDrivers({ agencyId: AGENCY, emailSender, user: userPort });
    const c = container(world, drivers);
    await c.notifications.createRule({ userId: ALICE, channels: ["email"], eventCategories: ["auth"] });
    const matches = await c.notifications.onActivityEvent(activityFor("auth"));
    assert.equal(matches[0]?.result?.status, "sent");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "alice@example.com");
    resetClock();
  });

  test("11. archiveRule removes from index + storage; event emitted", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world, {});
    const r = await c.notifications.createRule({ userId: ALICE, channels: ["webhook"] });
    await c.notifications.archiveRule(r.id);
    const list = await c.notifications.listRules();
    assert.equal(list.length, 0);
    assert.ok(world.inspect.events.some(e => e.name === "notifications.rule.archived"));
    resetClock();
  });

  test("12. setConfig merges patches; getConfig round-trips", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world, {});
    await c.notifications.setConfig({ slack: { webhookUrl: "https://hooks.slack.example/x" } });
    await c.notifications.setConfig({ webhook: { url: "https://example.com/h" } });
    const cfg = await c.notifications.getConfig();
    assert.equal(cfg.slack?.webhookUrl, "https://hooks.slack.example/x");
    assert.equal(cfg.webhook?.url, "https://example.com/h");
    resetClock();
  });
});

resetClock();
