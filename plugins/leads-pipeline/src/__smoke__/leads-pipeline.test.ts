// Self-contained smoke for the leads-pipeline plugin.
//
// Runs an in-memory foundation (storage / activity / events / pipeline /
// emailEnqueue stubs), exercises:
//   - Lead upsert + idempotent merge
//   - CSV parser column variants (Email/email/E-mail, Phone/Mobile/Tel,
//     Company/Organisation, Tags, Source, Notes)
//   - CSV import idempotent re-import
//   - CSV import skip-on-missing-email
//   - AudienceFilter resolution (tag, source, notContactedSince, pipelineColumn)
//   - Campaign create + send happy path (uses stub EmailEnqueuePort,
//     asserts one enqueue per resolved lead + sentCount stamped)
//   - Campaign send fails when no EmailEnqueuePort wired
//   - public-funnel.lead.captured subscriber → Lead row created
//   - Lead → Contact promotion via pipelines.card.moved → toColumn "Won"
//   - Lead promotion is idempotent
//   - LeadCard projection shape
//
// Run: `npm run smoke` from the plugin folder.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  PluginInstall,
  PluginInstallScope,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  AddLeadCardInput,
  EmailEnqueueInput,
  EmailEnqueuePort,
  EventBusPort,
  PipelinePort,
  PluginInstallStorePort,
  TenantPort,
} from "../server/ports";
import { buildLeadsPipelineContainer } from "../server/index";
import {
  EVENT_SUBSCRIPTIONS,
  handleFunnelLeadCaptured,
  handlePipelineCardMoved,
} from "../server/subscribers";
import { parseCsv } from "../server/csv";
import { LeadService } from "../server/leads";
import { CSV_COLUMN_VARIANTS, projectLeadCard } from "../lib/domain";

const AGENCY_ID: AgencyId = "agency_leads_smoke";
const ACTOR = "user_leads_smoke";

function buildWorld(opts: { withEmail?: boolean; withPipeline?: boolean } = {}) {
  const agency: Agency = {
    id: AGENCY_ID,
    name: "Smoke Leads Agency",
    slug: "smoke-leads",
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 0,
    updatedAt: 0,
  };
  const data: Record<string, unknown> = {};
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const enqueued: EmailEnqueueInput[] = [];
  let nextId = 1;

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return data[key] as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      data[key] = value;
    },
    async del(key: string): Promise<void> {
      delete data[key];
    },
    async list(prefix?: string): Promise<string[]> {
      const keys = Object.keys(data);
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };

  const tenant: TenantPort = {
    getAgency: id => (id === AGENCY_ID ? agency : null),
  };

  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(nextId++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId,
        clientId: input.clientId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        category: input.category,
        action: input.action,
        message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) {
      let entries = activityLog.filter(e => e.agencyId === filter.agencyId);
      if (filter.clientId) entries = entries.filter(e => e.clientId === filter.clientId);
      const limit = filter.limit ?? entries.length;
      return entries.slice(-limit).reverse();
    },
  };

  const eventBus: EventBusPort = {
    emit(_scope, name, payload) {
      events.push({ name, payload });
    },
  };

  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null {
      return null;
    },
  };

  const emailEnqueue: EmailEnqueuePort | undefined = opts.withEmail
    ? {
        enqueue(input) {
          enqueued.push(input);
          return { messageId: `msg_${enqueued.length}` };
        },
      }
    : undefined;

  // Stub pipeline: tracks (leadId → columnLabel). addLeadCard puts the
  // lead in "New". Tests can mutate `pipelineColumn` to simulate moves.
  const pipelineColumn = new Map<string, string>();
  const pipeline: PipelinePort | undefined = opts.withPipeline
    ? {
        addLeadCard(input: AddLeadCardInput) {
          pipelineColumn.set(input.leadId, input.columnId ?? "New");
          return {
            cardId: `card_${input.leadId}`,
            pipelineId: "pipe_leads",
            columnId: "col_new",
          };
        },
        leadIdsInColumn({ columnLabel }) {
          const ids: string[] = [];
          for (const [leadId, col] of pipelineColumn.entries()) {
            if (col === columnLabel) ids.push(leadId);
          }
          return ids;
        },
        columnLabelForLead({ leadId }) {
          return pipelineColumn.get(leadId) ?? null;
        },
      }
    : undefined;

  return {
    storage, tenant, activity, eventBus, pluginInstalls,
    emailEnqueue, pipeline, pipelineColumn,
    activityLog, events, enqueued,
  };
}

// ─── 1. Domain + CSV ─────────────────────────────────────────────────────

describe("leads-pipeline / CSV parser", () => {
  test("recognises Email / email / E-mail variants", () => {
    for (const header of ["Email", "email", "E-mail", "MAIL", "Email Address"]) {
      const r = parseCsv(`${header}\nfoo@bar.com\n`);
      assert.equal("email" in r.headerVariants, true, `header ${header} should map to email`);
    }
  });

  test("recognises Phone / Mobile / Tel / Cell variants", () => {
    const r = parseCsv("email,Mobile,Tel,Cell\nfoo@bar.com,+1,+2,+3\n");
    assert.equal("phone" in r.headerVariants, true);
  });

  test("splits tag column on ; | and on , inside quoted cell", () => {
    // Unquoted commas are CSV field separators; the tags cell must be
    // quoted to embed them. Bare ; and | always split.
    const r = parseCsv(`email,tags\nfoo@bar.com,"a;b|c,d"\n`);
    assert.deepEqual(r.rows[0]?.tags, ["a", "b", "c", "d"]);
  });

  test("handles quoted fields with embedded commas", () => {
    const r = parseCsv(`email,company\n"x@y.com","Acme, Inc."\n`);
    assert.equal(r.rows[0]?.company, "Acme, Inc.");
  });

  test("strips UTF-8 BOM", () => {
    const r = parseCsv("﻿Email\nfoo@bar.com\n");
    assert.equal("email" in r.headerVariants, true);
  });

  test("flags unrecognised headers", () => {
    const r = parseCsv("email,FooBar\nfoo@bar.com,zz\n");
    assert.deepEqual(r.unrecognisedHeaders, ["foobar"]);
  });

  test("CSV_COLUMN_VARIANTS lookups are lowercased", () => {
    // Sanity — tablekeys must be lowercase so parseCsv lookups hit.
    for (const k of Object.keys(CSV_COLUMN_VARIANTS)) {
      assert.equal(k, k.toLowerCase(), `CSV variant key ${k} must be lowercase`);
    }
  });
});

// ─── 2. LeadService + CSV import ─────────────────────────────────────────

describe("leads-pipeline / LeadService", () => {
  test("upsert creates new lead", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "a@b.com", source: "manual" }, ACTOR);
    assert.equal(r.created, true);
    assert.equal(r.lead.email, "a@b.com");
  });

  test("upsert idempotent on canonical email", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.leads.upsert({ email: "Foo@Bar.COM", source: "manual" }, ACTOR);
    const second = await c.leads.upsert({ email: "foo@bar.com", source: "manual" }, ACTOR);
    assert.equal(second.created, false);
    const all = await c.leads.list();
    assert.equal(all.length, 1);
  });

  test("CSV import — happy path", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const csv = "Email,Name,Mobile,Company,Tags\nalice@x.com,Alice,123,Acme,vip;newsletter\nbob@x.com,Bob,456,Beta,cold\n";
    const r = await c.leads.importCsv({ text: csv, filename: "test.csv", actor: ACTOR });
    assert.equal(r.imported, 2);
    assert.equal(r.skipped, 0);
    const list = await c.leads.list();
    assert.equal(list.length, 2);
    const alice = list.find(l => l.email === "alice@x.com");
    assert.deepEqual(alice?.tags, ["vip", "newsletter"]);
    assert.equal(alice?.phone, "123");
  });

  test("CSV import — idempotent re-import", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const csv = "email\nalice@x.com\nbob@x.com\n";
    const r1 = await c.leads.importCsv({ text: csv, actor: ACTOR });
    const r2 = await c.leads.importCsv({ text: csv, actor: ACTOR });
    assert.equal(r1.imported, 2);
    assert.equal(r2.imported, 0);
    assert.equal(r2.updated, 2);
    const list = await c.leads.list();
    assert.equal(list.length, 2);
  });

  test("CSV import — skip rows missing email", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const csv = "email,name\nalice@x.com,Alice\n,No Email\n";
    const r = await c.leads.importCsv({ text: csv, actor: ACTOR });
    assert.equal(r.imported, 1);
    assert.equal(r.skipped, 1);
    assert.equal(r.errors[0]?.reason, "missing_email");
  });

  test("CSV import — missing email column reports csv_missing_email_column", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.importCsv({ text: "name\nAlice\n", actor: ACTOR });
    assert.equal(r.imported, 0);
    assert.equal(r.errors[0]?.reason, "csv_missing_email_column");
  });

  test("LeadCard projection shape", () => {
    const card = projectLeadCard({
      id: "lead_x", agencyId: AGENCY_ID, email: "a@b.com",
      name: "A", company: "Acme", tags: [], source: "manual",
      capturedAt: 0,
    });
    assert.equal(card.leadId, "lead_x");
    assert.equal(card.email, "a@b.com");
    assert.equal(card.source, "manual");
    assert.equal(LeadService.projectLeadCard, projectLeadCard);
  });
});

// ─── 3. AudienceFilter ───────────────────────────────────────────────────

describe("leads-pipeline / AudienceFilter", () => {
  test("filter by tag", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    await c.leads.upsert({ email: "b@x.com", source: "manual", tags: ["cold"] }, ACTOR);
    const out = await c.leads.resolveAudience({ tags: ["vip"] });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.email, "a@x.com");
  });

  test("filter by source", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.leads.upsert({ email: "a@x.com", source: "csv:may.csv" }, ACTOR);
    await c.leads.upsert({ email: "b@x.com", source: "public-funnel" }, ACTOR);
    const out = await c.leads.resolveAudience({ sourcedFrom: ["public-funnel"] });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.email, "b@x.com");
  });

  test("filter by pipelineColumn through PipelinePort", async () => {
    const w = buildWorld({ withPipeline: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      pipeline: w.pipeline,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual" }, ACTOR);
    await c.leads.upsert({ email: "b@x.com", source: "manual" }, ACTOR);
    // Move b@x.com to "Qualified"
    const list = await c.leads.list();
    const b = list.find(l => l.email === "b@x.com");
    if (b) w.pipelineColumn.set(b.id, "Qualified");
    const out = await c.leads.resolveAudience({ pipelineColumn: "Qualified" });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.email, "b@x.com");
  });
});

// ─── 4. Campaign send ────────────────────────────────────────────────────

describe("leads-pipeline / Campaign.send", () => {
  test("happy path enqueues one email per audience lead", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    await c.leads.upsert({ email: "b@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    await c.leads.upsert({ email: "c@x.com", source: "manual", tags: ["cold"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "May blast", subject: "Hi", bodyHtml: "<p>Hey</p>",
      audienceFilter: { tags: ["vip"] },
    }, ACTOR);
    const sent = await c.campaigns.send(camp.id, ACTOR);
    assert.equal(sent.status, "sent");
    assert.equal(sent.recipients, 2);
    assert.equal(sent.sentCount, 2);
    assert.equal(w.enqueued.length, 2);
    assert.equal(w.enqueued[0]?.triggeredByPlugin, "@aqua/plugin-leads-pipeline");
    // sentCount stamped on Lead
    const aLead = await c.leads.getByEmail("a@x.com");
    assert.equal(aLead?.sentCount, 1);
    assert.ok((aLead?.lastContactedAt ?? 0) > 0);
  });

  test("send fails when EmailEnqueuePort missing", async () => {
    const w = buildWorld(); // no email
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const camp = await c.campaigns.create({
      name: "X", subject: "Hi", bodyHtml: "<p>x</p>",
      audienceFilter: {},
    }, ACTOR);
    await assert.rejects(() => c.campaigns.send(camp.id, ACTOR), /email-sender not wired/);
  });

  test("send is non-replayable on a sent campaign", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual" }, ACTOR);
    const camp = await c.campaigns.create({
      name: "X", subject: "Hi", bodyHtml: "<p>x</p>", audienceFilter: {},
    }, ACTOR);
    await c.campaigns.send(camp.id, ACTOR);
    await assert.rejects(() => c.campaigns.send(camp.id, ACTOR), /already sent/);
  });
});

// ─── 5. Subscribers ──────────────────────────────────────────────────────

describe("leads-pipeline / subscribers", () => {
  test("EVENT_SUBSCRIPTIONS includes both wires", () => {
    assert.deepEqual(
      [...EVENT_SUBSCRIPTIONS],
      ["public-funnel.lead.captured", "pipelines.card.moved"],
    );
  });

  test("public-funnel.lead.captured creates Lead row", async () => {
    const w = buildWorld({ withPipeline: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      pipeline: w.pipeline,
    });
    await handleFunnelLeadCaptured(c.leads, {
      agencyId: AGENCY_ID,
      email: "captured@x.com",
      name: "Captured Name",
      source: "public-funnel",
    });
    const list = await c.leads.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.email, "captured@x.com");
    assert.equal(list[0]?.tags.includes("public-funnel"), true);
    // Pipeline card was placed
    assert.ok(list[0]?.pipelineCardId);
  });

  test("pipelines.card.moved → Won promotes Lead to Customer Contact", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "won@x.com", source: "manual", name: "Won" }, ACTOR);
    await handlePipelineCardMoved(c.leads, c.contacts, {
      cardId: "card_x",
      cardKind: "lead",
      leadId: r.lead.id,
      fromColumn: "Qualified",
      toColumn: "Won",
    });
    const contacts = await c.contacts.list();
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0]?.type, "customer");
    assert.equal(contacts[0]?.promotedFromLeadId, r.lead.id);
  });

  test("Lead→Contact promotion is idempotent", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "won@x.com", source: "manual" }, ACTOR);
    const move = {
      cardId: "card_x",
      cardKind: "lead" as const,
      leadId: r.lead.id,
      fromColumn: "Qualified",
      toColumn: "Won",
    };
    await handlePipelineCardMoved(c.leads, c.contacts, move);
    await handlePipelineCardMoved(c.leads, c.contacts, move);
    const contacts = await c.contacts.list();
    assert.equal(contacts.length, 1);
  });

  test("non-Won column moves do not promote", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "stay@x.com", source: "manual" }, ACTOR);
    await handlePipelineCardMoved(c.leads, c.contacts, {
      cardId: "card_x", cardKind: "lead", leadId: r.lead.id,
      fromColumn: "New", toColumn: "Qualified",
    });
    const contacts = await c.contacts.list();
    assert.equal(contacts.length, 0);
  });
});
