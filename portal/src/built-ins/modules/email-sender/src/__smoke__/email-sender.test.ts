// Email-sender plugin smoke. node:test via tsx --test.
// Covers the seven cases enumerated in R10:
//   1. enqueue happy path with template substitution
//   2. idempotent on (triggeredByPlugin, externalRef)
//   3. Postmark driver mock: returns externalRef, message marked sent
//   4. Disabled provider: refuses delivery and leaves the message queued
//   5. Webhook signed-payload happy path: delivered updates timeline + emits event
//   6. MarketingTemplatePort absent: enqueue without templateId still works
//   7. Cross-plugin event subscriber wiring (mock router)

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type { PluginCtx, PluginStorage } from "../lib/aquaPluginTypes";
import type {
  EmailMessage,
  PostmarkWebhookEvent,
  ProviderKind,
  SendFailure,
  SendResult,
} from "../lib/domain";
import { EMAIL_DELIVERY_DISABLED_REASON } from "../lib/domain";
import type {
  ActivityLogPort,
  DriverContext,
  EmailDriver,
  EventBusPort,
  MarketingTemplate,
  MarketingTemplatePort,
  PluginInstallStorePort,
  TenantPort,
} from "../server/ports";
import {
  containerWithDeps,
  EVENT_SUBSCRIPTIONS,
  registerEmailSenderFoundation,
} from "../server/foundationAdapter";
import { NoopDriver, PostmarkDriver, SmtpDriver } from "../server/drivers";
import { buildEmailSenderHealth } from "../server/health";
import { driverCannotVerify, NO_PROVIDER_TO_VERIFY_WITH } from "../server/identities";
import { POSTMARK_ACCOUNT_TOKEN_MISSING } from "../server/drivers/postmark";
import {
  getProviderHandler,
  testSendHandler,
  updateIdentityHandler,
  updateProviderHandler,
  verifyIdentityHandler,
} from "../api/handlers";

const AGENCY_ID: AgencyId = "agency_email_smoke";
const ACTOR: UserId = "user_admin";

interface World {
  storage: PluginStorage;
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  marketingTemplates?: MarketingTemplatePort;
  drivers: Map<ProviderKind, EmailDriver>;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    fetchCalls: { url: string; init?: RequestInit }[];
  };
}

function buildWorld(opts?: {
  withMarketingTemplates?: boolean;
  postmarkResponse?: { status: number; json: unknown };
  sendersResponse?: { status: number; json: unknown };
}): World {
  const agency: Agency = {
    id: AGENCY_ID, name: "Smoke Email Agency", slug: "smoke-email",
    brand: { primaryColor: "#0aa" }, status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const fetchCalls: { url: string; init?: RequestInit }[] = [];

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
    getAgency: id => (id === AGENCY_ID ? agency : null),
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
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null { return null; },
  };

  const marketingTemplates: MarketingTemplatePort | undefined = opts?.withMarketingTemplates
    ? {
        async getTemplate({ templateId }): Promise<MarketingTemplate | null> {
          if (templateId !== "tpl_welcome") return null;
          return {
            id: "tpl_welcome",
            agencyId: AGENCY_ID,
            name: "Welcome",
            subject: "Welcome, {{firstName}}",
            bodyHtml: "<p>Hi {{firstName}}, welcome to {{brand}}.</p>",
            bodyText: "Hi {{firstName}}, welcome to {{brand}}.",
          };
        },
      }
    : undefined;

  // Mock fetch for Postmark — records the call + returns the configured
  // response (defaults to a successful Postmark-shaped reply).
  const postmark = opts?.postmarkResponse ?? {
    status: 200,
    json: { To: "anywhere", SubmittedAt: "2026-05-04T12:00:00Z", MessageID: "pm_test_1", ErrorCode: 0, Message: "OK" },
  };
  // The sender-signature endpoint is a DIFFERENT call from /email, so the mock
  // routes on the URL: a test that never configures signatures must not have
  // its verification silently answered by the send response.
  const senders = opts?.sendersResponse;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    fetchCalls.push({ url, init });
    if (url.includes("/senders")) {
      const reply = senders ?? { status: 500, json: { Message: "no senders response configured in this world" } };
      return new Response(JSON.stringify(reply.json), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(postmark.json), {
      status: postmark.status,
      headers: { "content-type": "application/json" },
    });
  };
  const drivers = new Map<ProviderKind, EmailDriver>([
    ["postmark", new PostmarkDriver(fetchImpl)],
    ["none", new NoopDriver()],
    ["smtp", new SmtpDriver()],
  ]);

  return {
    storage, tenant, activity, events: eventBus, pluginInstalls,
    marketingTemplates, drivers,
    inspect: { activityLog, events, fetchCalls },
  };
}

describe("email-sender smoke", () => {
  let world: World;
  let services: ReturnType<typeof containerWithDeps>;

  before(async () => {
    world = buildWorld({ withMarketingTemplates: true });
    services = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: world.storage,
      tenant: world.tenant,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
      marketingTemplates: world.marketingTemplates,
      drivers: world.drivers,
    });
    // Bootstrap: a default sender identity, marked active so enqueue's
    // from-resolution can find it.
    const id = await services.identities.create(
      { name: "Aqua portal", email: "no-reply@example.com", isDefault: true },
      ACTOR,
    );
    await services.identities.verifyDomain(id.id, ACTOR);
  });

  test("step 1: enqueue happy path with template substitution", async () => {
    const message = await services.emails.enqueue({
      to: "alice@example.com",
      templateId: "tpl_welcome",
      templateValues: { firstName: "Alice", brand: "Smoke Email Agency" },
      triggeredByPlugin: "memberships",
      externalRef: "step1:welcome",
    }, ACTOR);
    assert.equal(message.status, "queued");
    assert.equal(message.subject, "Welcome, Alice");
    assert.match(message.bodyHtml ?? "", /Hi Alice/);
    assert.match(message.bodyText ?? "", /welcome to Smoke Email Agency/);
    assert.equal(message.from.email, "no-reply@example.com");
    assert.ok(message.idempotencyKey.startsWith("memberships:"));
    const queuedEvents = world.inspect.events.filter(e => e.name === "email.queued");
    assert.ok(queuedEvents.length >= 1, "email.queued event was emitted");
  });

  test("step 2: idempotent on (triggeredByPlugin, externalRef)", async () => {
    const first = await services.emails.enqueue({
      to: "bob@example.com",
      subject: "Hi Bob",
      bodyText: "First",
      triggeredByPlugin: "forms",
      externalRef: "step2:idem",
    }, ACTOR);
    const second = await services.emails.enqueue({
      to: "bob@example.com",
      subject: "Hi Bob (again)",   // body differs but the (plugin, ref) collapses
      bodyText: "Second",
      triggeredByPlugin: "forms",
      externalRef: "step2:idem",
    }, ACTOR);
    assert.equal(second.id, first.id, "second enqueue collapsed onto first");
    assert.equal(second.subject, "Hi Bob", "first message wins");
    assert.equal(second.bodyText, "First");
  });

  test("step 3: Postmark driver — sets externalRef, marks sent", async () => {
    const before = world.inspect.fetchCalls.length;
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_live_test123key", webhookSecret: "wh_secret_step3" },
      ACTOR,
    );
    assert.equal((await services.provider.get()).status, "unconfigured");
    const message = await services.emails.enqueue({
      to: "carol@example.com",
      subject: "Postmark test",
      bodyText: "Hi Carol",
      triggeredByPlugin: "email-sender",
      externalRef: "step3:postmark",
    }, ACTOR);
    const result = await services.delivery.deliver(message.id);
    assert.equal(result.ok, true);
    assert.equal(result.externalRef, "pm_test_1");
    const after = world.inspect.fetchCalls.length;
    assert.equal(after - before, 1, "exactly one Postmark API call made");
    const updated = await services.emails.get(message.id);
    assert.equal(updated?.status, "sent");
    assert.equal(updated?.externalRef, "pm_test_1");
    assert.ok(updated?.sentAt);
    const activeProvider = await services.provider.get();
    assert.equal(activeProvider.status, "active");
    assert.ok(activeProvider.testedAt);
    const sentEvents = world.inspect.events.filter(e => e.name === "email.sent");
    assert.ok(sentEvents.length >= 1);
  });

  test("step 4: disabled provider — refuses delivery and leaves the row queued", async () => {
    await services.provider.update({ provider: "none" }, ACTOR);
    const before = world.inspect.fetchCalls.length;
    const sentEventsBefore = world.inspect.events.filter(e => e.name === "email.sent").length;
    const message = await services.emails.enqueue({
      to: "dan@example.com",
      subject: "Noop driver test",
      bodyText: "Should not hit network.",
      triggeredByPlugin: "email-sender",
      externalRef: "step4:noop",
    }, ACTOR);
    const result = await services.delivery.deliver(message.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "provider_unconfigured");
    assert.equal(result.reason, EMAIL_DELIVERY_DISABLED_REASON);
    const after = world.inspect.fetchCalls.length;
    assert.equal(after, before, "no fetch calls under disabled provider");
    const updated = await services.emails.get(message.id);
    assert.equal(updated?.status, "queued");
    assert.equal(updated?.externalRef, undefined);
    assert.equal(updated?.sentAt, undefined);
    const provider = await services.provider.get();
    assert.equal(provider.provider, "none");
    assert.equal(provider.status, "unconfigured");
    assert.equal(provider.testedAt, undefined);
    assert.equal(
      world.inspect.events.filter(e => e.name === "email.sent").length,
      sentEventsBefore,
      "disabled delivery must not emit email.sent",
    );

    const directDriverResult = await new NoopDriver().send({
      ctx: { agencyId: AGENCY_ID },
      message,
    });
    assert.equal(directDriverResult.ok, false);
    if (!directDriverResult.ok) {
      assert.equal(directDriverResult.reason, EMAIL_DELIVERY_DISABLED_REASON);
    }

    const health = buildEmailSenderHealth(provider, await services.identities.list(), [updated!]);
    assert.equal(health.ok, false);
    assert.equal(health.components?.provider?.ok, false);
    assert.match(health.components?.provider?.message ?? "", /delivery disabled/);
  });

  test("step 4b: test-send API returns conflict and preserves its queued row when disabled", async () => {
    registerEmailSenderFoundation({
      tenant: world.tenant,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
      marketingTemplates: world.marketingTemplates,
      drivers: world.drivers,
    });
    const ctx: PluginCtx = {
      agencyId: AGENCY_ID,
      actor: ACTOR,
      storage: world.storage,
      install: {
        id: "install_email_smoke",
        pluginId: "email-sender",
        agencyId: AGENCY_ID,
        enabled: true,
        config: {},
        features: {},
        installedAt: 0,
      },
      services: {
        clients: null,
        pluginInstalls: null,
        pluginRuntime: null,
        registry: null,
        phases: null,
        activity: world.activity,
        events: world.events,
        variants: null,
        tenant: world.tenant,
      },
    };
    const response = await testSendHandler(new Request("http://local.test/api/portal/email-sender/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "api-disabled@example.com" }),
    }), ctx);
    assert.equal(response.status, 409);
    const body = await response.json() as {
      ok: boolean;
      code?: string;
      reason?: string;
      messageId?: string;
    };
    assert.equal(body.ok, false);
    assert.equal(body.code, "provider_unconfigured");
    assert.equal(body.reason, EMAIL_DELIVERY_DISABLED_REASON);
    assert.ok(body.messageId);
    assert.equal((await services.emails.get(body.messageId!))?.status, "queued");
  });

  test("step 5: webhook signed-payload happy path → delivered + emits event", async () => {
    // Re-arm Postmark provider so the webhook driver lookup hits Postmark.
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_live_test123key", webhookSecret: "wh_secret_step5" },
      ACTOR,
    );
    const message = await services.emails.enqueue({
      to: "eve@example.com",
      subject: "Webhook test",
      bodyText: "Hi Eve",
      triggeredByPlugin: "email-sender",
      externalRef: "step5:webhook",
    }, ACTOR);
    const send = await services.delivery.deliver(message.id);
    assert.equal(send.ok, true);
    const externalRef = send.externalRef!;

    const eventsBefore = world.inspect.events.length;
    const payload: PostmarkWebhookEvent = {
      RecordType: "Delivery",
      MessageID: externalRef,
      Recipient: "eve@example.com",
      DeliveredAt: "2026-05-04T12:01:00Z",
    };
    const result = await services.webhook.handle({
      rawBody: JSON.stringify(payload),
      signatureHeader: "wh_secret_step5",
    });
    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(result.eventKind, "Delivery");
    const deliveredEvents = world.inspect.events
      .slice(eventsBefore)
      .filter(e => e.name === "email.delivered");
    assert.equal(deliveredEvents.length, 1);

    // Bad signature is rejected.
    const bad = await services.webhook.handle({
      rawBody: JSON.stringify(payload),
      signatureHeader: "wrong_secret",
    });
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? "", /signature/);

    // Replay (same eventId) is dedupe'd.
    const replay = await services.webhook.handle({
      rawBody: JSON.stringify(payload),
      signatureHeader: "wh_secret_step5",
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.applied, false);
  });

  test("step 6: MarketingTemplatePort absent — templateless enqueue still works", async () => {
    // Build a separate container without marketingTemplates.
    const w = buildWorld({ withMarketingTemplates: false });
    const c = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: w.storage,
      tenant: w.tenant,
      activity: w.activity,
      events: w.events,
      pluginInstalls: w.pluginInstalls,
      drivers: w.drivers,
    });
    const id = await c.identities.create(
      { name: "Aqua portal", email: "no-reply@example.com", isDefault: true },
      ACTOR,
    );
    await c.identities.verifyDomain(id.id, ACTOR);
    // Template path errors cleanly.
    await assert.rejects(
      c.emails.enqueue({
        to: "frank@example.com",
        templateId: "tpl_welcome",
        templateValues: { firstName: "Frank" },
        triggeredByPlugin: "memberships",
        externalRef: "step6:template-missing",
      }, ACTOR),
      /agency-marketing not installed/,
    );
    // Templateless path works.
    const message = await c.emails.enqueue({
      to: "frank@example.com",
      subject: "Hi Frank",
      bodyText: "Plain enqueue, no template port.",
      triggeredByPlugin: "auth",
      externalRef: "step6:templateless",
    }, ACTOR);
    assert.equal(message.status, "queued");
    assert.equal(message.subject, "Hi Frank");
  });

  test("step 7: cross-plugin event subscribers wired (mock router)", async () => {
    // Simulate foundation's R6 router: read EVENT_SUBSCRIPTIONS, look up the
    // declared handler on the live EmailService, invoke it for each event.
    type Sub = {
      event: string;
      handler: keyof typeof services.emails;
      description: string;
    };
    const router = new Map<string, (payload: unknown) => Promise<unknown>>();
    const subs = EVENT_SUBSCRIPTIONS as readonly Sub[];
    for (const s of subs) {
      const fn = services.emails[s.handler];
      assert.equal(typeof fn, "function", `EmailService is missing ${String(s.handler)}`);
      router.set(s.event, (payload: unknown) =>
        (fn as (p: unknown) => Promise<unknown>).call(services.emails, payload));
    }
    assert.equal(subs.length, 5, "5 subscribers declared");
    assert.deepEqual(
      subs.map(s => s.event).sort(),
      [
        "affiliate.payout_completed",
        "auth.bootstrap.signup",
        // Added with the client-CRM add-on (25eae14). This census sat at 4 for
        // as long as the file was absent from `smoke:all` — the count was
        // right when written and wrong the moment CRM shipped, with nothing
        // running to say so.
        "crm.automation.email_requested",
        "forms.notification.requested",
        "membership.subscription_changed",
      ],
    );

    // Each handler enqueues an EmailMessage when the payload supplies the
    // required fields.
    const m1 = await router.get("forms.notification.requested")!({
      submissionId: "sub_router_1",
      formId: "form_1",
      formName: "Spring Lead",
      notifyEmails: ["sales@example.com"],
      payload: { name: "Greg", email: "greg@example.com" },
    }) as EmailMessage | null;
    assert.ok(m1, "forms subscriber returned a message");
    assert.equal(m1!.triggeredByPlugin, "forms");
    assert.match(m1!.subject, /Spring Lead/);

    const m2 = await router.get("membership.subscription_changed")!({
      subscriptionId: "sub_router_2",
      userId: "u1",
      userEmail: "harry@example.com",
      oldStatus: "trialing",
      newStatus: "active",
      planName: "Silver",
    }) as EmailMessage | null;
    assert.ok(m2, "memberships subscriber returned a welcome message");
    assert.match(m2!.subject, /Welcome to Silver/);

    const m3 = await router.get("affiliate.payout_completed")!({
      payoutId: "po_router_3",
      affiliateUserId: "u2",
      affiliateEmail: "ivy@example.com",
      amountCents: 12500,
      externalRef: "stripe_tr_x",
    }) as EmailMessage | null;
    assert.ok(m3, "affiliate subscriber returned a message");
    assert.match(m3!.bodyText ?? "", /125\.00/);

    const m4 = await router.get("auth.bootstrap.signup")!({
      userId: "u3",
      email: "jay@example.com",
      name: "Jay",
      agencyName: "Smoke Email Agency",
    }) as EmailMessage | null;
    assert.ok(m4, "auth subscriber returned a welcome message");
    assert.match(m4!.subject, /Welcome to Smoke Email Agency/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Setup must be reachable, and "verified" must be earned.
//
// Before this block, `verifyDomain` set `status: "active"` and stamped
// `verifiedAt` for ANY address the moment it was called — no provider was
// contacted, no credential was needed, and provider `none` was no obstacle.
// Every surface downstream (the health `identities` component, the Settings
// table's "Verified" column, the API response) then reported a pass nobody had
// earned, and it was indistinguishable from a real one.
//
// The other half of the same defect: no screen anywhere called the provider,
// identity or test routes, and the manifest declared `provider` and
// `webhookSecret` as settings fields that the generic hub panel wrote to
// `install.config` — a store neither DeliveryService nor WebhookService reads.
// ─────────────────────────────────────────────────────────────────────────

function makeCtx(world: World): PluginCtx {
  return {
    agencyId: AGENCY_ID,
    actor: ACTOR,
    storage: world.storage,
    install: {
      id: "install_email_verify",
      pluginId: "email-sender",
      agencyId: AGENCY_ID,
      enabled: true,
      config: {},
      features: {},
      installedAt: 0,
    },
    services: {
      clients: null, pluginInstalls: null, pluginRuntime: null, registry: null,
      phases: null, activity: world.activity, events: world.events,
      variants: null, tenant: world.tenant,
    },
  };
}

const CONFIRMED_SENDERS = {
  status: 200,
  json: {
    TotalCount: 1,
    SenderSignatures: [
      { ID: 4242, Domain: "verified.example", EmailAddress: "Hello@Verified.Example", Confirmed: true },
    ],
  },
};

describe("email-sender setup — verification must be earned, and configurable", () => {
  function freshWorld(sendersResponse?: { status: number; json: unknown }) {
    const world = buildWorld({ sendersResponse });
    const services = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: world.storage,
      tenant: world.tenant,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
      drivers: world.drivers,
    });
    return { world, services };
  }

  test("no provider configured — verification cannot pass, and says why", async () => {
    const { world, services } = freshWorld();
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    assert.equal(identity.status, "pending");

    const outcome = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.ok(outcome);
    assert.equal(outcome!.verification.verified, false);
    assert.equal(outcome!.identity.status, "pending", "an unasked provider cannot activate an identity");
    assert.equal(outcome!.identity.verifiedAt, undefined, "and must not stamp a verification date");
    assert.equal(outcome!.identity.verificationError, NO_PROVIDER_TO_VERIFY_WITH);
    assert.ok(outcome!.identity.verificationCheckedAt, "but it does record that we asked");
    assert.equal(
      world.inspect.events.filter(e => e.name === "email.identity.verified").length,
      0,
      "no verified event may be emitted without evidence",
    );
    assert.equal(world.inspect.fetchCalls.length, 0, "and nothing was called to produce it");

    // The blind spot stays visible rather than being smoothed over.
    const health = buildEmailSenderHealth(
      await services.provider.get(), await services.identities.list(), [],
    );
    assert.equal(health.components?.identities?.ok, false);
    assert.match(health.components?.identities?.message ?? "", /0\/1 active/);
  });

  test("Postmark without the account token — refused with the missing-credential reason", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    await services.provider.update({ provider: "postmark", apiKey: "pm_server_token" }, ACTOR);
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const outcome = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(outcome!.verification.verified, false);
    assert.equal(outcome!.identity.status, "pending");
    assert.equal(outcome!.identity.verificationError, POSTMARK_ACCOUNT_TOKEN_MISSING);
    assert.equal(
      world.inspect.fetchCalls.filter(c => c.url.includes("/senders")).length, 0,
      "the driver must not pretend to call an endpoint it has no credential for",
    );
  });

  test("Postmark answers 'not a sender signature' — the identity stays pending, in Postmark's words", async () => {
    const { services } = freshWorld({
      status: 200,
      json: { TotalCount: 0, SenderSignatures: [] },
    });
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_server_token", accountToken: "pm_account_token" }, ACTOR,
    );
    const identity = await services.identities.create(
      { name: "Aqua", email: "stranger@nowhere.example", isDefault: true }, ACTOR,
    );
    const outcome = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(outcome!.verification.verified, false);
    assert.equal(outcome!.identity.status, "pending");
    assert.match(outcome!.identity.verificationError ?? "", /no sender signature for stranger@nowhere\.example/);
  });

  test("Postmark knows the address but it is unconfirmed — still not active", async () => {
    const { services } = freshWorld({
      status: 200,
      json: {
        TotalCount: 1,
        SenderSignatures: [{ ID: 7, EmailAddress: "hello@verified.example", Confirmed: false }],
      },
    });
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_server_token", accountToken: "pm_account_token" }, ACTOR,
    );
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const outcome = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(outcome!.verification.verified, false);
    assert.equal(outcome!.identity.status, "pending");
    assert.match(outcome!.identity.verificationError ?? "", /not confirmed yet/);
  });

  test("Postmark confirms it — NOW the identity is active, with the evidence recorded", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_server_token", accountToken: "pm_account_token" }, ACTOR,
    );
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const outcome = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(outcome!.verification.verified, true);
    assert.equal(outcome!.identity.status, "active");
    assert.equal(outcome!.identity.verificationSource, "postmark");
    assert.ok(outcome!.identity.verifiedAt, "a real verification does stamp the date");
    assert.equal(outcome!.identity.verificationError, undefined);

    const call = world.inspect.fetchCalls.find(c => c.url.includes("/senders"));
    assert.ok(call, "the account-level senders API was actually called");
    const headers = call!.init?.headers as Record<string, string>;
    assert.equal(headers["X-Postmark-Account-Token"], "pm_account_token");
    assert.equal(
      world.inspect.events.filter(e => e.name === "email.identity.verified").length, 1,
    );

    // Editing the address throws the evidence away — it was earned by a
    // different mailbox.
    const moved = await services.identities.update(
      identity.id, { email: "someone-else@verified.example" }, ACTOR,
    );
    assert.equal(moved?.status, "pending");
    assert.equal(moved?.verifiedAt, undefined);
    assert.equal(moved?.verificationSource, undefined);
    assert.equal(
      moved?.verificationCheckedAt, undefined,
      "nobody has asked about the NEW address, so the 'last asked' stamp goes too",
    );
  });

  // The re-check case. Keeping a once-earned `active` through a failed
  // re-check is defensible; showing only the old "confirmed by …" while the
  // provider has just said no is not — the refusal is the newer evidence.
  test("a failed re-check keeps the status but records — and shows — the refusal", async () => {
    const { services } = freshWorld(CONFIRMED_SENDERS);
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_server_token", accountToken: "pm_account_token" }, ACTOR,
    );
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const first = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(first!.identity.status, "active");

    // The provider is taken away; the next check cannot produce evidence.
    await services.provider.update({ provider: "none" }, ACTOR);
    const second = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(second!.verification.verified, false);
    assert.equal(second!.identity.status, "active", "one failed re-check does not destroy evidence");
    assert.equal(second!.identity.verificationError, NO_PROVIDER_TO_VERIFY_WITH,
      "but the refusal is recorded on the row rather than dropped");
    assert.ok(second!.identity.verificationCheckedAt);

    const { readFileSync } = await import("node:fs");
    const client = readFileSync(new URL("../pages/SettingsClient.tsx", import.meta.url), "utf8");
    assert.match(
      client, /the last re-check failed/,
      "and the settings table must say so instead of printing only the old confirmation",
    );
  });

  test("a driver that cannot verify does not get to activate anything", async () => {
    const { services } = freshWorld(CONFIRMED_SENDERS);
    await services.provider.update(
      { provider: "smtp", apiKey: "smtp-password", smtp: { host: "mail.test", port: 587, user: "u", secure: "starttls" } },
      ACTOR,
    );
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const outcome = await services.identities.verifyDomain(identity.id, ACTOR);
    assert.equal(outcome!.verification.verified, false);
    assert.equal(outcome!.identity.status, "pending");
    assert.equal(outcome!.identity.verificationError, driverCannotVerify("smtp"));
  });

  test("the verify route answers 422 with the provider's reason — never a cheerful 200", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    registerEmailSenderFoundation({
      tenant: world.tenant, activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls, drivers: world.drivers,
    });
    const ctx = makeCtx(world);
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );

    const refused = await verifyIdentityHandler(new Request("http://local.test/api/portal/email-sender/identities/verify", {
      method: "POST", body: JSON.stringify({ id: identity.id }),
    }), ctx);
    assert.equal(refused.status, 422, "an unverified identity must not be reported as verified");
    const refusedBody = await refused.json() as { ok: boolean; error?: string };
    assert.equal(refusedBody.ok, false);
    assert.equal(refusedBody.error, NO_PROVIDER_TO_VERIFY_WITH);

    // …and the same route succeeds once the provider really does confirm it.
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_server_token", accountToken: "pm_account_token" }, ACTOR,
    );
    const accepted = await verifyIdentityHandler(new Request("http://local.test/api/portal/email-sender/identities/verify", {
      method: "POST", body: JSON.stringify({ id: identity.id }),
    }), ctx);
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json() as { ok: boolean; evidence?: string };
    assert.equal(acceptedBody.ok, true);
    assert.match(acceptedBody.evidence ?? "", /sender signature 4242 is confirmed/);
  });

  test("the identity PATCH route is not a second door to an unearned 'active'", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    registerEmailSenderFoundation({
      tenant: world.tenant, activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls, drivers: world.drivers,
    });
    const ctx = makeCtx(world);
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const response = await updateIdentityHandler(new Request("http://local.test/api/portal/email-sender/identities", {
      method: "PATCH",
      body: JSON.stringify({ id: identity.id, patch: { status: "active" } }),
    }), ctx);
    assert.equal(response.status, 422);
    assert.match((await response.json() as { error: string }).error, /only when the provider confirms/);
    assert.equal((await services.identities.get(identity.id))?.status, "pending");
  });

  // The webhook secret is what proves a delivery callback really came from the
  // provider. Anyone holding it can post a forged "delivered" or "bounced"
  // event at the public webhook route, so it is a credential, not a display
  // field — and a prop handed to a client component is serialised into the page
  // and reaches the browser exactly like an API body does.
  test("the webhook signing secret is never handed to the browser", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    registerEmailSenderFoundation({
      tenant: world.tenant, activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls, drivers: world.drivers,
    });
    const ctx = makeCtx(world);
    await services.provider.update(
      { provider: "postmark", apiKey: "pm_server_token", webhookSecret: "wh_super_secret_9911" },
      ACTOR,
    );
    // Server-side the real value is still there — WebhookService compares it.
    assert.equal((await services.provider.get()).webhookSecret, "wh_super_secret_9911");

    const responses: [string, Response][] = [
      ["GET provider", await getProviderHandler(
        new Request("http://local.test/api/portal/email-sender/provider"), ctx,
      )],
      ["PATCH provider", await updateProviderHandler(
        new Request("http://local.test/api/portal/email-sender/provider", {
          method: "PATCH", body: JSON.stringify({ provider: "postmark" }),
        }), ctx,
      )],
    ];
    for (const [label, response] of responses) {
      const body = await response.text();
      assert.ok(
        !body.includes("wh_super_secret_9911"),
        `${label} must not return the signing secret`,
      );
      assert.match(body, /"webhookSecretMasked":"9911"/, `${label} reports only the tail`);
    }
    // The secret survived being read back as a tail — a masked response must
    // not have quietly overwritten the stored value.
    assert.equal((await services.provider.get()).webhookSecret, "wh_super_secret_9911");

    const { readFileSync } = await import("node:fs");
    const page = readFileSync(new URL("../pages/SettingsPage.tsx", import.meta.url), "utf8");
    assert.match(
      page, /provider=\{redactProviderConfig\(provider\)\}/,
      "the settings page must redact before handing the row to the client component",
    );
    const client = readFileSync(new URL("../pages/SettingsClient.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(
      client, /props\.provider\.webhookSecret\b/,
      "the client surface must have no stored secret to render back",
    );
  });

  test("the identity PATCH cannot stamp verification evidence through unlisted keys", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    registerEmailSenderFoundation({
      tenant: world.tenant, activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls, drivers: world.drivers,
    });
    const ctx = makeCtx(world);
    const identity = await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    // `status: "active"` is refused outright. These keys were the way round it:
    // the row spread the whole patch, so a caller could write the verification
    // stamp the Settings table renders, or move the row out of its own tenant.
    const response = await updateIdentityHandler(new Request("http://local.test/api/portal/email-sender/identities", {
      method: "PATCH",
      body: JSON.stringify({
        id: identity.id,
        patch: {
          name: "Renamed",
          verifiedAt: 1234567890,
          verificationSource: "postmark",
          agencyId: "agency_somebody_else",
        },
      }),
    }), ctx);
    assert.equal(response.status, 200);
    const row = await services.identities.get(identity.id);
    assert.equal(row?.name, "Renamed", "the declared field is still editable");
    assert.equal(row?.verifiedAt, undefined, "a verification date is evidence, not an input");
    assert.equal(row?.verificationSource, undefined, "and so is the provider that vouched");
    assert.equal(row?.status, "pending");
    assert.equal(row?.agencyId, AGENCY_ID, "the row cannot be reassigned out of its tenant");
  });

  test("test-send reports the provider's own refusal and keeps the durable row", async () => {
    const { world, services } = freshWorld(CONFIRMED_SENDERS);
    registerEmailSenderFoundation({
      tenant: world.tenant, activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls, drivers: world.drivers,
    });
    const ctx = makeCtx(world);
    await services.identities.create(
      { name: "Aqua", email: "hello@verified.example", isDefault: true }, ACTOR,
    );
    const response = await testSendHandler(new Request("http://local.test/api/portal/email-sender/test", {
      method: "POST", body: JSON.stringify({ to: "someone@example.com" }),
    }), ctx);
    assert.equal(response.status, 409, "provider none refuses rather than claiming a send");
    const body = await response.json() as { ok: boolean; messageId?: string };
    assert.equal(body.ok, false);
    assert.equal((await services.emails.get(body.messageId!))?.status, "queued");
  });
});

describe("email-sender setup — the controls exist and write to the store that is read", () => {
  test("the Settings page drives the real provider / identity / verify / test routes", async () => {
    const { readFileSync } = await import("node:fs");
    const client = readFileSync(
      new URL("../pages/SettingsClient.tsx", import.meta.url), "utf8",
    );
    for (const marker of [
      "/api/portal/email-sender",
      "\"provider\", { method: \"PATCH\"",
      "\"identities\", {\n      method: \"POST\"",
      "\"identities/verify\", { method: \"POST\"",
      "\"test\", { method: \"POST\"",
    ]) {
      assert.ok(client.includes(marker), `the settings surface must call ${marker}`);
    }
    // A page that only reports cannot configure anything — the defect this
    // replaces. At minimum it must accept a credential and submit it.
    assert.match(client, /type="password"/);
    const page = readFileSync(new URL("../pages/SettingsPage.tsx", import.meta.url), "utf8");
    assert.match(page, /SettingsClient/, "the server page mounts the editable surface");
  });

  test("the manifest declares no settings field the sending path does not read", async () => {
    const manifest = (await import("../../index")).default;
    const declared = manifest.settings.groups.flatMap(group => group.fields.map(field => field.id));
    // `provider` and `webhookSecret` were declared here and written to
    // `install.config` by the generic hub panel; nothing in this module reads
    // `install.config` for either, so the form saved and changed nothing.
    // They now live on the module's own Settings page, which PATCHes the
    // ProviderService row that DeliveryService and WebhookService actually read.
    assert.deepEqual(declared.sort(), ["defaultFromEmail", "defaultFromName"]);

    const { readdirSync, readFileSync } = await import("node:fs");
    const serverDir = new URL("../server/", import.meta.url);
    const codeLines = readdirSync(serverDir)
      .filter(name => name.endsWith(".ts"))
      .flatMap(name => readFileSync(new URL(name, serverDir), "utf8").split("\n"))
      // Comments EXPLAIN the rule (provider.ts says at length why the config
      // record is not the store); only executable lines can break it.
      .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line));
    assert.deepEqual(
      codeLines.filter(line => line.includes("install.config")),
      [],
      "no server service may read install.config — that is the store the hub writes and delivery ignores",
    );
  });
});
