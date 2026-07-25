// Forms plugin smoke. node:test via tsx --test.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EmailQueuePort,
  EmailQueueRequest,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../server/ports";
import { containerWithDeps } from "../server/foundationAdapter";

const AGENCY_ID: AgencyId = "agency_forms_smoke";
const CLIENT_ID: ClientId = "client_forms_smoke";
const ACTOR: UserId = "user_admin";

interface World {
  storage: PluginStorage;
  tenant: TenantPort;
  user: UserPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  emailQueue?: EmailQueuePort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    enqueued: { request: EmailQueueRequest }[];
  };
}

function buildWorld(opts?: { withEmailQueue?: boolean }): World {
  const agency: Agency = {
    id: AGENCY_ID, name: "Smoke Forms Agency", slug: "smoke-forms",
    brand: { primaryColor: "#000" }, status: "active",
    createdAt: 0, updatedAt: 0,
  };
  const client: Client = {
    id: CLIENT_ID, agencyId: AGENCY_ID, name: "Felicia Smoke", slug: "felicia",
    brand: { primaryColor: "#f80" }, stage: "live", status: "active",
    createdAt: 0, updatedAt: 0,
  };

  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const enqueued: { request: EmailQueueRequest }[] = [];

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
    getClient: id => (id === CLIENT_ID ? client : null),
  };
  const user: UserPort = { getUser: () => null };
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
  const emailQueue: EmailQueuePort | undefined = opts?.withEmailQueue
    ? {
        async enqueue({ request }) {
          enqueued.push({ request });
          return { ok: true, queued: true };
        },
      }
    : undefined;
  return {
    storage, tenant, user, activity, events: eventBus, pluginInstalls,
    emailQueue,
    inspect: { activityLog, events, enqueued },
  };
}

describe("forms smoke", () => {
  let world: World;
  let services: ReturnType<typeof containerWithDeps>;
  let formId: string;

  before(() => {
    world = buildWorld({ withEmailQueue: true });
    services = containerWithDeps({
      agencyId: AGENCY_ID, clientId: CLIENT_ID,
      storage: world.storage,
      tenant: world.tenant, user: world.user,
      activity: world.activity, events: world.events,
      pluginInstalls: world.pluginInstalls,
      emailQueue: world.emailQueue,
    });
  });

  test("step 0: seed default templates (idempotent)", async () => {
    const first = await services.templates.seedDefaults(ACTOR);
    assert.equal(first.seeded, 3, "Contact / Newsletter / Lead seeded");
    const second = await services.templates.seedDefaults(ACTOR);
    assert.equal(second.seeded, 0);
    assert.equal(second.existed, 3);
    const list = await services.templates.list();
    assert.deepEqual(list.map(t => t.name).sort(), ["Contact", "Lead Capture", "Newsletter Signup"]);
    assert.ok(list.every(t => t.isDefault));
  });

  test("step 1: form CRUD + status transitions", async () => {
    const form = await services.forms.create({
      name: "Spring 2026 Contact",
      description: "Lead capture for the spring launch.",
      fields: [
        { id: "name", kind: "text", label: "Name", required: true },
        { id: "email", kind: "email", label: "Email", required: true, attributeKey: "email" },
        { id: "msg", kind: "textarea", label: "Message", required: false },
      ],
      submitAction: { kind: "thank-you", thankYouMessage: "Thanks!" },
    }, ACTOR);
    formId = form.id;
    assert.equal(form.status, "draft");
    assert.equal(form.fields.length, 3);

    // draft → published
    const published = await services.forms.publish(formId, ACTOR);
    assert.equal(published?.status, "published");
    assert.ok(published?.publishedAt);

    // Cannot publish again as a different transition.
    const replay = await services.forms.publish(formId, ACTOR);
    assert.equal(replay?.status, "published", "publish is idempotent on already-published");

    // Cannot delete a published form.
    await assert.rejects(
      services.forms.delete(formId, ACTOR),
      /Only draft/i,
    );

    // archive — published → archived OK.
    const archived = await services.forms.update(formId, { status: "archived" }, ACTOR);
    assert.equal(archived?.status, "archived");

    // Re-publish from archived rejected.
    await assert.rejects(
      services.forms.update(formId, { status: "published" }, ACTOR),
      /Cannot transition/i,
    );
  });

  test("step 2: submission record with field validation", async () => {
    // Build a fresh form for the submission tests.
    const form = await services.forms.create({
      name: "Lead Capture",
      fields: [
        { id: "name", kind: "text", label: "Name", required: true, validation: { minLength: 2 } },
        { id: "email", kind: "email", label: "Email", required: true },
        { id: "phone", kind: "phone", label: "Phone", required: false },
        { id: "size", kind: "select", label: "Company size", required: true,
          options: [
            { value: "small", label: "1-10" },
            { value: "medium", label: "11-50" },
            { value: "large", label: "50+" },
          ] },
      ],
      submitAction: {
        kind: "external-webhook",
        webhookUrl: "https://example.com/webhook",
        notifyEmails: ["sales@smoke-forms.test"],
      },
    }, ACTOR);
    formId = form.id;
    await services.forms.publish(formId, ACTOR);

    // Missing required → validation error.
    const missing = await services.submissions.record({
      formId,
      values: { name: "Alice" },          // email missing
    });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.ok(missing.errors.some(e => e.fieldId === "email"));

    // Invalid email → validation error.
    const badEmail = await services.submissions.record({
      formId,
      values: { name: "Alice", email: "not-an-email", size: "small" },
    });
    assert.equal(badEmail.ok, false);

    // Invalid select option → validation error.
    const badSelect = await services.submissions.record({
      formId,
      values: { name: "Alice", email: "alice@smoke-forms.test", size: "ginormous" },
    });
    assert.equal(badSelect.ok, false);

    // Validation events fire.
    const validationEvents = world.inspect.events.filter(e => e.name === "forms.submission.validation_failed");
    assert.ok(validationEvents.length >= 3);

    // Happy path.
    const ok = await services.submissions.record({
      formId,
      values: { name: "Alice", email: "alice@smoke-forms.test", size: "small" },
      meta: { ip: "10.0.0.1", userAgent: "node-test" },
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.duplicate, false);
    assert.equal(ok.submission.status, "pending");
    assert.equal(ok.submission.values.email, "alice@smoke-forms.test");

    // submission count bumped on the form.
    const f = await services.forms.get(formId);
    assert.equal(f?.submissionCount, 1);
  });

  test("step 3: idempotent double-submission collapse", async () => {
    // Re-submit the exact same values — should collapse onto the prior id.
    const replay = await services.submissions.record({
      formId,
      values: { name: "Alice", email: "alice@smoke-forms.test", size: "small" },
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.duplicate, true, "duplicate=true on collapsed submit");

    // submissionCount should NOT bump on collapsed re-submit.
    const f = await services.forms.get(formId);
    assert.equal(f?.submissionCount, 1);

    // Different values → fresh row.
    const fresh = await services.submissions.record({
      formId,
      values: { name: "Alice", email: "alice@smoke-forms.test", size: "medium" },
    });
    assert.equal(fresh.ok, true);
    if (!fresh.ok) return;
    assert.equal(fresh.duplicate, false);
    const f2 = await services.forms.get(formId);
    assert.equal(f2?.submissionCount, 2);
  });

  test("step 4: notification dispatch with EmailQueuePort wired", async () => {
    const form = (await services.forms.get(formId))!;
    const subs = await services.submissions.listForForm(formId);
    const recent = subs[0]!;
    const result = await services.notifications.dispatch(form, recent);
    assert.equal(result.ok, true);
    assert.equal(result.webhookFired, true);
    // notifyEmails has 1 recipient → 1 enqueued.
    assert.equal(result.emailsQueued, 1);
    assert.ok(world.inspect.enqueued.length >= 1);
    const last = world.inspect.enqueued.at(-1)!;
    assert.deepEqual(last.request.to, ["sales@smoke-forms.test"]);
    assert.match(last.request.subject, /Lead Capture/);

    // forms.notification.requested event emitted.
    const reqs = world.inspect.events.filter(e => e.name === "forms.notification.requested");
    assert.ok(reqs.length >= 1);
  });

  test("step 5: optional EmailQueuePort absent — graceful no-op", async () => {
    const w = buildWorld({ withEmailQueue: false });
    const s = containerWithDeps({
      agencyId: AGENCY_ID, clientId: CLIENT_ID,
      storage: w.storage,
      tenant: w.tenant, user: w.user,
      activity: w.activity, events: w.events,
      pluginInstalls: w.pluginInstalls,
      // emailQueue omitted
    });
    const form = await s.forms.create({
      name: "No-queue form",
      fields: [{ id: "email", kind: "email", label: "Email", required: true }],
      submitAction: {
        kind: "thank-you",
        thankYouMessage: "Thanks",
        notifyEmails: ["alerts@nowhere.test"],
      },
    }, ACTOR);
    await s.forms.publish(form.id, ACTOR);
    const recorded = await s.submissions.record({
      formId: form.id,
      values: { email: "lonely@smoke.test" },
    });
    assert.equal(recorded.ok, true);
    if (!recorded.ok) return;

    const result = await s.notifications.dispatch(form, recorded.submission);
    assert.equal(result.ok, true);
    // Webhook NOT fired (action.kind === "thank-you" + no webhookUrl).
    assert.equal(result.webhookFired, false);
    // Emails NOT queued because port absent — but event still fired.
    assert.equal(result.emailsQueued, 0);
    assert.equal(w.inspect.enqueued.length, 0);
    const reqs = w.inspect.events.filter(e => e.name === "forms.notification.requested");
    assert.equal(reqs.length, 1);
  });

  test("step 6: instantiate form from template", async () => {
    const tpls = await services.templates.list();
    const newsletter = tpls.find(t => t.name === "Newsletter Signup")!;
    const form = await services.forms.create({
      name: newsletter.name,
      description: newsletter.description,
      fields: newsletter.fields,
      submitAction: newsletter.submitAction,
    }, ACTOR);
    assert.equal(form.fields.length, newsletter.fields.length);
    assert.equal(form.status, "draft");
  });

  test("step 7: side-effects — activity + event bus", async () => {
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, limit: 200 });
    const actions = log.map(e => e.action);
    assert.ok(actions.includes("forms.template.created"));
    assert.ok(actions.includes("forms.form.created"));
    assert.ok(actions.includes("forms.form.published"));
    assert.ok(actions.includes("forms.form.archived"));
    assert.ok(actions.includes("forms.submission.created"));
    assert.ok(actions.includes("forms.notification.requested"));

    const eventNames = world.inspect.events.map(e => e.name);
    assert.ok(eventNames.includes("forms.template.created"));
    assert.ok(eventNames.includes("forms.form.created"));
    assert.ok(eventNames.includes("forms.form.published"));
    assert.ok(eventNames.includes("forms.submission.created"));
    assert.ok(eventNames.includes("forms.submission.validation_failed"));
    assert.ok(eventNames.includes("forms.notification.requested"));
  });
});
