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
import { parseCsv, parseXlsxToDelimitedText } from "../server/csv";
import { LeadIdentityConflictError, LeadService } from "../server/leads";
import { CommercialAcceptanceStateError, CommercialPaymentConflictError } from "../server/commercial";
import { CSV_COLUMN_VARIANTS, installmentAllocation, projectLeadCard } from "../lib/domain";

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
    async setIfAbsent<T = unknown>(key: string, value: T): Promise<boolean> {
      if (Object.prototype.hasOwnProperty.call(data, key)) return false;
      data[key] = value;
      return true;
    },
    async runExclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
      return operation();
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

  // Delivery outcome the stub provider reports back from `send()`. Tests flip this
  // to simulate an explicit provider refusal ("failed") or a provider that only
  // accepts the message into its queue without confirming delivery ("queued").
  const emailDelivery: {
    mode: "delivered" | "queued" | "failed";
    error?: string;
    code?: string;
    // Addresses that always come back refused, whatever the global mode —
    // lets one blast contain both a delivery and a failure.
    failRecipients: Set<string>;
  } = { mode: "delivered", failRecipients: new Set() };
  const emailEnqueue: EmailEnqueuePort | undefined = opts.withEmail
    ? {
        enqueue(input) {
          enqueued.push(input);
          return { messageId: `msg_${enqueued.length}` };
        },
        send(input) {
          enqueued.push(input);
          const messageId = `msg_${enqueued.length}`;
          const recipients = Array.isArray(input.to) ? input.to : [input.to];
          if (recipients.some(address => emailDelivery.failRecipients.has(address))) {
            return { messageId, delivered: false, error: "Mailbox rejected the recipient." };
          }
          // The email-sender adapter returns no verdict at all when it could
          // only enqueue — that is "queued", never a delivery.
          if (emailDelivery.mode === "queued") {
            return emailDelivery.code
              ? { messageId, delivered: false, error: emailDelivery.error, code: emailDelivery.code }
              : { messageId };
          }
          if (emailDelivery.mode === "failed") {
            return {
              messageId,
              delivered: false,
              error: emailDelivery.error ?? "Mailbox rejected the recipient.",
              code: emailDelivery.code,
            };
          }
          return { messageId, delivered: true };
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
    activityLog, events, enqueued, emailDelivery,
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

  test("handles tab-delimited sheet exports", () => {
    const r = parseCsv("Email\tName\tPhone\tCompany\tTags\nsheet@x.com\tSheet Lead\t123\tSheets Ltd\twarm|meeting\n");
    assert.equal("email" in r.headerVariants, true);
    assert.equal(r.rows[0]?.email, "sheet@x.com");
    assert.equal(r.rows[0]?.name, "Sheet Lead");
    assert.equal(r.rows[0]?.phone, "123");
    assert.equal(r.rows[0]?.company, "Sheets Ltd");
    assert.deepEqual(r.rows[0]?.tags, ["warm", "meeting"]);
  });

  test("converts simple XLSX first sheets to importable tab text", () => {
    const workbook = buildTinyXlsx([
      ["Email", "Name", "Phone", "Company", "Tags", "Source", "Notes"],
      ["xlsx@x.com", "Xlsx Lead", "777", "Workbook Ltd", "warm;sheet", "xlsx-upload", "Opened from Excel"],
    ]);
    const text = parseXlsxToDelimitedText(workbook);
    const r = parseCsv(text);
    assert.equal("email" in r.headerVariants, true);
    assert.equal(r.rows[0]?.email, "xlsx@x.com");
    assert.equal(r.rows[0]?.name, "Xlsx Lead");
    assert.equal(r.rows[0]?.phone, "777");
    assert.equal(r.rows[0]?.company, "Workbook Ltd");
    assert.deepEqual(r.rows[0]?.tags, ["warm", "sheet"]);
    assert.equal(r.rows[0]?.source, "xlsx-upload");
    assert.equal(r.rows[0]?.notes, "Opened from Excel");
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

function buildTinyXlsx(rows: string[][]): Buffer {
  const shared = rows.flat();
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map(value => `<si><t>${escapeXml(value)}</t></si>`).join("")}
</sst>`;
  let sharedIndex = 0;
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((_value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="s"><v>${sharedIndex++}</v></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;

  return buildZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": sharedStringsXml,
    "xl/worksheets/sheet1.xml": sheetXml,
  });
}

function buildZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...localParts, central, end]);
}

function columnName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  test("upsert adds a lead card when the pipeline port is wired", async () => {
    const w = buildWorld({ withPipeline: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      pipeline: w.pipeline,
    });
    const r = await c.leads.upsert({ email: "board@x.com", source: "manual", name: "Board Lead" }, ACTOR);
    assert.equal(r.created, true);
    const updated = await c.leads.get(r.lead.id);
    assert.equal(updated?.pipelineCardId, `card_${r.lead.id}`);
    assert.equal(w.pipelineColumn.get(r.lead.id), "New");
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

  test("identity edits refuse another lead's canonical email and phone", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const alpha = await c.leads.upsert({
      email: "alpha@example.com",
      phone: "+44 7700 900111",
      source: "manual",
    }, ACTOR);
    const bravo = await c.leads.upsert({
      email: "bravo@example.com",
      phone: "+44 7700 900222",
      source: "manual",
    }, ACTOR);

    await assert.rejects(
      () => c.leads.update(bravo.lead.id, { email: "  ALPHA@example.com " }, ACTOR),
      (error: unknown) => error instanceof LeadIdentityConflictError && error.field === "email",
    );
    await assert.rejects(
      () => c.leads.update(bravo.lead.id, { phone: "+44 (7700) 900111" }, ACTOR),
      (error: unknown) => error instanceof LeadIdentityConflictError && error.field === "phone",
    );
    assert.equal((await c.leads.getByEmail("alpha@example.com"))?.id, alpha.lead.id);
    assert.equal((await c.leads.getByEmail("bravo@example.com"))?.id, bravo.lead.id);
    assert.equal((await c.leads.get(bravo.lead.id))?.phone, "+44 7700 900222");
  });

  test("two simultaneous identity edits cannot claim the same new email", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const alpha = await c.leads.upsert({ email: "race-alpha@example.com", source: "manual" }, ACTOR);
    const bravo = await c.leads.upsert({ email: "race-bravo@example.com", source: "manual" }, ACTOR);
    const results = await Promise.allSettled([
      c.leads.update(alpha.lead.id, { email: "shared@example.com" }, ACTOR),
      c.leads.update(bravo.lead.id, { email: "SHARED@example.com" }, ACTOR),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof LeadIdentityConflictError);
    const owner = await c.leads.getByEmail("shared@example.com");
    assert.ok(owner);
    assert.equal((await c.leads.list()).filter(lead => lead.email === "shared@example.com").length, 1);
    const loserId = owner?.id === alpha.lead.id ? bravo.lead.id : alpha.lead.id;
    const loserOriginal = loserId === alpha.lead.id ? "race-alpha@example.com" : "race-bravo@example.com";
    assert.equal((await c.leads.getByEmail(loserOriginal))?.id, loserId);
  });

  test("simultaneous upserts of one canonical email converge on one lead", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const [first, second] = await Promise.all([
      c.leads.upsert({ email: "same@example.com", source: "import:first" }, ACTOR),
      c.leads.upsert({ email: " SAME@example.com ", source: "import:second" }, ACTOR),
    ]);
    assert.equal(first.lead.id, second.lead.id);
    assert.equal([first.created, second.created].filter(Boolean).length, 1);
    assert.equal((await c.leads.list()).length, 1);
  });

  test("upsert accepts and deduplicates phone-only website enquiries", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const first = await c.leads.upsert({
      email: "",
      phone: "+44 7700 900123",
      source: "website:edward-hallam",
    }, ACTOR);
    const second = await c.leads.upsert({
      email: "",
      phone: "+44 (7700) 900123",
      source: "website:edward-hallam",
    }, ACTOR);

    assert.equal(first.created, true);
    assert.equal(first.lead.email, "");
    assert.equal(first.lead.phone, "+44 7700 900123");
    assert.equal(second.created, false);
    assert.equal((await c.leads.list()).length, 1);
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

  test("CSV import — explicit mapping keeps custom fields", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const csv = "Contact Email,Person,Interested In,Choices\nmapped@x.com,Mapping Test,Photography,\"Website;Branding\"\n";
    const result = await c.leads.importCsv({
      text: csv,
      actor: ACTOR,
      mapping: {
        "0": "email",
        "1": "name",
        "2": "custom:service-interest",
        "3": "custom:deliverables",
      },
      customFieldTypes: {
        "service-interest": "select",
        deliverables: "multi-select",
      },
    });
    assert.equal(result.imported, 1);
    const lead = await c.leads.getByEmail("mapped@x.com");
    assert.equal(lead?.name, "Mapping Test");
    assert.equal(lead?.customFields?.["service-interest"], "Photography");
    assert.deepEqual(lead?.customFields?.deliverables, ["Website", "Branding"]);
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

  test("update saves lead details and meeting fields", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "manage@x.com", source: "manual" }, ACTOR);
    const meeting = Date.UTC(2026, 6, 24, 12, 30);
    const contactedAt = Date.UTC(2026, 6, 24, 13, 0);
    const updated = await c.leads.update(r.lead.id, {
      name: "Managed Lead",
      phone: "07123",
      company: "Managed Co",
      tags: ["warm", "meeting-booked"],
      notes: "Call about website rebuild.",
      lastContactedAt: contactedAt,
      nextMeetingAt: meeting,
      meetingNotes: "Discovery call",
      meetingMode: "google-meet",
      meetingLink: "https://meet.google.com/abc-defg-hij",
      meetingStatus: "confirmed",
      meetingConfirmedAt: contactedAt,
      meetingReminderAt: meeting - 24 * 60 * 60 * 1000,
      meetingAttempts: [{
        id: "attempt_test",
        at: contactedAt,
        channel: "email",
        outcome: "reminder-sent",
        notes: "Confirmation sent manually.",
      }],
      salesPresentations: [{
        id: "presentation_test",
        title: "Website proposal",
        url: "https://docs.example.com/website-proposal",
      }],
    }, ACTOR);
    assert.equal(updated?.name, "Managed Lead");
    assert.equal(updated?.phone, "07123");
    assert.deepEqual(updated?.tags, ["warm", "meeting-booked"]);
    assert.equal(updated?.lastContactedAt, contactedAt);
    assert.equal(updated?.nextMeetingAt, meeting);
    assert.equal(updated?.meetingNotes, "Discovery call");
    assert.equal(updated?.meetingMode, "google-meet");
    assert.equal(updated?.meetingStatus, "confirmed");
    assert.equal(updated?.meetingConfirmedAt, contactedAt);
    assert.equal(updated?.meetingAttempts?.[0]?.outcome, "reminder-sent");
    assert.equal(updated?.salesPresentations?.[0]?.title, "Website proposal");
  });

  // Rewritten with issue #62: `delete()` became `purge()`, and `archive()` is
  // now the reversible thing the button always claimed to be.
  test("archive takes the lead off the active list but keeps the record", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "archive@x.com", source: "manual" }, ACTOR);
    assert.ok(await c.leads.archive(r.lead.id, ACTOR));
    assert.equal((await c.leads.list()).length, 0, "an archived lead is still on the active board");
    assert.ok(await c.leads.get(r.lead.id), "the record was destroyed by an archive");
    assert.equal((await c.leads.list({ archived: "only" })).length, 1);
    assert.equal(w.events.some(e => e.name === "leads.lead.archived"), true);
  });

  test("purge is the permanent one, and says so", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "purge@x.com", source: "manual" }, ACTOR);
    assert.equal(await c.leads.purge(r.lead.id, ACTOR), true);
    assert.equal(await c.leads.get(r.lead.id), null);
    assert.equal((await c.leads.list({ archived: "include" })).length, 0);
    assert.equal(w.events.some(e => e.name === "leads.lead.purged"), true);
  });
});

// ─── 3. Contact management ───────────────────────────────────────────────

describe("leads-pipeline / ContactService", () => {
  test("update saves contact details and booked meeting", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const created = await c.contacts.upsert({
      email: "contact@x.com",
      type: "lead",
      source: "manual",
    }, ACTOR);
    const meeting = Date.UTC(2026, 7, 1, 9, 0);
    const updated = await c.contacts.update(created.contact.id, {
      name: "Contact Person",
      phone: "07999",
      company: "Contact Ltd",
      type: "customer",
      tags: ["converted", "support"],
      notes: "Ready for portal setup.",
      nextMeetingAt: meeting,
      meetingNotes: "Portal onboarding",
      meetingMode: "google-meet",
      meetingLocation: "Remote",
      meetingStatus: "confirmed",
      meetingConfirmedAt: meeting - 86_400_000,
      meetingReminderAt: meeting - 3_600_000,
      meetingAttempts: [{
        id: "attempt_contact_test",
        at: meeting - 86_400_000,
        channel: "email",
        outcome: "reached",
        notes: "Time agreed.",
      }],
    }, ACTOR);
    assert.equal(updated?.name, "Contact Person");
    assert.equal(updated?.type, "customer");
    assert.deepEqual(updated?.tags, ["converted", "support"]);
    assert.equal(updated?.nextMeetingAt, meeting);
    assert.equal(updated?.meetingNotes, "Portal onboarding");
    assert.equal(updated?.meetingMode, "google-meet");
    assert.equal(updated?.meetingStatus, "confirmed");
    assert.equal(updated?.meetingAttempts?.[0]?.outcome, "reached");
  });

  test("stampLastContactedAt tracks one-off calls and emails", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const created = await c.contacts.upsert({
      email: "called@x.com",
      type: "lead",
      source: "manual",
    }, ACTOR);
    const contactedAt = Date.UTC(2026, 7, 2, 10, 15);
    const updated = await c.contacts.stampLastContactedAt(created.contact.id, contactedAt);
    assert.equal(updated?.lastContactedAt, contactedAt);
  });

  test("contact can be marked customer when converted to client", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const created = await c.contacts.upsert({
      email: "convert-contact@x.com",
      type: "lead",
      source: "manual",
      tags: ["warm"],
    }, ACTOR);
    const updated = await c.contacts.update(created.contact.id, {
      type: "customer",
      tags: Array.from(new Set([...created.contact.tags, "converted"])),
      lastContactedAt: Date.UTC(2026, 7, 3, 11, 0),
    }, ACTOR);
    assert.equal(updated?.type, "customer");
    assert.deepEqual(updated?.tags, ["warm", "converted"]);
    assert.ok((updated?.lastContactedAt ?? 0) > 0);
  });
});

describe("leads-pipeline / commercial packs", () => {
  test("meeting invoice and agreement remain editable, send, accept, and record idempotent payments", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    const lead = await c.leads.upsert({
      email: "buyer@example.test",
      name: "Buyer",
      company: "Buyer Ltd",
      source: "meeting",
    }, ACTOR);
    const draft = await c.commercial.save({
      partyKind: "lead",
      partyId: lead.lead.id,
      recipientName: "Buyer",
      recipientEmail: lead.lead.email,
      lineItems: [{ description: "Website build", quantity: 1, unitCents: 120_000 }],
      taxCents: 24_000,
      currency: "gbp",
      dueAt: Date.now() + 7 * 86_400_000,
      billingCadence: "installments",
      installmentCount: 3,
      serviceLevel: "Website launch",
      agreementTitle: "Service level agreement",
      agreementBody: "Milesymedia will design and build the agreed website.",
    }, ACTOR);
    assert.equal(draft.totalCents, 144_000);
    assert.match(draft.invoiceNumber, /^MM-\d{4}-\d{4}$/);

    const amended = await c.commercial.save({
      partyKind: "lead",
      partyId: lead.lead.id,
      recipientName: "Buyer",
      recipientEmail: lead.lead.email,
      lineItems: [{ description: "Website build and photography", quantity: 1, unitCents: 150_000 }],
      taxCents: 30_000,
      currency: "gbp",
      dueAt: draft.dueAt,
      billingCadence: "installments",
      installmentCount: 3,
      serviceLevel: "Website and photography",
      agreementTitle: "Service level agreement",
      agreementBody: "Milesymedia will deliver the agreed website and photography.",
    }, ACTOR);
    assert.equal(amended.invoiceNumber, draft.invoiceNumber);
    assert.equal(amended.totalCents, 180_000);

    const sent = await c.commercial.send("lead", lead.lead.id, "https://milesymedia.test", ACTOR);
    assert.equal(sent.invoiceStatus, "sent");
    assert.equal(sent.agreementStatus, "sent");
    assert.equal(sent.deliveryStatus, "delivered");
    assert.ok((sent.sentAt ?? 0) > 0);
    assert.equal(sent.deliveryError, undefined);
    assert.equal(w.enqueued.length, 1);
    assert.match(w.enqueued[0]?.bodyText ?? "", /proposal\//);

    const accepted = await c.commercial.accept(sent.publicToken, "Buyer");
    assert.equal(accepted?.agreementStatus, "accepted");

    const partPaid = await c.commercial.recordPayment("lead", lead.lead.id, {
      amountCents: 60_000,
      method: "bank-transfer",
      reference: "BANK-001",
    }, ACTOR);
    assert.equal(partPaid?.payments.length, 1);
    assert.equal(partPaid?.invoiceStatus, "sent");

    const duplicate = await c.commercial.recordPayment("lead", lead.lead.id, {
      amountCents: 60_000,
      method: "bank-transfer",
      reference: "BANK-001",
    }, ACTOR);
    assert.equal(duplicate?.payments.length, 1);

    const paid = await c.commercial.recordPayment("lead", lead.lead.id, {
      amountCents: 120_000,
      method: "cash",
      reference: "CASH-002",
    }, ACTOR);
    assert.equal(paid?.invoiceStatus, "paid");
    assert.equal(paid?.payments.length, 2);
    assert.ok(paid?.payments.every(payment =>
      payment.receiptDeliveryStatus === "delivered" && (payment.receiptSentAt ?? 0) > 0));
    assert.ok(w.activityLog.some(entry => entry.action === "commercial.payment.recorded"));
    assert.ok(w.events.some(event => event.name === "commercial.payment.recorded"));
  });

  // ── Acceptance is bound to an immutable sent version (issues #41) ──
  //
  // The public token is minted at the FIRST draft save, so holding the link has
  // never been the same as being offered the terms. These three tests pin the
  // three halves of that: a draft cannot be signed, an acceptance names the exact
  // version it covers and never migrates onto later wording, and a payment
  // session cannot outlive the amounts it was priced for.
  const versionedTerms = (partyId: string, overrides: Partial<Parameters<
    ReturnType<typeof buildLeadsPipelineContainer>["commercial"]["save"]>[0]> = {}) => ({
    partyKind: "lead" as const,
    partyId,
    recipientName: "Buyer",
    recipientEmail: `${partyId}@example.test`,
    lineItems: [{ description: "Retainer", quantity: 1, unitCents: 100_000 }],
    taxCents: 0,
    currency: "gbp" as const,
    dueAt: Date.UTC(2026, 8, 30),
    billingCadence: "one-off" as const,
    serviceLevel: "Retainer",
    agreementTitle: "Service level agreement",
    agreementBody: "Milesymedia will provide the retainer described above.",
    ...overrides,
  });

  test("a draft proposal cannot be accepted from its public link, and acceptance names the sent version", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    const draft = await c.commercial.save(versionedTerms("lead_version_gate"), ACTOR);
    assert.equal(draft.version, 1);
    assert.equal(draft.agreementStatus, "draft");
    assert.equal(draft.sentVersion, undefined);
    assert.ok(draft.publicToken);

    await assert.rejects(
      c.commercial.accept(draft.publicToken, "Buyer"),
      (error: unknown) => error instanceof CommercialAcceptanceStateError,
    );
    const stillDraft = await c.commercial.get("lead", "lead_version_gate");
    assert.equal(stillDraft?.agreementStatus, "draft");
    assert.equal(stillDraft?.acceptedAt, undefined);
    assert.equal(w.activityLog.some(entry => entry.action === "commercial.agreement.accepted"), false);

    const sent = await c.commercial.send("lead", "lead_version_gate", "https://milesymedia.test", ACTOR);
    assert.equal(sent.sentVersion, 1);

    const accepted = await c.commercial.accept(sent.publicToken, "Buyer Name");
    assert.equal(accepted?.agreementStatus, "accepted");
    assert.equal(accepted?.acceptedVersion, 1);
    assert.equal(accepted?.acceptedContentHash, sent.contentHash);
    assert.equal(accepted?.acceptedBy, "Buyer Name");
    assert.ok(w.activityLog.some(entry =>
      entry.action === "commercial.agreement.accepted" && /version 1/.test(entry.message)));

    // A repeat POST must not move the acceptance onto a later moment or name.
    const again = await c.commercial.accept(sent.publicToken, "Someone Else");
    assert.equal(again?.acceptedBy, "Buyer Name");
    assert.equal(again?.acceptedAt, accepted?.acceptedAt);
    assert.equal(again?.acceptedVersion, 1);
    assert.equal(w.activityLog.filter(entry => entry.action === "commercial.agreement.accepted").length, 1);
  });

  test("editing accepted terms supersedes them as an unsent draft and keeps the old acceptance whole", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.commercial.save(versionedTerms("lead_amend_after_accept"), ACTOR);
    const sent = await c.commercial.send("lead", "lead_amend_after_accept", "https://milesymedia.test", ACTOR);
    const accepted = await c.commercial.accept(sent.publicToken, "Buyer Name");
    assert.equal(accepted?.acceptedVersion, 1);

    // Re-saving the SAME terms is not an amendment: nothing the client read moved.
    const resaved = await c.commercial.save(versionedTerms("lead_amend_after_accept"), ACTOR);
    assert.equal(resaved.version, 1);
    assert.equal(resaved.agreementStatus, "accepted");
    assert.equal(resaved.acceptedVersion, 1);
    assert.equal(resaved.acceptedAt, accepted?.acceptedAt);
    assert.equal(resaved.revisions, undefined);

    const amended = await c.commercial.save(versionedTerms("lead_amend_after_accept", {
      agreementBody: "Milesymedia will provide the retainer and a materially wider scope.",
      lineItems: [{ description: "Retainer", quantity: 1, unitCents: 250_000 }],
    }), ACTOR);
    assert.equal(amended.version, 2);
    assert.equal(amended.totalCents, 250_000);
    assert.equal(amended.agreementStatus, "draft");
    assert.equal(amended.invoiceStatus, "draft");
    assert.equal(amended.acceptedAt, undefined);
    assert.equal(amended.acceptedBy, undefined);
    assert.equal(amended.acceptedVersion, undefined);
    assert.equal(amended.acceptedContentHash, undefined);
    assert.equal(amended.sentAt, undefined);
    assert.equal(amended.sentVersion, undefined);
    // The delivery record belongs to the version that was emailed. Version 2 has
    // never been emailed, so nothing may still say it was — the agency readiness
    // panel reads deliveryStatus for its "Invoice emailed" gap.
    assert.equal(amended.deliveryStatus, undefined);
    assert.equal(amended.deliveryAttemptedAt, undefined);
    assert.equal(amended.emailMessageId, undefined);
    assert.equal(amended.deliveryError, undefined);

    // The acceptance of version 1 is a fact about version 1 and survives intact.
    const superseded = amended.revisions?.at(-1);
    assert.equal(amended.revisions?.length, 1);
    assert.equal(superseded?.version, 1);
    assert.equal(superseded?.contentHash, accepted?.contentHash);
    assert.equal(superseded?.acceptedBy, "Buyer Name");
    assert.equal(superseded?.acceptedAt, accepted?.acceptedAt);
    assert.equal(superseded?.totalCents, 100_000);
    assert.ok(w.activityLog.some(entry =>
      entry.action === "commercial.amended" && /version 2/.test(entry.message)));

    // The new wording is not on offer until it is sent, so it cannot be accepted.
    await assert.rejects(
      c.commercial.accept(amended.publicToken, "Buyer Name"),
      (error: unknown) => error instanceof CommercialAcceptanceStateError,
    );
    assert.equal((await c.commercial.get("lead", "lead_amend_after_accept"))?.agreementStatus, "draft");

    // Sent again, version 2 can be accepted on its own terms.
    const resent = await c.commercial.send("lead", "lead_amend_after_accept", "https://milesymedia.test", ACTOR);
    assert.equal(resent.sentVersion, 2);
    const acceptedTwo = await c.commercial.accept(resent.publicToken, "Buyer Name");
    assert.equal(acceptedTwo?.acceptedVersion, 2);
    assert.equal(acceptedTwo?.acceptedContentHash, amended.contentHash);
    assert.notEqual(acceptedTwo?.acceptedContentHash, accepted?.acceptedContentHash);
  });

  test("changing what is payable detaches the Stripe session priced for the old terms", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    const draft = await c.commercial.save(versionedTerms("lead_stale_checkout"), ACTOR);
    const attached = await c.commercial.attachStripe("lead", "lead_stale_checkout", {
      id: "cs_old",
      url: "https://checkout.test/cs_old",
      forVersion: draft.version,
      forFinancialHash: draft.financialHash,
    });
    assert.equal(attached?.attached, true);
    assert.equal(attached?.pack.stripeCheckoutUrl, "https://checkout.test/cs_old");
    assert.equal(attached?.pack.stripeCheckoutFinancialHash, draft.financialHash);

    // Rewording costs nothing, so the session still matches the money.
    const reworded = await c.commercial.save(versionedTerms("lead_stale_checkout", {
      agreementBody: "Milesymedia will provide the retainer described above, in clearer words.",
    }), ACTOR);
    assert.equal(reworded.stripeCheckoutUrl, "https://checkout.test/cs_old");

    const repriced = await c.commercial.save(versionedTerms("lead_stale_checkout", {
      agreementBody: "Milesymedia will provide the retainer described above, in clearer words.",
      lineItems: [{ description: "Retainer", quantity: 1, unitCents: 250_000 }],
    }), ACTOR);
    assert.equal(repriced.totalCents, 250_000);
    assert.equal(repriced.stripeCheckoutId, undefined);
    assert.equal(repriced.stripeCheckoutUrl, undefined);
    assert.equal(repriced.stripeCheckoutFinancialHash, undefined);

    // A session priced for the superseded amount is refused, not stored.
    const stale = await c.commercial.attachStripe("lead", "lead_stale_checkout", {
      id: "cs_stale",
      url: "https://checkout.test/cs_stale",
      forVersion: draft.version,
      forFinancialHash: draft.financialHash,
    });
    assert.equal(stale?.attached, false);
    assert.equal(stale?.pack.stripeCheckoutUrl, undefined);
    assert.equal((await c.commercial.get("lead", "lead_stale_checkout"))?.stripeCheckoutId, undefined);

    // And the proposal email cannot advertise a payment link for the old amount.
    await c.commercial.send("lead", "lead_stale_checkout", "https://milesymedia.test", ACTOR);
    assert.equal(w.enqueued.length, 1);
    assert.equal(/cs_old/.test(w.enqueued[0]?.bodyText ?? ""), false);
    assert.equal(/cs_old/.test(w.enqueued[0]?.bodyHtml ?? ""), false);
  });

  test("a refused proposal email leaves the pack unsent, retains the error, and a retry sends it", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.commercial.save({
      partyKind: "lead",
      partyId: "lead_send_refused",
      recipientEmail: "refused@example.test",
      lineItems: [{ description: "Service", quantity: 1, unitCents: 50_000 }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now() + 86_400_000,
      billingCadence: "one-off",
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    }, ACTOR);

    w.emailDelivery.mode = "failed";
    w.emailDelivery.error = "Mailbox unavailable (550).";
    const refused = await c.commercial.send("lead", "lead_send_refused", "https://milesymedia.test", ACTOR);
    assert.equal(refused.deliveryStatus, "failed");
    assert.equal(refused.deliveryError, "Mailbox unavailable (550).");
    assert.equal(refused.invoiceStatus, "draft");
    assert.equal(refused.agreementStatus, "draft");
    assert.equal(refused.sentAt, undefined);
    assert.ok(refused.emailMessageId, "the provider message id is retained as the retry handle");
    assert.ok(refused.deliveryAttemptedAt);
    assert.equal(w.activityLog.some(entry => entry.action === "commercial.sent"), false);
    const failure = w.activityLog.find(entry => entry.action === "commercial.send.failed");
    assert.ok(failure, "the refusal is logged as a failure, not a send");
    assert.match(failure?.message ?? "", /stay unsent/i);
    // The refusal survives a reload — it is persisted, not only returned.
    const reloaded = await c.commercial.get("lead", "lead_send_refused");
    assert.equal(reloaded?.deliveryStatus, "failed");
    assert.equal(reloaded?.invoiceStatus, "draft");

    // Queue-only acceptance is not confirmation either.
    w.emailDelivery.mode = "queued";
    const queued = await c.commercial.send("lead", "lead_send_refused", "https://milesymedia.test", ACTOR);
    assert.equal(queued.deliveryStatus, "queued");
    assert.equal(queued.invoiceStatus, "draft");
    assert.equal(queued.sentAt, undefined);
    assert.equal(queued.deliveryError, undefined);
    assert.ok(w.activityLog.some(entry => entry.action === "commercial.send.queued"));

    // Retry: the same action is the retry path and confirmed delivery advances it.
    w.emailDelivery.mode = "delivered";
    const delivered = await c.commercial.send("lead", "lead_send_refused", "https://milesymedia.test", ACTOR);
    assert.equal(delivered.deliveryStatus, "delivered");
    assert.equal(delivered.deliveryError, undefined);
    assert.equal(delivered.invoiceStatus, "sent");
    assert.equal(delivered.agreementStatus, "sent");
    assert.ok((delivered.sentAt ?? 0) > 0);
    assert.ok(w.activityLog.some(entry => entry.action === "commercial.sent"));
  });

  test("a refused payment receipt is retained unsent and the same reference retries it", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.commercial.save({
      partyKind: "contact",
      partyId: "contact_receipt_refused",
      recipientEmail: "receipt-refused@example.test",
      lineItems: [{ description: "Service", quantity: 1, unitCents: 20_000 }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now() + 86_400_000,
      billingCadence: "one-off",
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    }, ACTOR);

    w.emailDelivery.mode = "failed";
    w.emailDelivery.error = "Receipt mailbox full.";
    const recorded = await c.commercial.recordPayment("contact", "contact_receipt_refused", {
      amountCents: 20_000,
      method: "bank-transfer",
      reference: "BANK-RECEIPT-1",
    }, ACTOR);
    const failedReceipt = recorded?.payments[0];
    assert.equal(recorded?.invoiceStatus, "paid", "the money is still recorded");
    assert.equal(failedReceipt?.receiptSentAt, undefined, "a refused receipt is never stamped sent");
    assert.equal(failedReceipt?.receiptDeliveryStatus, "failed");
    assert.equal(failedReceipt?.receiptError, "Receipt mailbox full.");
    assert.ok(failedReceipt?.receiptMessageId, "the receipt message id is retained for retry");
    // The activity and event side effects still completed despite the refusal.
    assert.ok(w.activityLog.some(entry => entry.action === "commercial.payment.recorded"));
    assert.ok(w.events.some(event => event.name === "commercial.payment.recorded"));

    // Re-recording the same reference resumes the outstanding receipt rather than
    // duplicating the payment; a confirmed delivery is what finally stamps it.
    w.emailDelivery.mode = "delivered";
    const retried = await c.commercial.recordPayment("contact", "contact_receipt_refused", {
      amountCents: 20_000,
      method: "bank-transfer",
      reference: "bank-receipt-1",
    }, ACTOR);
    assert.equal(retried?.payments.length, 1);
    assert.equal(retried?.payments[0]?.receiptDeliveryStatus, "delivered");
    assert.ok((retried?.payments[0]?.receiptSentAt ?? 0) > 0);
    assert.equal(retried?.payments[0]?.receiptError, undefined);
    assert.equal(w.activityLog.filter(entry => entry.action === "commercial.payment.recorded").length, 1);
  });

  test("signed agreement uploads are constrained to safe document formats", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await assert.rejects(c.commercial.save({
      partyKind: "lead",
      partyId: "lead_upload",
      recipientEmail: "buyer@example.test",
      lineItems: [{ description: "Service", quantity: 1, unitCents: 10_000 }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now(),
      billingCadence: "one-off",
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
      signedDocumentName: "unsafe.html",
      signedDocumentDataUrl: "data:text/html;base64,PGgxPk5vPC9oMT4=",
    }, ACTOR), /PDF, PNG, JPEG, or WebP/);
  });

  test("simultaneous packs receive distinct reserved invoice numbers", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const input = (partyId: string, email: string) => ({
      partyKind: "lead" as const,
      partyId,
      recipientEmail: email,
      lineItems: [{ description: "Service", quantity: 1, unitCents: 10_000 }],
      taxCents: 0,
      currency: "gbp" as const,
      dueAt: Date.now() + 86_400_000,
      billingCadence: "one-off" as const,
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    });
    const [alpha, bravo] = await Promise.all([
      c.commercial.save(input("lead_invoice_alpha", "alpha-invoice@example.test"), ACTOR),
      c.commercial.save(input("lead_invoice_bravo", "bravo-invoice@example.test"), ACTOR),
    ]);
    assert.notEqual(alpha.invoiceNumber, bravo.invoiceNumber);
    assert.deepEqual(
      [alpha.invoiceNumber, bravo.invoiceNumber].sort(),
      [`MM-${new Date().getUTCFullYear()}-0001`, `MM-${new Date().getUTCFullYear()}-0002`],
    );
  });

  test("simultaneous distinct payments both survive and canonical retries count once", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.commercial.save({
      partyKind: "lead",
      partyId: "lead_payment_race",
      recipientEmail: "payment-race@example.test",
      lineItems: [{ description: "Service", quantity: 1, unitCents: 10_000 }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now() + 86_400_000,
      billingCadence: "one-off",
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    }, ACTOR);
    await Promise.all([
      c.commercial.recordPayment("lead", "lead_payment_race", {
        amountCents: 3_000,
        method: "bank-transfer",
        reference: "BANK-RACE-A",
      }, ACTOR),
      c.commercial.recordPayment("lead", "lead_payment_race", {
        amountCents: 4_000,
        method: "cash",
        reference: "CASH-RACE-B",
      }, ACTOR),
    ]);
    const retried = await c.commercial.recordPayment("lead", "lead_payment_race", {
      amountCents: 3_000,
      method: "bank-transfer",
      reference: "  bank-race-a  ",
    }, ACTOR);
    assert.equal(retried?.payments.length, 2);
    assert.equal(retried?.payments.reduce((sum, payment) => sum + payment.amountCents, 0), 7_000);
    assert.equal(w.activityLog.filter(entry => entry.action === "commercial.payment.recorded").length, 2);
    assert.equal(w.events.filter(event => event.name === "commercial.payment.recorded").length, 2);
    assert.equal((await c.commercial.get("lead", "lead_payment_race"))?.payments.length, 2);
  });

  test("payment references are required and conflicting reuse is refused", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.commercial.save({
      partyKind: "contact",
      partyId: "contact_payment_conflict",
      recipientEmail: "payment-conflict@example.test",
      lineItems: [{ description: "Service", quantity: 1, unitCents: 10_000 }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now() + 86_400_000,
      billingCadence: "one-off",
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    }, ACTOR);
    await assert.rejects(c.commercial.recordPayment("contact", "contact_payment_conflict", {
      amountCents: 2_000,
      method: "cash",
      reference: "   ",
    }, ACTOR), /reference is required/i);
    await c.commercial.recordPayment("contact", "contact_payment_conflict", {
      amountCents: 2_000,
      method: "cash",
      reference: "TILL-001",
    }, ACTOR);
    await assert.rejects(c.commercial.recordPayment("contact", "contact_payment_conflict", {
      amountCents: 2_500,
      method: "cash",
      reference: "till-001",
    }, ACTOR), CommercialPaymentConflictError);
    assert.equal((await c.commercial.get("contact", "contact_payment_conflict"))?.payments.length, 1);
  });

  // ─── Installment plans stop exactly, and only when Stripe confirms ─────
  //
  // Three separate defects lived here: a hand-recorded "stripe" row counted
  // towards the promised installments and cancelled the plan early; the
  // rounded-up recurring price collected more than the proposal total; and a
  // refused cancellation left no trace once Stripe stopped redelivering.

  const installmentPack = async (partyId: string, opts: { totalCents: number; installmentCount: number }) => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.commercial.save({
      partyKind: "lead",
      partyId,
      recipientEmail: `${partyId}@example.test`,
      lineItems: [{ description: "Retainer", quantity: 1, unitCents: opts.totalCents }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now() + 86_400_000,
      billingCadence: "installments",
      installmentCount: opts.installmentCount,
      serviceLevel: "Retainer",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    }, ACTOR);
    const subscriptionId = `sub_${partyId}`;
    await c.commercial.attachStripeSubscription("lead", partyId, subscriptionId);
    const collectInvoice = (invoiceId: string, amountCents: number) =>
      c.commercial.recordPayment("lead", partyId, {
        amountCents,
        method: "stripe",
        reference: invoiceId,
        source: "stripe-subscription",
        stripeSubscriptionId: subscriptionId,
      }, ACTOR);
    return { w, c, partyId, subscriptionId, collectInvoice, pack: () => c.commercial.get("lead", partyId) };
  };

  test("an installment plan divides the promised total exactly, never a rounded-up multiple", () => {
    // The defect: ceil(10000 / 3) = 3334 billed three times collects 10002.
    const three = installmentAllocation({ billingCadence: "installments", totalCents: 10_000, installmentCount: 3 });
    assert.equal(three.recurringCents, 3_333);
    assert.equal(three.remainderCents, 1);
    assert.equal(three.recurringCents * three.count + three.remainderCents, 10_000);

    for (const totalCents of [1, 99, 100, 4_999, 10_000, 123_457]) {
      for (let count = 2; count <= 12; count += 1) {
        const split = installmentAllocation({ billingCadence: "installments", totalCents, installmentCount: count });
        assert.equal(split.count, count);
        assert.equal(
          split.recurringCents * count + split.remainderCents,
          totalCents,
          `${count} installments of ${totalCents} collects the wrong total`,
        );
        assert.ok(split.remainderCents >= 0 && split.remainderCents < count,
          "the remainder must be a one-off leftover, never another installment");
      }
    }
    // A non-installment pack is charged once, in full.
    assert.deepEqual(
      installmentAllocation({ billingCadence: "one-off", totalCents: 10_000 }),
      { count: 1, recurringCents: 10_000, remainderCents: 0 },
    );
  });

  test("a hand-recorded Stripe row never completes the installment plan", async () => {
    const world = await installmentPack("lead_installments_manual", { totalCents: 30_000, installmentCount: 3 });
    const stopCalls: string[] = [];
    const requestStop = async () => { stopCalls.push(world.subscriptionId); return { ok: true }; };

    // Someone reconciling a Stripe dashboard payment by hand picks method
    // "stripe". That says how the money moved, not that the subscription billed.
    await world.c.commercial.recordPayment("lead", world.partyId, {
      amountCents: 10_000,
      method: "stripe",
      reference: "MANUAL-BANK-1",
    }, ACTOR);
    await world.collectInvoice("in_1", 10_000);
    await world.collectInvoice("in_2", 10_000);

    // Manual row + two invoices used to be three "stripe" payments, so the plan
    // was cancelled while an installment was still owed.
    const early = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId, requestStop,
    });
    assert.equal(early.status, "not-due");
    assert.equal(early.collected, 2);
    assert.deepEqual(stopCalls, []);
    assert.equal((await world.pack())?.subscriptionCancelRequestedAt, undefined);

    await world.collectInvoice("in_3", 10_000);
    const due = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId, requestStop,
    });
    assert.equal(due.status, "requested");
    assert.equal(due.collected, 3);
    assert.equal(stopCalls.length, 1);

    const packed = await world.pack();
    assert.equal(packed?.payments.length, 4);
    assert.equal(packed?.payments.filter(payment => payment.source === "stripe-subscription").length, 3);
    assert.equal(packed?.payments.find(payment => payment.reference === "MANUAL-BANK-1")?.source, "manual");
    // Asked is not confirmed.
    assert.ok(packed?.subscriptionCancelRequestedAt);
    assert.equal(packed?.subscriptionCancelAttempts, 1);
    assert.equal(packed?.subscriptionCancelConfirmedAt, undefined);
  });

  test("a redelivered invoice cannot count twice towards the promised installments", async () => {
    const world = await installmentPack("lead_installments_redeliver", { totalCents: 20_000, installmentCount: 2 });
    await world.collectInvoice("in_1", 10_000);
    await world.collectInvoice("in_1", 10_000);
    const stopCalls: string[] = [];
    const outcome = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      requestStop: async () => { stopCalls.push("stop"); return { ok: true }; },
    });
    assert.equal(outcome.status, "not-due");
    assert.equal(outcome.collected, 1, "the redelivery was counted as a second installment");
    assert.deepEqual(stopCalls, []);
    assert.equal((await world.pack())?.payments.length, 1);
  });

  test("a refused cancellation is retained and retried, and only Stripe confirms the stop", async () => {
    const world = await installmentPack("lead_installments_refused", { totalCents: 20_000, installmentCount: 2 });
    await world.collectInvoice("in_1", 10_000);
    await world.collectInvoice("in_2", 10_000);

    const refused = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      requestStop: async () => ({ ok: false, error: "Subscription is in an invalid state." }),
    });
    assert.equal(refused.status, "refused");
    assert.equal(refused.status === "refused" && refused.error, "Subscription is in an invalid state.");
    // The refusal outlives the response, so a permanent failure is still visible
    // after Stripe's redelivery window closes.
    const afterRefusal = await world.pack();
    assert.equal(afterRefusal?.subscriptionCancelError, "Subscription is in an invalid state.");
    assert.equal(afterRefusal?.subscriptionCancelAttempts, 1);
    assert.ok(afterRefusal?.subscriptionCancelRequestedAt);
    assert.equal(afterRefusal?.subscriptionCancelConfirmedAt, undefined);

    // A transport failure is a separate answer: the outcome is unknown, not refused.
    const unavailable = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      requestStop: async () => { throw new Error("Stripe did not answer in time."); },
    });
    assert.equal(unavailable.status, "unavailable");
    assert.equal((await world.pack())?.subscriptionCancelAttempts, 2);

    const accepted = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      requestStop: async () => ({ ok: true }),
    });
    assert.equal(accepted.status, "requested");
    const afterRetry = await world.pack();
    assert.equal(afterRetry?.subscriptionCancelAttempts, 3);
    assert.equal(afterRetry?.subscriptionCancelError, undefined);
    // Stripe accepting the request is still not Stripe confirming the stop.
    assert.equal(afterRetry?.subscriptionCancelConfirmedAt, undefined);

    // Only the provider's own customer.subscription.* event stamps that.
    await world.c.commercial.recordSubscriptionCancellation("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      confirmedAt: Date.now(),
    });
    const confirmed = await world.pack();
    assert.ok(confirmed?.subscriptionCancelConfirmedAt);
    assert.equal(confirmed?.subscriptionCancelError, undefined);

    // Once confirmed the plan is not asked to stop again.
    let asked = false;
    const again = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      requestStop: async () => { asked = true; return { ok: true }; },
    });
    assert.equal(again.status, "already-stopped");
    assert.equal(asked, false);

    // ...but a stop is a claim about Stripe's state, not a one-way latch. If
    // someone un-cancels in the dashboard, Stripe reports the subscription
    // active and no longer cancelling. Leaving `confirmedAt` stamped would
    // answer "already-stopped" for the life of the pack while the reactivated
    // subscription billed past the promised count.
    await world.c.commercial.recordSubscriptionCancellation("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      reopenedAt: Date.now(),
    });
    const reopened = await world.pack();
    assert.equal(reopened?.subscriptionCancelConfirmedAt, undefined,
      "an un-cancelled subscription is still recorded as stopped");
    assert.equal(reopened?.subscriptionCancelRequestedAt, undefined,
      "the stale request record survives, so the retry history now describes a stop that was undone");
    assert.equal(reopened?.subscriptionCancelAttempts, undefined);

    let reAsked = false;
    const afterReopen = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      requestStop: async () => { reAsked = true; return { ok: true }; },
    });
    assert.equal(afterReopen.status, "requested",
      "the plan will never ask Stripe to stop again, so it bills past the promised count");
    assert.equal(reAsked, true);

    // A reopen for a DIFFERENT subscription must not clear this pack's stop.
    await world.c.commercial.recordSubscriptionCancellation("lead", world.partyId, {
      subscriptionId: world.subscriptionId,
      confirmedAt: Date.now(),
    });
    await world.c.commercial.recordSubscriptionCancellation("lead", world.partyId, {
      subscriptionId: "sub_someone_elses",
      reopenedAt: Date.now(),
    });
    assert.ok((await world.pack())?.subscriptionCancelConfirmedAt,
      "another subscription's reactivation cleared this pack's confirmed stop");

    // An amendment of the wording must not erase the recorded stop.
    await world.c.commercial.save({
      partyKind: "lead",
      partyId: world.partyId,
      recipientEmail: `${world.partyId}@example.test`,
      lineItems: [{ description: "Retainer", quantity: 1, unitCents: 20_000 }],
      taxCents: 0,
      currency: "gbp",
      dueAt: Date.now() + 86_400_000,
      billingCadence: "installments",
      installmentCount: 2,
      serviceLevel: "Retainer",
      agreementTitle: "Agreement",
      agreementBody: "Revised terms",
    }, ACTOR);
    assert.ok((await world.pack())?.subscriptionCancelConfirmedAt);
    assert.ok((await world.pack())?.subscriptionCancelRequestedAt);
  });

  test("another subscription's webhook cannot complete this plan", async () => {
    const world = await installmentPack("lead_installments_foreign", { totalCents: 20_000, installmentCount: 2 });
    await world.collectInvoice("in_1", 10_000);
    await world.collectInvoice("in_2", 10_000);
    let asked = false;
    const outcome = await world.c.commercial.completeInstallments("lead", world.partyId, {
      subscriptionId: "sub_someone_else",
      requestStop: async () => { asked = true; return { ok: true }; },
    });
    assert.equal(outcome.status, "not-due");
    assert.equal(asked, false);
    await world.c.commercial.recordSubscriptionCancellation("lead", world.partyId, {
      subscriptionId: "sub_someone_else",
      confirmedAt: Date.now(),
    });
    assert.equal((await world.pack())?.subscriptionCancelConfirmedAt, undefined);
  });

  test("a simultaneous invoice edit cannot replace an acknowledged payment", async () => {
    const w = buildWorld();
    const first = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const second = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const original = {
      partyKind: "lead" as const,
      partyId: "lead_save_payment_race",
      recipientEmail: "save-payment-race@example.test",
      lineItems: [{ description: "Service", quantity: 1, unitCents: 10_000 }],
      taxCents: 0,
      currency: "gbp" as const,
      dueAt: Date.now() + 86_400_000,
      billingCadence: "one-off" as const,
      serviceLevel: "Service",
      agreementTitle: "Agreement",
      agreementBody: "Terms",
    };
    const saved = await first.commercial.save(original, ACTOR);
    await Promise.all([
      first.commercial.save({
        ...original,
        lineItems: [{ description: "Expanded service", quantity: 1, unitCents: 12_000 }],
      }, ACTOR),
      second.commercial.recordPayment("lead", original.partyId, {
        amountCents: 2_000,
        method: "bank-transfer",
        reference: "BANK-SAVE-RACE",
      }, ACTOR),
    ]);
    const final = await second.commercial.get("lead", original.partyId);
    assert.equal(final?.invoiceNumber, saved.invoiceNumber);
    assert.equal(final?.totalCents, 12_000);
    assert.equal(final?.payments.length, 1);
    assert.equal(final?.payments[0]?.reference, "BANK-SAVE-RACE");
  });
});

// ─── 4. AudienceFilter ───────────────────────────────────────────────────

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

  test("filter by trading brand without leaking leads across brands", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    await c.leads.upsert({ email: "aqua@x.com", source: "manual", companyIds: ["brand_aqua"] }, ACTOR);
    await c.leads.upsert({ email: "milesy@x.com", source: "manual", companyIds: ["brand_milesy"] }, ACTOR);
    await c.leads.upsert({ email: "shared@x.com", source: "manual", companyIds: ["brand_aqua", "brand_milesy"] }, ACTOR);

    const out = await c.leads.resolveAudience({ companyIds: ["brand_aqua"] });

    assert.deepEqual(out.map(lead => lead.email).sort(), ["aqua@x.com", "shared@x.com"]);
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

// ─── 5. Campaign management ──────────────────────────────────────────────

describe("leads-pipeline / CampaignService", () => {
  test("creative variants persist and remain editable on a draft campaign", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    const camp = await c.campaigns.create({
      name: "Autumn menu launch",
      channel: "Meta Ads",
      audienceFilter: { tags: ["hospitality"] },
      creative: {
        asset: {
          id: "asset_menu",
          name: "autumn-menu.jpg",
          mimeType: "image/jpeg",
          size: 248_000,
          storageProvider: "supabase",
          storageKey: "campaigns/agency_test/creative_menu.jpg",
        },
        brandName: "The Harbour Table",
        handle: "@harbourtable",
        primaryText: "Our autumn menu has landed.",
        headline: "Book your table",
        description: "Seasonal dishes, served by the water.",
        callToAction: "Book now",
        destinationUrl: "https://example.com/book",
        placements: ["instagram-feed", "instagram-story"],
        mediaFit: "cover",
        focalX: 42,
        focalY: 61,
        showSafeArea: true,
      },
    }, ACTOR);

    assert.equal(camp.creative?.asset?.name, "autumn-menu.jpg");
    assert.deepEqual(camp.creative?.placements, ["instagram-feed", "instagram-story"]);
    assert.equal(camp.creative?.focalX, 42);

    const updated = await c.campaigns.update(camp.id, {
      creative: {
        ...camp.creative!,
        placements: ["instagram-story", "facebook-story"],
        headline: "See the new menu",
        focalX: 67,
        focalY: 38,
      },
    }, ACTOR);

    assert.deepEqual(updated?.creative?.placements, ["instagram-story", "facebook-story"]);
    assert.equal(updated?.creative?.headline, "See the new menu");
    assert.equal(updated?.creative?.focalX, 67);
    assert.equal(updated?.creative?.focalY, 38);
    assert.equal(updated?.creative?.asset?.storageProvider, "supabase");
  });

  test("update edits a draft campaign before send", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    const camp = await c.campaigns.create({
      name: "Draft",
      subject: "Old subject",
      bodyHtml: "<p>Old</p>",
      bodyText: "Old",
      budgetPotId: "budget_growth",
      audienceFilter: { tags: ["cold"] },
    }, ACTOR);
    const updated = await c.campaigns.update(camp.id, {
      name: "Warm follow-up",
      subject: "New subject",
      bodyHtml: "<p>New</p>",
      bodyText: "New",
      audienceFilter: { tags: ["warm"], sourcedFrom: ["sheet-upload"], pipelineColumn: "Qualified" },
    }, ACTOR);
    assert.equal(updated?.name, "Warm follow-up");
    assert.equal(updated?.subject, "New subject");
    assert.equal(updated?.bodyText, "New");
    assert.deepEqual(updated?.audienceFilter.tags, ["warm"]);
    assert.deepEqual(updated?.audienceFilter.sourcedFrom, ["sheet-upload"]);
    assert.equal(updated?.audienceFilter.pipelineColumn, "Qualified");
    assert.equal(updated?.budgetPotId, "budget_growth", "unmentioned funding links are preserved");
    const unfunded = await c.campaigns.update(camp.id, { budgetPotId: null }, ACTOR);
    assert.equal(unfunded?.budgetPotId, undefined, "a campaign can be deliberately removed from a budget pot");
  });

  test("happy path delivers one email per audience lead", async () => {
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
    assert.equal(sent.failedCount, 0);
    assert.equal(sent.queuedCount, 0);
    assert.deepEqual(sent.pendingLeadIds, []);
    assert.ok((sent.sentAt ?? 0) > 0, "a confirmed delivery earns a sent date");
    assert.equal(w.enqueued.length, 2);
    assert.equal(w.enqueued[0]?.triggeredByPlugin, "leads-pipeline");
    // sentCount stamped on Lead
    const aLead = await c.leads.getByEmail("a@x.com");
    assert.equal(aLead?.sentCount, 1);
    assert.ok((aLead?.lastContactedAt ?? 0) > 0);
  });

  test("an unconfigured provider leaves the campaign queued, never sent", async () => {
    const w = buildWorld({ withEmail: true });
    // email-sender's honest answer when no provider is configured: the row
    // stays durably queued, and nothing was delivered.
    w.emailDelivery.mode = "queued";
    w.emailDelivery.code = "provider_unconfigured";
    w.emailDelivery.error = "Email delivery is disabled — no provider configured.";
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    await c.leads.upsert({ email: "b@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "Unconfigured blast", subject: "Hi", bodyHtml: "<p>Hey</p>",
      audienceFilter: { tags: ["vip"] },
    }, ACTOR);

    const result = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(result.status, "queued", "nothing was delivered, so the campaign is not sent");
    assert.equal(result.sentCount, 0);
    assert.equal(result.queuedCount, 2);
    assert.equal(result.failedCount, 0);
    assert.equal(result.pendingLeadIds?.length, 2);
    assert.equal(result.sentAt, undefined, "a campaign that delivered nothing has no sent date");
    assert.ok(result.lastSendError, "the campaign says why nobody has it yet");
    // The leads were NOT contacted — stamping them would erase the fact that
    // they are still owed this email.
    for (const email of ["a@x.com", "b@x.com"]) {
      const lead = await c.leads.getByEmail(email);
      assert.equal(lead?.sentCount, 0, `${email} must not be counted as emailed`);
      assert.equal(lead?.lastContactedAt, undefined, `${email} must not be stamped as contacted`);
    }
    assert.equal(
      w.events.some(event => event.name === "leads.campaign.sent"),
      false,
      "no delivery means no leads.campaign.sent",
    );
    assert.equal(w.events.filter(event => event.name === "leads.campaign.send_failed").length, 1);
    // The stored row agrees with the returned one.
    const reread = await c.campaigns.get(camp.id);
    assert.equal(reread?.status, "queued");
    assert.equal(reread?.sentCount, 0);
  });

  test("a partial failure is reported, and a retry re-attempts only the unfinished recipients", async () => {
    const w = buildWorld({ withEmail: true });
    w.emailDelivery.failRecipients.add("b@x.com");
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    await c.leads.upsert({ email: "b@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "Half blast", subject: "Hi", bodyHtml: "<p>Hey</p>",
      audienceFilter: { tags: ["vip"] },
    }, ACTOR);

    const first = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(first.status, "partially-sent");
    assert.equal(first.recipients, 2);
    assert.equal(first.sentCount, 1);
    assert.equal(first.failedCount, 1);
    const bLead = await c.leads.getByEmail("b@x.com");
    assert.equal(bLead?.sentCount, 0, "the refused recipient is not counted as emailed");
    assert.deepEqual(first.pendingLeadIds, [bLead?.id]);

    // Fix the mailbox and re-send: only b@x.com is attempted again.
    w.emailDelivery.failRecipients.delete("b@x.com");
    const attemptsBefore = w.enqueued.length;
    const second = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(w.enqueued.length - attemptsBefore, 1, "the retry emails only the unfinished recipient");
    assert.equal(w.enqueued.at(-1)?.to, "b@x.com");
    assert.equal(second.status, "sent");
    assert.equal(second.sentCount, 2, "confirmed deliveries accumulate across attempts");
    assert.equal(second.recipients, 2, "the audience snapshot is not re-counted");
    assert.equal(second.failedCount, 0);
    assert.deepEqual(second.pendingLeadIds, []);
    assert.equal(second.lastSendError, undefined);
    const aLead = await c.leads.getByEmail("a@x.com");
    assert.equal(aLead?.sentCount, 1, "the already-delivered recipient is not emailed twice");
    assert.equal((await c.leads.getByEmail("b@x.com"))?.sentCount, 1);
  });

  test("a lead with no email address keeps the campaign unfinished", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    // Phone-only lead. `email: ""` rather than omitted because LeadService
    // .upsert dereferences `input.email` unconditionally.
    const { lead: noEmail } = await c.leads.upsert({ email: "", phone: "+447700900000", source: "manual", tags: ["vip"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "Missing address", subject: "Hi", bodyHtml: "<p>Hey</p>",
      audienceFilter: { tags: ["vip"] },
    }, ACTOR);

    const result = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(result.status, "partially-sent");
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 1);
    assert.deepEqual(result.pendingLeadIds, [noEmail.id]);
  });

  test("an adapter that can only enqueue reports queued, not sent", async () => {
    const w = buildWorld({ withEmail: true });
    const full = w.emailEnqueue;
    assert.ok(full, "the email world was requested");
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      // Only `enqueue` — the shape the foundation shipped before delivery was
      // wired. It can accept a message but can never confirm one.
      emailEnqueue: { enqueue: full.enqueue.bind(full) },
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "Enqueue only", subject: "Hi", bodyHtml: "<p>Hey</p>",
      audienceFilter: { tags: ["vip"] },
    }, ACTOR);

    const result = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(result.status, "queued");
    assert.equal(result.sentCount, 0);
    assert.equal(result.queuedCount, 1);
    assert.equal((await c.leads.getByEmail("a@x.com"))?.sentCount, 0);
  });

  test("a campaign whose audience resolves to nobody is never stamped sent", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "a@x.com", source: "manual", tags: ["other"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "Nobody blast", subject: "Hi", bodyHtml: "<p>Hey</p>",
      audienceFilter: { tags: ["vip"] },
    }, ACTOR);

    const result = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(w.enqueued.length, 0, "there was nobody to email");
    assert.notEqual(result.status, "sent", "zero confirmed deliveries is not a send");
    assert.equal(result.sentCount, 0);
    assert.equal(result.sentAt, undefined, "nothing was delivered, so there is no sent date");
    assert.ok(result.lastSendError, "the campaign says why nobody got it");
    assert.equal(
      w.events.some(event => event.name === "leads.campaign.sent"),
      false,
      "no delivery means no leads.campaign.sent",
    );
    // Still editable and still re-sendable once the audience has people in it.
    const retagged = await c.campaigns.update(camp.id, { name: "Nobody blast v2" }, ACTOR);
    assert.equal(retagged?.name, "Nobody blast v2");
    await c.leads.upsert({ email: "b@x.com", source: "manual", tags: ["vip"] }, ACTOR);
    const second = await c.campaigns.send(camp.id, ACTOR);
    assert.equal(second.status, "sent");
    assert.equal(second.sentCount, 1);
    assert.equal(second.recipients, 1);
  });

  test("newsletter campaigns enqueue through the email sender", async () => {
    const w = buildWorld({ withEmail: true });
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
      emailEnqueue: w.emailEnqueue,
    });
    await c.leads.upsert({ email: "reader@x.com", source: "manual", tags: ["newsletter"] }, ACTOR);
    const camp = await c.campaigns.create({
      name: "August newsletter",
      channel: "newsletter",
      kind: "newsletter",
      subject: "Aqua updates",
      bodyHtml: "<p>Useful updates.</p>",
      bodyText: "Useful updates.",
      audienceFilter: { tags: ["newsletter"] },
    }, ACTOR);

    const sent = await c.campaigns.send(camp.id, ACTOR);

    assert.equal(sent.status, "sent");
    assert.equal(sent.channel, "newsletter");
    assert.equal(sent.sentCount, 1);
    assert.equal(w.enqueued[0]?.subject, "Aqua updates");
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

// ─── 6. Subscribers ──────────────────────────────────────────────────────

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
