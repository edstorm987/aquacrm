// Email-sender plugin smoke. node:test via tsx --test.
// Covers the seven cases enumerated in R10:
//   1. enqueue happy path with template substitution
//   2. idempotent on (triggeredByPlugin, externalRef)
//   3. Postmark driver mock: returns externalRef, message marked sent
//   4. No-op driver: marks sent without external call
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
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  EmailMessage,
  PostmarkWebhookEvent,
  ProviderKind,
  SendFailure,
  SendResult,
} from "../lib/domain";
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
import { containerWithDeps, EVENT_SUBSCRIPTIONS } from "../server/foundationAdapter";
import { NoopDriver, PostmarkDriver } from "../server/drivers";

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
  const fetchImpl: typeof fetch = async (input, init) => {
    fetchCalls.push({ url: typeof input === "string" ? input : (input as URL).toString(), init });
    return new Response(JSON.stringify(postmark.json), {
      status: postmark.status,
      headers: { "content-type": "application/json" },
    });
  };
  const drivers = new Map<ProviderKind, EmailDriver>([
    ["postmark", new PostmarkDriver(fetchImpl)],
    ["none", new NoopDriver()],
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
    const sentEvents = world.inspect.events.filter(e => e.name === "email.sent");
    assert.ok(sentEvents.length >= 1);
  });

  test("step 4: no-op driver — marks sent without external call", async () => {
    await services.provider.update({ provider: "none" }, ACTOR);
    const before = world.inspect.fetchCalls.length;
    const message = await services.emails.enqueue({
      to: "dan@example.com",
      subject: "Noop driver test",
      bodyText: "Should not hit network.",
      triggeredByPlugin: "email-sender",
      externalRef: "step4:noop",
    }, ACTOR);
    const result = await services.delivery.deliver(message.id);
    assert.equal(result.ok, true);
    assert.ok(result.externalRef?.startsWith("noop_"));
    const after = world.inspect.fetchCalls.length;
    assert.equal(after, before, "no fetch calls under noop driver");
    const updated = await services.emails.get(message.id);
    assert.equal(updated?.status, "sent");
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
    assert.equal(subs.length, 4, "4 subscribers declared");
    assert.deepEqual(
      subs.map(s => s.event).sort(),
      [
        "affiliate.payout_completed",
        "auth.bootstrap.signup",
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
