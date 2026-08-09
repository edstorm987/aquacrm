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

  test("delete archives lead and removes it from active list", async () => {
    const w = buildWorld();
    const c = buildLeadsPipelineContainer({
      agencyId: AGENCY_ID, storage: w.storage, activity: w.activity,
      events: w.eventBus, tenant: w.tenant, pluginInstalls: w.pluginInstalls,
    });
    const r = await c.leads.upsert({ email: "archive@x.com", source: "manual" }, ACTOR);
    assert.equal(await c.leads.delete(r.lead.id, ACTOR), true);
    assert.equal(await c.leads.get(r.lead.id), null);
    assert.equal((await c.leads.list()).length, 0);
    assert.equal(w.events.some(e => e.name === "leads.lead.archived"), true);
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
    }, ACTOR);
    assert.equal(updated?.name, "Contact Person");
    assert.equal(updated?.type, "customer");
    assert.deepEqual(updated?.tags, ["converted", "support"]);
    assert.equal(updated?.nextMeetingAt, meeting);
    assert.equal(updated?.meetingNotes, "Portal onboarding");
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
    assert.ok(w.activityLog.some(entry => entry.action === "commercial.payment.recorded"));
    assert.ok(w.events.some(event => event.name === "commercial.payment.recorded"));
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
  });

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
    assert.equal(w.enqueued[0]?.triggeredByPlugin, "leads-pipeline");
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
