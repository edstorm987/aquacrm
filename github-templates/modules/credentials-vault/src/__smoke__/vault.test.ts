// Credentials vault smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";
import {
  decrypt,
  encrypt,
  generateKey,
  RATE_LIMIT_REVEALS,
  VaultAccessError,
  VaultRateLimitError,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const ALICE: UserId = "user_alice";
const BOB: UserId = "user_bob";
const CAROL: UserId = "user_carol";

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
    listActivity(filter) { return activityLog.filter(e => e.agencyId === filter.agencyId); },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  return { storage, activity, events: eventBus, inspect: { activityLog, events } };
}

const KEY = generateKey();

interface ContainerOpts {
  isAdmin?: (actor: UserId) => boolean;
  clientId?: string;
}

function container(world: World, opts: ContainerOpts = {}) {
  return containerWithDeps({
    agencyId: AGENCY,
    clientId: opts.clientId,
    storage: world.storage,
    activity: world.activity,
    events: world.events,
    crypto: KEY,
    isAdmin: opts.isAdmin ?? (() => true),
  });
}

const T0 = Date.UTC(2026, 4, 7, 12, 0, 0);

describe("@aqua/plugin-credentials-vault smoke", () => {
  test("1. encryption round-trip — encrypt → decrypt yields the same plaintext; tampering throws", () => {
    setClock(() => T0);
    const blob = encrypt("hunter2", KEY);
    assert.ok(!blob.includes("hunter2"));
    assert.equal(decrypt(blob, KEY), "hunter2");
    // Flip a byte in the ciphertext segment → AES-GCM rejects.
    const parts = blob.split(":");
    const ct = Buffer.from(parts[3] ?? "", "base64");
    ct[0] = (ct[0] ?? 0) ^ 0x01;
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${ct.toString("base64")}`;
    assert.throws(() => decrypt(tampered, KEY));
    resetClock();
  });

  test("2. create stores ciphertext (not plaintext) and emits credential.created activity + event", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const cred = await c.vault.create(ALICE, {
      label: "Felicia's Stripe",
      type: "api-key",
      password: "sk_test_1234",
      sharedWith: [ALICE, BOB],
    });
    assert.equal(cred.hasSecret, true);
    assert.equal(cred.sharedWith.length, 2);

    // Inspect raw storage — must NOT contain plaintext.
    const keys = await world.storage.list("vault/by-id/");
    assert.equal(keys.length, 1);
    const raw = await world.storage.get<{ password?: string }>(keys[0]!);
    assert.ok(raw?.password);
    assert.ok(!raw!.password!.includes("sk_test_1234"));
    assert.match(raw!.password!, /^v1:/);

    assert.equal(world.inspect.activityLog.length, 1);
    assert.equal(world.inspect.activityLog[0]?.action, "credential.created");
    assert.ok(world.inspect.events.some(e => e.name === "credentials.credential.created"));
    resetClock();
  });

  test("3. viewPassword decrypts, logs credential.viewed activity, emits event", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const cred = await c.vault.create(ALICE, { label: "x", type: "login", password: "p@ss" });
    const viewed = await c.vault.viewPassword(ALICE, cred.id);
    assert.equal(viewed.password, "p@ss");
    const viewActivity = world.inspect.activityLog.filter(e => e.action === "credential.viewed");
    assert.equal(viewActivity.length, 1);
    assert.equal(viewActivity[0]?.actorUserId, ALICE);
    assert.ok(world.inspect.events.some(e => e.name === "credentials.credential.viewed"));
    resetClock();
  });

  test("4. sharedWith ACL — non-admin actors not in sharedWith cannot list/get/view", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const adminC = container(world, { isAdmin: () => true });
    const cred = await adminC.vault.create(ALICE, {
      label: "private",
      type: "login",
      password: "secret",
      sharedWith: [ALICE], // BOB is excluded
    });

    const bobC = container(world, { isAdmin: () => false });
    const list = await bobC.vault.list(BOB);
    assert.equal(list.length, 0, "bob should not see the credential in list");
    await assert.rejects(
      () => bobC.vault.get(BOB, cred.id),
      (err: unknown) => err instanceof VaultAccessError,
      "bob get throws VaultAccessError when not in sharedWith",
    );
    await assert.rejects(
      () => bobC.vault.viewPassword(BOB, cred.id),
      (err: unknown) => err instanceof VaultAccessError,
    );
    resetClock();
  });

  test("5. sharedWith ACL — actor in sharedWith CAN view as non-admin", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const adminC = container(world, { isAdmin: () => true });
    const cred = await adminC.vault.create(ALICE, {
      label: "shared-with-bob",
      type: "login",
      password: "ok",
      sharedWith: [ALICE, BOB],
    });
    const bobC = container(world, { isAdmin: () => false });
    const viewed = await bobC.vault.viewPassword(BOB, cred.id);
    assert.equal(viewed.password, "ok");
    resetClock();
  });

  test("6. rate limit — RATE_LIMIT_REVEALS reveals succeed; the next throws VaultRateLimitError + emits rate_limited event", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const cred = await c.vault.create(ALICE, { label: "rl", type: "login", password: "x" });
    for (let i = 0; i < RATE_LIMIT_REVEALS; i++) {
      t += 100;
      await c.vault.viewPassword(ALICE, cred.id);
    }
    t += 100;
    await assert.rejects(
      () => c.vault.viewPassword(ALICE, cred.id),
      (err: unknown) => {
        if (!(err instanceof VaultRateLimitError)) return false;
        return err.retryAfterMs > 0;
      },
    );
    assert.ok(world.inspect.events.some(e => e.name === "credentials.credential.rate_limited"));
    resetClock();
  });

  test("7. rate limit window slides — after RATE_WINDOW_MS, reveals work again", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const cred = await c.vault.create(ALICE, { label: "rl2", type: "login", password: "x" });
    for (let i = 0; i < RATE_LIMIT_REVEALS; i++) {
      t += 100;
      await c.vault.viewPassword(ALICE, cred.id);
    }
    // Advance past the window.
    t += 60_001;
    const viewed = await c.vault.viewPassword(ALICE, cred.id);
    assert.equal(viewed.password, "x");
    resetClock();
  });

  test("8. update with new password rotates lastRotated; empty string clears the secret", async () => {
    let t = T0;
    setClock(() => t);
    const world = buildWorld();
    const c = container(world);
    const cred = await c.vault.create(ALICE, { label: "rot", type: "login", password: "old" });
    const firstRotated = (await c.vault.get(ALICE, cred.id))!.lastRotated;
    assert.ok(firstRotated);
    t += 1000;
    const updated = await c.vault.update(ALICE, cred.id, { password: "new" });
    assert.ok(updated.lastRotated! > firstRotated!);
    assert.equal(updated.hasSecret, true);
    const cleared = await c.vault.update(ALICE, cred.id, { password: "" });
    assert.equal(cleared.hasSecret, false);
    resetClock();
  });

  test("9. archive flips archived flag; archived rows hidden by default, surfaced via includeArchived", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const cred = await c.vault.create(ALICE, { label: "doomed", type: "login" });
    await c.vault.archive(ALICE, cred.id);
    const live = await c.vault.list(ALICE);
    assert.equal(live.length, 0);
    const all = await c.vault.list(ALICE, { includeArchived: true });
    assert.equal(all.length, 1);
    assert.equal(all[0]?.archived, true);
    assert.ok(world.inspect.activityLog.some(e => e.action === "credential.archived"));
    resetClock();
  });

  test("10. client-scoped container hides agency-wide and other-client credentials", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const agencyC = container(world); // agency-scoped
    await agencyC.vault.create(ALICE, { label: "agency-wide", type: "note" });
    await agencyC.vault.create(ALICE, { label: "for-c1", type: "login", clientId: "c1" });
    await agencyC.vault.create(ALICE, { label: "for-c2", type: "login", clientId: "c2" });

    const c1View = container(world, { clientId: "c1" });
    const labels = (await c1View.vault.list(ALICE)).map(c => c.label);
    assert.deepEqual(labels.sort(), ["for-c1"]);
    resetClock();
  });
});

resetClock();
