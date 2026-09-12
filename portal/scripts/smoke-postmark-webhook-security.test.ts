import assert from "node:assert/strict";
import test from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { postmarkWebhookCredential } from "../src/built-ins/modules/email-sender/src/api/handlers";
import { WebhookService } from "../src/built-ins/modules/email-sender/src/server/webhook";
import type { PostmarkWebhookEvent } from "../src/built-ins/modules/email-sender/src/lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "../src/built-ins/modules/email-sender/src/server/ports";

class LockedStorage implements StoragePort {
  readonly rows = new Map<string, unknown>();
  private readonly tails = new Map<string, Promise<void>>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.rows.get(key) as T | undefined;
  }
  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.rows.set(key, structuredClone(value));
  }
  async del(key: string): Promise<void> { this.rows.delete(key); }
  async list(prefix = ""): Promise<string[]> {
    return [...this.rows.keys()].filter(key => key.startsWith(prefix));
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
}

test("Postmark webhook credentials never come from the URL query", () => {
  const queryOnly = new Request("http://local.test/postmark?secret=do-not-log-me", { method: "POST" });
  assert.equal(postmarkWebhookCredential(queryOnly), "");

  const basic = Buffer.from("aqua:correct-secret", "utf8").toString("base64");
  assert.equal(postmarkWebhookCredential(new Request("http://local.test/postmark", {
    method: "POST",
    headers: { authorization: `Basic ${basic}` },
  })), "correct-secret");
  assert.equal(postmarkWebhookCredential(new Request("http://local.test/postmark", {
    method: "POST",
    headers: { "x-postmark-secret": "correct-secret" },
  })), "correct-secret");
  assert.equal(postmarkWebhookCredential(new Request("http://local.test/postmark", {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "x-postmark-secret": "conflicting-secret" },
  })), "", "ambiguous proxy/provider credentials fail closed");
});

function serviceFor(args: { ownsMessage: boolean; storage: LockedStorage }) {
  const activityRows: unknown[] = [];
  const emitted: unknown[] = [];
  const activity: ActivityLogPort = {
    logActivity(input) { activityRows.push(input); return { id: "act_1", ts: Date.now(), ...input }; },
    listActivity() { return []; },
  };
  const events: EventBusPort = {
    emit(scope, name, payload) { emitted.push({ scope, name, payload }); },
  };
  const message = {
    id: "email_owned",
    agencyId: "agency_owner",
    clientId: "client_owner",
    to: ["recipient@example.test"],
    externalRef: "pm_exact_message",
  };
  const emails = {
    async getByExternalRef(id: string) { return args.ownsMessage && id === message.externalRef ? message : null; },
    async markBounced() { return null; },
  };
  const service = new WebhookService(
    "agency_owner",
    args.storage,
    activity,
    events,
    emails as never,
    {} as never,
    new Map(),
  );
  return { service, activityRows, emitted };
}

test("a shared Postmark secret cannot mutate or poison a different install", async () => {
  const event: PostmarkWebhookEvent = {
    RecordType: "Delivery",
    MessageID: "pm_exact_message",
    Recipient: "recipient@example.test",
  };
  const wrongStorage = new LockedStorage();
  const wrong = serviceFor({ ownsMessage: false, storage: wrongStorage });
  const refused = await wrong.service.apply(event);
  assert.deepEqual(refused, { ok: true, duplicate: false, applied: false, eventKind: "Delivery" });
  assert.deepEqual(await wrongStorage.list(), [], "wrong install cannot even poison the event idempotency key");
  assert.equal(wrong.activityRows.length, 0);
  assert.equal(wrong.emitted.length, 0);

  const ownerStorage = new LockedStorage();
  const owner = serviceFor({ ownsMessage: true, storage: ownerStorage });
  const [left, right] = await Promise.all([
    owner.service.apply(event),
    owner.service.apply(event),
  ]);
  assert.equal([left, right].filter(result => result.applied).length, 1);
  assert.equal([left, right].filter(result => result.duplicate).length, 1);
  assert.equal(owner.activityRows.length, 1);
  assert.equal(owner.emitted.length, 1);
});

test("Postmark application fails closed without the host durable lock", async () => {
  const unlocked = serviceFor({ ownsMessage: true, storage: new LockedStorage() });
  (unlocked.service as unknown as { storage: StoragePort }).storage = {
    async get() { return undefined; },
    async set() {},
    async del() {},
    async list() { return []; },
  };
  const result = await unlocked.service.apply({ RecordType: "Delivery", MessageID: "pm_exact_message" });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /durable webhook admission unavailable/);
});
