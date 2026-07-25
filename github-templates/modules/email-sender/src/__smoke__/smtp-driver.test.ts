// SMTP driver smoke (T2 R024 — WS-D). node:test via tsx --test.
//
// Focuses on the SmtpDriver + provider config + delivery wiring,
// independent of the broader email-sender flows already covered by
// `email-sender.test.ts`.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type { ActivityEntry, AgencyId, UserId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort, EventBusPort, EmailDriver,
  PluginInstallStorePort, TenantPort,
} from "../server/ports";
import type { ProviderKind, EmailMessage } from "../lib/domain";
import {
  buildEmailSenderContainer,
  buildSmtpDataBody,
  defaultDriverRegistry,
  PLACEHOLDER_SMTP_TRANSPORT,
  SmtpDriver,
  type SmtpTransport,
  type SmtpDialOptions,
} from "../server/index";

const AGENCY: AgencyId = "agency_aqua";
const ACTOR: UserId = "user_admin";

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  pluginInstalls: PluginInstallStorePort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    smtpDials: SmtpDialOptions[];
  };
}

function buildWorld(transport: SmtpTransport): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const smtpDials: SmtpDialOptions[] = [];
  let actSeq = 1;
  const storage: PluginStorage = {
    async get<T = unknown>(k: string): Promise<T | undefined> { return data.get(k) as T | undefined; },
    async set<T = unknown>(k: string, v: T): Promise<void> { data.set(k, v); },
    async del(k: string): Promise<void> { data.delete(k); },
    async list(prefix?: string): Promise<string[]> {
      const ks = [...data.keys()];
      return prefix ? ks.filter(k => k.startsWith(prefix)) : ks;
    },
  };
  const activity: ActivityLogPort = {
    logActivity(input) {
      const e: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`, ts: Date.now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(e);
      return e;
    },
    async listActivity() { return [...activityLog]; },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  const tenant: TenantPort = {
    // Looser cast — Agency shape varies across foundation versions.
    getAgency(id) { return { id, name: "Aqua", slug: "aqua", brand: {}, brandKit: { primaryColor: "#0070f3" }, createdAt: 0, updatedAt: 0, status: "active" } as unknown as ReturnType<TenantPort["getAgency"]>; },
  };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall() { return null; },
  };
  const recordingTransport: SmtpTransport = async (opts) => {
    smtpDials.push(opts);
    return transport(opts);
  };
  void recordingTransport;
  return {
    storage, activity, events: eventBus, tenant, pluginInstalls,
    inspect: { activityLog, events, smtpDials },
  };
}

function container(world: World, transport: SmtpTransport) {
  const drivers = defaultDriverRegistry(fetch, async (opts) => {
    world.inspect.smtpDials.push(opts);
    return transport(opts);
  });
  return buildEmailSenderContainer({
    agencyId: AGENCY, storage: world.storage,
    activity: world.activity, events: world.events,
    tenant: world.tenant, pluginInstalls: world.pluginInstalls,
    drivers,
  });
}

function fakeMessage(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: "msg_test",
    agencyId: AGENCY,
    to: ["recipient@example.com"],
    from: { name: "Aqua", email: "send@aqua.example" },
    subject: "Hello",
    bodyHtml: "<p>Hello</p>",
    bodyText: "Hello",
    status: "queued",
    createdAt: 0, updatedAt: 0,
    idempotencyKey: "k",
    ...over,
  };
}

describe("@aqua/plugin-email-sender SMTP driver smoke (T2 R024)", () => {
  // ── Driver registry ──────────────────────────────────────────

  test("1. defaultDriverRegistry registers an SmtpDriver instance for kind='smtp' (no longer a stub)", () => {
    const drivers = defaultDriverRegistry();
    const smtp = drivers.get("smtp");
    assert.ok(smtp);
    assert.equal(smtp?.kind, "smtp");
    assert.ok(smtp instanceof SmtpDriver);
  });

  test("2. PLACEHOLDER_SMTP_TRANSPORT returns guidance failure (foundation must inject real transport)", async () => {
    const r = await PLACEHOLDER_SMTP_TRANSPORT({
      host: "x", port: 587, secure: "starttls", user: "u", pass: "p",
      message: fakeMessage(),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /smtp_transport_not_wired/);
  });

  // ── Provider picker ──────────────────────────────────────────

  test("3. ProviderService persists smtp config + masks password under the same private slot used by Postmark", async () => {
    const world = buildWorld(async () => ({ ok: true as const, externalRef: "smtp_1" }));
    const c = container(world, async () => ({ ok: true as const, externalRef: "smtp_1" }));
    await c.provider.update({
      provider: "smtp",
      apiKey: "sup3rs3cr3t",
      smtp: { host: "smtp.postmarkapp.com", port: 587, user: "u", secure: "starttls" },
    }, ACTOR);
    const cfg = await c.provider.get();
    assert.equal(cfg.provider, "smtp");
    assert.equal(cfg.smtp?.host, "smtp.postmarkapp.com");
    assert.equal(cfg.smtp?.port, 587);
    assert.equal(cfg.apiKeyMasked, "cr3t");
    assert.equal(cfg.status, "active");
  });

  test("4. provider 'smtp' without smtp config → SmtpDriver returns guidance failure (no silent drop)", async () => {
    const world = buildWorld(async () => ({ ok: true as const, externalRef: "x" }));
    const driver = new SmtpDriver(async () => ({ ok: true as const, externalRef: "x" }));
    const result = await driver.send({
      ctx: { agencyId: AGENCY },
      message: fakeMessage(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /SMTP transport config missing/);
    void world;
  });

  test("5. provider 'smtp' with smtp config but no password → guidance failure", async () => {
    const driver = new SmtpDriver(async () => ({ ok: true as const, externalRef: "x" }));
    const result = await driver.send({
      ctx: { agencyId: AGENCY, smtp: { host: "h", port: 587, user: "u", secure: "starttls" } },
      message: fakeMessage(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /SMTP password not configured/);
  });

  test("6. SmtpDriver passes the password from ctx.apiKey into the transport (the slot is shared with Postmark)", async () => {
    let observed: SmtpDialOptions | null = null;
    const transport: SmtpTransport = async (opts) => {
      observed = opts;
      return { ok: true, externalRef: "smtp_42" };
    };
    const driver = new SmtpDriver(transport);
    await driver.send({
      ctx: {
        agencyId: AGENCY, apiKey: "the-pass",
        smtp: { host: "smtp.example", port: 587, user: "the-user", secure: "starttls" },
      },
      message: fakeMessage(),
    });
    assert.ok(observed);
    assert.equal((observed as SmtpDialOptions).host, "smtp.example");
    assert.equal((observed as SmtpDialOptions).port, 587);
    assert.equal((observed as SmtpDialOptions).user, "the-user");
    assert.equal((observed as SmtpDialOptions).pass, "the-pass");
    assert.equal((observed as SmtpDialOptions).secure, "starttls");
  });

  // ── Delivery integration ───────────────────────────────────

  test("7. delivery picks SmtpDriver when provider='smtp' AND propagates smtp config + password into the dial", async () => {
    let observed: SmtpDialOptions | null = null;
    const transport: SmtpTransport = async (opts) => {
      observed = opts;
      return { ok: true, externalRef: "smtp_seq_1" };
    };
    const world = buildWorld(transport);
    const c = container(world, transport);
    await c.provider.update({
      provider: "smtp",
      apiKey: "passw0rd",
      smtp: { host: "smtp.example", port: 587, user: "u", secure: "starttls" },
    }, ACTOR);
    // Create a sender identity + enqueue a message via the service.
    const id = { const _id = await c.identities.create({ name: "Aqua", email: "send@aqua.example", isDefault: true }, ACTOR); await c.identities.verifyDomain(_id.id, ACTOR); }
    void id;
    const msg = await c.emails.enqueue({
      to: "recipient@example.com",
      subject: "Welcome",
      bodyText: "Hi there!",
    });
    const r = await c.delivery.deliver(msg.id);
    assert.equal(r.ok, true);
    assert.equal(r.externalRef, "smtp_seq_1");
    assert.ok(observed);
    assert.equal((observed as SmtpDialOptions).host, "smtp.example");
    assert.equal((observed as SmtpDialOptions).pass, "passw0rd");
  });

  test("8. transport failure → delivery marks message failed + propagates reason", async () => {
    const transport: SmtpTransport = async () => ({ ok: false, reason: "535 5.7.8 auth failed" });
    const world = buildWorld(transport);
    const c = container(world, transport);
    await c.provider.update({
      provider: "smtp",
      apiKey: "nope",
      smtp: { host: "smtp.example", port: 587, user: "u", secure: "starttls" },
    }, ACTOR);
    { const _id = await c.identities.create({ name: "Aqua", email: "send@aqua.example", isDefault: true }, ACTOR); await c.identities.verifyDomain(_id.id, ACTOR); }
    const msg = await c.emails.enqueue({ to: "x@example.com", subject: "y", bodyText: "z" });
    const r = await c.delivery.deliver(msg.id);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /auth/);
    const reread = await c.emails.get(msg.id);
    assert.equal(reread?.status, "failed");
    assert.match(reread?.failureReason ?? "", /auth/);
  });

  test("9. delivery is idempotent — second deliver() on a sent message returns the same externalRef without re-dialing", async () => {
    let dials = 0;
    const transport: SmtpTransport = async () => {
      dials++;
      return { ok: true, externalRef: "smtp_seq_X" };
    };
    const world = buildWorld(transport);
    const c = container(world, transport);
    await c.provider.update({
      provider: "smtp",
      apiKey: "p",
      smtp: { host: "h", port: 587, user: "u", secure: "starttls" },
    }, ACTOR);
    { const _id = await c.identities.create({ name: "Aqua", email: "send@aqua.example", isDefault: true }, ACTOR); await c.identities.verifyDomain(_id.id, ACTOR); }
    const msg = await c.emails.enqueue({ to: "x@example.com", subject: "y", bodyText: "z" });
    const r1 = await c.delivery.deliver(msg.id);
    const r2 = await c.delivery.deliver(msg.id);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r1.externalRef, r2.externalRef);
    assert.equal(dials, 1);
  });

  test("10. enqueue with the same externalRef collapses onto the prior row (cross-plugin idempotency)", async () => {
    const world = buildWorld(async () => ({ ok: true as const, externalRef: "smtp_1" }));
    const c = container(world, async () => ({ ok: true as const, externalRef: "smtp_1" }));
    { const _id = await c.identities.create({ name: "Aqua", email: "send@aqua.example", isDefault: true }, ACTOR); await c.identities.verifyDomain(_id.id, ACTOR); }
    const a = await c.emails.enqueue({
      to: "x@example.com", subject: "Hi", bodyText: "z",
      triggeredByPlugin: "memberships", externalRef: "ext-42",
    });
    const b = await c.emails.enqueue({
      to: "x@example.com", subject: "Hi", bodyText: "z",
      triggeredByPlugin: "memberships", externalRef: "ext-42",
    });
    assert.equal(a.id, b.id);
  });

  // ── Wire grammar ────────────────────────────────────────────

  test("11. buildSmtpDataBody emits expected RFC headers + multipart/alternative when both bodies present", () => {
    const body = buildSmtpDataBody(fakeMessage({
      from: { name: "Aqua", email: "s@aqua.example" },
      to: ["a@x.com", "b@x.com"],
      cc: ["c@x.com"],
      replyTo: "reply@aqua.example",
    }));
    assert.match(body, /^From: "Aqua" <s@aqua\.example>\r\n/);
    assert.match(body, /\r\nTo: a@x\.com, b@x\.com\r\n/);
    assert.match(body, /\r\nCc: c@x\.com\r\n/);
    assert.match(body, /\r\nReply-To: reply@aqua\.example\r\n/);
    assert.match(body, /\r\nSubject: Hello\r\n/);
    assert.match(body, /Content-Type: multipart\/alternative; boundary="mm_/);
    assert.match(body, /Content-Type: text\/plain/);
    assert.match(body, /Content-Type: text\/html/);
  });

  test("12. buildSmtpDataBody dot-stuffs leading-dot lines (RFC 5321 Section 4.5.2)", () => {
    const body = buildSmtpDataBody(fakeMessage({
      bodyHtml: undefined, bodyText: ".dotted line one\nnormal\n.dotted line two",
    }));
    // Each `.dotted` becomes `..dotted` so the SMTP single-dot terminator remains unambiguous.
    assert.match(body, /\r\n\.\.dotted line one\r\n/);
    assert.match(body, /\r\n\.\.dotted line two/);
  });

  test("13. activity log records 'email.provider.updated' on smtp config change", async () => {
    const world = buildWorld(async () => ({ ok: true as const, externalRef: "x" }));
    const c = container(world, async () => ({ ok: true as const, externalRef: "x" }));
    await c.provider.update({
      provider: "smtp", apiKey: "pw",
      smtp: { host: "h", port: 587, user: "u", secure: "starttls" },
    }, ACTOR);
    const acts = world.inspect.activityLog.filter(a => a.action === "email.provider.updated");
    assert.equal(acts.length, 1);
    assert.match(acts[0]?.message ?? "", /Provider updated to smtp/);
  });

  // ── Unrelated drivers untouched ─────────────────────────────

  test("14. switching provider='smtp' → 'none' keeps the smtp config persisted (operator can flip back without re-entering host/user)", async () => {
    const world = buildWorld(async () => ({ ok: true as const, externalRef: "x" }));
    const c = container(world, async () => ({ ok: true as const, externalRef: "x" }));
    await c.provider.update({
      provider: "smtp", apiKey: "pw",
      smtp: { host: "h", port: 587, user: "u", secure: "starttls" },
    }, ACTOR);
    await c.provider.update({ provider: "none" }, ACTOR);
    const cfg = await c.provider.get();
    assert.equal(cfg.provider, "none");
    assert.equal(cfg.smtp?.host, "h");
  });

  test("15. SendGrid + Resend drivers remain stubs returning guidance failure (regression guard for the registry trim)", async () => {
    const drivers: Map<ProviderKind, EmailDriver> = defaultDriverRegistry();
    const sg = drivers.get("sendgrid");
    const re = drivers.get("resend");
    assert.ok(sg && re);
    const a = await sg!.send({ ctx: { agencyId: AGENCY }, message: fakeMessage() });
    const b = await re!.send({ ctx: { agencyId: AGENCY }, message: fakeMessage() });
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
  });
});
