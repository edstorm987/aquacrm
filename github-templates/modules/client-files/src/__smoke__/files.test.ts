// Client-files smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "../server/ports";
import {
  containerWithDeps,
  FilePayloadTooLargeError,
  INLINE_MAX_BYTES,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT: ClientId = "client_felicia";
const ALICE: UserId = "user_alice";  // agency
const FELICIA: UserId = "user_felicia"; // client-owner
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

function container(world: World) {
  return containerWithDeps({
    agencyId: AGENCY, clientId: CLIENT,
    storage: world.storage, activity: world.activity, events: world.events,
  });
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

const AGENCY_ACTOR = { userId: ALICE, isAgency: true } as const;
const CLIENT_ACTOR = { userId: FELICIA, isAgency: false } as const;

describe("@aqua/plugin-client-files smoke", () => {
  test("1. inline upload — body persists base64; sizeBytes computed; emits client-files.file.uploaded", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const body = b64("hello world"); // 11 bytes
    const f = await c.files.upload(ALICE, {
      category: "deliverables", name: "greeting.txt", mimeType: "text/plain", body,
    });
    assert.equal(f.storage, "inline");
    assert.equal(f.sizeBytes, 11);
    const got = await c.files.getWithBody(AGENCY_ACTOR, f.id);
    assert.equal(got?.body, body);
    assert.ok(world.inspect.events.some(e => e.name === "client-files.file.uploaded"));
    resetClock();
  });

  test("2. external upload — storageRef + sizeBytes preserved; getWithBody returns externalRef not body", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "brand-assets", name: "logo.svg", mimeType: "image/svg+xml",
      external: { storageRef: "s3://bucket/path/logo.svg", sizeBytes: 4_500_000 },
    });
    assert.equal(f.storage, "external");
    assert.equal(f.storageRef, "s3://bucket/path/logo.svg");
    assert.equal(f.sizeBytes, 4_500_000);
    const got = await c.files.getWithBody(AGENCY_ACTOR, f.id);
    assert.equal(got?.body, undefined);
    assert.equal(got?.externalRef, "s3://bucket/path/logo.svg");
    resetClock();
  });

  test("3. inline upload over INLINE_MAX_BYTES throws FilePayloadTooLargeError", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    // Generate a base64 payload large enough to exceed the cap.
    const oversize = "A".repeat(INLINE_MAX_BYTES + 100);
    const body = Buffer.from(oversize, "utf8").toString("base64");
    await assert.rejects(
      () => c.files.upload(ALICE, {
        category: "misc", name: "big.bin", mimeType: "application/octet-stream", body,
      }),
      (err: unknown) => err instanceof FilePayloadTooLargeError && err.sizeBytes > INLINE_MAX_BYTES,
    );
    resetClock();
  });

  test("4. visibleToClient ACL — agency sees all; client only sees rows where visibleToClient=true", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const priv = await c.files.upload(ALICE, {
      category: "brief-strategy", name: "internal.txt", mimeType: "text/plain", body: b64("priv"),
    });
    const shared = await c.files.upload(ALICE, {
      category: "deliverables", name: "for-client.txt", mimeType: "text/plain", body: b64("share"),
      visibleToClient: true,
    });
    void priv; void shared;
    const agencyView = await c.files.list(AGENCY_ACTOR);
    assert.equal(agencyView.length, 2);
    const clientView = await c.files.list(CLIENT_ACTOR);
    assert.deepEqual(clientView.map(f => f.name), ["for-client.txt"]);
    resetClock();
  });

  test("5. setVisibleToClient flips the ACL flag; subsequent list reflects the change", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "misc", name: "x.txt", mimeType: "text/plain", body: b64("x"),
    });
    let view = await c.files.list(CLIENT_ACTOR);
    assert.equal(view.length, 0);
    await c.files.setVisibleToClient(ALICE, f.id, true);
    view = await c.files.list(CLIENT_ACTOR);
    assert.equal(view.length, 1);
    resetClock();
  });

  test("6. setCategory — moves file between categories; rejects invalid", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "misc", name: "x.txt", mimeType: "text/plain", body: b64("x"),
    });
    const moved = await c.files.setCategory(ALICE, f.id, "invoices");
    assert.equal(moved.category, "invoices");
    await assert.rejects(() => c.files.setCategory(ALICE, f.id, "bogus" as never));
    resetClock();
  });

  test("7. delete — removes metadata + body + share-token reverse index; emits deleted", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "misc", name: "x.txt", mimeType: "text/plain", body: b64("x"),
    });
    const { token } = await c.files.setShareLink(ALICE, f.id);
    await c.files.delete(ALICE, f.id);
    assert.equal(await c.files.get(AGENCY_ACTOR, f.id), null);
    // Body key should be gone (best-effort — verified via list of stored keys).
    const remaining = await world.storage.list("file-body/");
    assert.equal(remaining.length, 0);
    // Share token resolves to null.
    assert.equal(await c.files.resolveByShareToken(token), null);
    assert.ok(world.inspect.events.some(e => e.name === "client-files.file.deleted"));
    resetClock();
  });

  test("8. share-link issue + resolve — token round-trips; rotation invalidates the previous token", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "misc", name: "x.txt", mimeType: "text/plain", body: b64("hello"),
    });
    const r1 = await c.files.setShareLink(ALICE, f.id);
    const got1 = await c.files.resolveByShareToken(r1.token);
    assert.ok(got1);
    assert.equal(got1?.id, f.id);

    // Rotate — old token must NOT resolve.
    const r2 = await c.files.setShareLink(ALICE, f.id);
    assert.notEqual(r1.token, r2.token);
    assert.equal(await c.files.resolveByShareToken(r1.token), null);
    const got2 = await c.files.resolveByShareToken(r2.token);
    assert.ok(got2);
    resetClock();
  });

  test("9. revokeShareLink — token stops resolving; emits revoked event", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "misc", name: "x.txt", mimeType: "text/plain", body: b64("hello"),
    });
    const { token } = await c.files.setShareLink(ALICE, f.id);
    await c.files.revokeShareLink(ALICE, f.id);
    assert.equal(await c.files.resolveByShareToken(token), null);
    assert.ok(world.inspect.events.some(e => e.name === "client-files.file.share_link_revoked"));
    resetClock();
  });

  test("10. category filter narrows; query filter case-insensitively matches name", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.files.upload(ALICE, { category: "brand-assets", name: "Logo.svg", mimeType: "image/svg+xml", body: b64("a") });
    await c.files.upload(ALICE, { category: "deliverables", name: "draft.pdf", mimeType: "application/pdf", body: b64("b") });
    await c.files.upload(ALICE, { category: "brand-assets", name: "wordmark.svg", mimeType: "image/svg+xml", body: b64("c") });
    const brand = await c.files.list(AGENCY_ACTOR, { category: "brand-assets" });
    assert.equal(brand.length, 2);
    const search = await c.files.list(AGENCY_ACTOR, { query: "LOGO" });
    assert.deepEqual(search.map(f => f.name), ["Logo.svg"]);
    resetClock();
  });

  test("11. categoryCounts — count + totalBytes sum match list", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await c.files.upload(ALICE, { category: "invoices", name: "a", mimeType: "text/plain", body: b64("AAAA") });
    await c.files.upload(ALICE, { category: "invoices", name: "b", mimeType: "text/plain", body: b64("BB") });
    await c.files.upload(ALICE, { category: "misc",     name: "c", mimeType: "text/plain", body: b64("C") });
    const counts = await c.files.categoryCounts(AGENCY_ACTOR);
    const inv = counts.find(r => r.category === "invoices");
    assert.equal(inv?.count, 2);
    assert.equal(inv?.totalBytes, 4 + 2);
    const mis = counts.find(r => r.category === "misc");
    assert.equal(mis?.count, 1);
    const empty = counts.find(r => r.category === "deliverables");
    assert.equal(empty?.count, 0);
    assert.equal(empty?.totalBytes, 0);
    resetClock();
  });

  test("12. activity — uploaded/deleted/share_link_issued log under category 'settings' with action prefix client-files.*", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const f = await c.files.upload(ALICE, {
      category: "misc", name: "x.txt", mimeType: "text/plain", body: b64("x"),
    });
    await c.files.setShareLink(ALICE, f.id);
    await c.files.delete(ALICE, f.id);
    const actions = world.inspect.activityLog.map(e => e.action);
    assert.ok(actions.includes("client-files.file.uploaded"));
    assert.ok(actions.includes("client-files.file.share_link_issued"));
    assert.ok(actions.includes("client-files.file.deleted"));
    assert.ok(world.inspect.activityLog.every(e => e.category === "settings"));
    resetClock();
  });
});

resetClock();
