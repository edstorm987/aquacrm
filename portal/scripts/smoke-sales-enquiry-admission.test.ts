import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import { LeadService } from "../src/built-ins/modules/leads-pipeline/src/server/leads";
import { ProspectService } from "../src/built-ins/modules/leads-pipeline/src/server/prospects";
import { ensureAcquisitionDossierForLead } from "../src/built-ins/modules/leads-pipeline/src/server/prospectAcquisition";
import type { ActivityLogPort, EventBusPort } from "../src/built-ins/modules/leads-pipeline/src/server/ports";

const routeSource = readFileSync(join(
  process.cwd(),
  "src/app/api/portal/website-enquiries/classification/route.ts",
), "utf8");
const detailSource = readFileSync(join(
  process.cwd(),
  "src/app/portal/agency/inbox/_EnquiryDetailCard.tsx",
), "utf8");
const alertSource = readFileSync(join(
  process.cwd(),
  "src/lib/server/inbox/operationalAlerts.ts",
), "utf8");

const routeCode = routeSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(line => !line.trim().startsWith("//"))
  .join("\n");

test("Sales classification admits an active Lead through the authenticated dossier write path", () => {
  const salesStart = routeCode.indexOf('if (classification === "sales")');
  const nonSalesStart = routeCode.indexOf("} else {", salesStart);
  assert.notEqual(salesStart, -1);
  assert.notEqual(nonSalesStart, -1);
  const beforeSales = routeCode.slice(0, salesStart);
  const salesBranch = routeCode.slice(salesStart, nonSalesStart);

  assert.match(beforeSales, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "use"\)/);
  assert.match(beforeSales, /loadActorWebsiteEnquiry\(actor, supabase, \{ id: enquiry\.id, required: "use" \}\)/,
    "the source enquiry must be re-authorised immediately before its first durable write");
  assert.match(salesBranch, /await ensureAcquisitionDossierForLead\(container, result\.lead, session\.userId\)/,
    "the authenticated Sales mutation must create or repair the acquisition dossier");
  assert.ok(
    salesBranch.indexOf("ensureAcquisitionDossierForLead") < salesBranch.indexOf("ensureLeadCard"),
    "the dossier must be durable before its board projection is restored",
  );
  assert.doesNotMatch(alertSource, /ensureAcquisitionDossierForLead/,
    "operational-alert reads must never backfill acquisition records");
  assert.doesNotMatch(alertSource, /upsertPerson/,
    "operational-alert reads must not create or merge canonical people");
  assert.match(alertSource, /findPersonByFacet\(agencyId, \{ enquiryId: enquiry\.id \}\)/,
    "existing canonical people should still receive their protected card link");
});

test("the enquiry action opens its exact Lead Journey record when one is linked", () => {
  assert.match(
    detailSource,
    /const salesJourneyHref = item\.leadId\s*\?\s*`\/portal\/agency\/pipelines\/leads\?lead=\$\{encodeURIComponent\(item\.leadId\)\}#lead-record`\s*:\s*"\/portal\/clients\?view=journey"/,
  );
  assert.match(detailSource, /<Link href=\{salesJourneyHref\}[^>]*>Open Journey/);
});

test("the dossier admission primitive is replay-safe", async () => {
  const data = new Map<string, unknown>();
  const pluginStorage: PluginStorage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
  };
  const activity: ActivityLogPort = {
    logActivity(input) { return { id: `activity_${Date.now()}`, ts: Date.now(), ...input }; },
    listActivity() { return []; },
    eraseSubjectReferences() { return 0; },
  };
  const events: EventBusPort = { emit() {} };
  const leads = new LeadService("agency_enquiry_admission", pluginStorage, activity, events);
  const prospects = new ProspectService("agency_enquiry_admission", pluginStorage, activity, events);
  const lead = (await leads.upsert({
    email: "enquiry@example.test",
    name: "Website enquiry",
    source: "website:aquacrm",
    tags: ["website-enquiry"],
    customFields: { enquiryId: "enquiry_1", enquiryClassification: "sales" },
  }, "user_sales")).lead;

  const first = await ensureAcquisitionDossierForLead({ leads, prospects }, lead, "user_sales");
  const refreshed = await leads.get(lead.id);
  assert.ok(refreshed);
  const replay = await ensureAcquisitionDossierForLead({ leads, prospects }, refreshed!, "user_sales");

  assert.equal(replay.id, first.id);
  assert.deepEqual(data.get("prospects/index"), [first.id]);
  assert.equal((await leads.get(lead.id))?.prospectAcquisitions?.length, 1);
});
