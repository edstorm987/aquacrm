import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

import type { Campaign, Lead } from "../src/built-ins/modules/leads-pipeline/src/lib/domain";
import { buildCommercialIntelligence } from "../src/lib/commercialIntelligence";
import type { Client, Pipeline, PipelineCard } from "../src/server/types";

const now = Date.UTC(2026, 7, 13, 12);
const pipeline: Pipeline = {
  id: "pipeline-leads", agencyId: "agency-1", kind: "leads", name: "Leads", slug: "leads",
  columns: [
    { id: "new", label: "New", order: 0 },
    { id: "contacted", label: "Contacted", order: 1 },
    { id: "proposal", label: "Proposal", order: 2 },
    { id: "won", label: "Won", order: 3 },
    { id: "lost", label: "Lost", order: 4 },
  ],
  allowedCardKinds: ["lead"], sortOrder: 0, createdAt: now, updatedAt: now,
};
const leads: Lead[] = [
  {
    id: "lead-won", agencyId: "agency-1", email: "won@example.com", name: "Won Lead", tags: ["priority"], source: "campaign:launch",
    capturedAt: now - 10 * 86_400_000, lastEnquiryAt: now - 10 * 86_400_000, lastEnquiryRespondedAt: now - 10 * 86_400_000 + 4 * 60_000,
    firstContactedAt: now - 10 * 86_400_000 + 4 * 60_000, currentStageId: "won", stageEnteredAt: now - 2 * 86_400_000,
    convertedAt: now - 2 * 86_400_000, convertedClientId: "client-1", pipelineCardId: "card-won", enquiryCount: 2,
    journeyEvents: [{ id: "event-1", type: "contact-recorded", at: now - 9 * 86_400_000 }],
  },
  {
    id: "lead-lost", agencyId: "agency-1", email: "lost@example.com", name: "Lost Lead", tags: [], source: "campaign:launch",
    capturedAt: now - 20 * 86_400_000, currentStageId: "lost", stageEnteredAt: now - 5 * 86_400_000, pipelineCardId: "card-lost",
  },
  {
    id: "lead-new", agencyId: "agency-1", email: "new@example.com", name: "New Lead", tags: [], source: "manual",
    capturedAt: now - 86_400_000, currentStageId: "new", stageEnteredAt: now - 86_400_000, pipelineCardId: "card-new",
  },
];
const cards: PipelineCard[] = leads.map(lead => ({
  id: lead.pipelineCardId!, pipelineId: pipeline.id, columnId: lead.currentStageId!, order: 0, kind: "lead",
  lead: { leadId: lead.id, email: lead.email, name: lead.name, source: lead.source } as never,
  createdAt: lead.capturedAt, updatedAt: lead.stageEnteredAt ?? lead.capturedAt,
}));
const clients: Client[] = [{
  id: "client-1", agencyId: "agency-1", name: "Won Client", slug: "won-client", brand: {} as Client["brand"], stage: "live", status: "active",
  metadata: { leadId: "lead-won", leadSource: "campaign:launch" }, createdAt: now - 2 * 86_400_000, updatedAt: now,
}];
const campaigns: Campaign[] = [{
  id: "campaign-1", agencyId: "agency-1", name: "Launch", channel: "social", kind: "social-media", sourceKey: "campaign:launch",
  subject: "Launch", bodyHtml: "", spendCents: 10_000, attributedRevenueCents: 50_000, status: "active", audienceFilter: {}, recipients: 3,
  sentCount: 3, createdAt: now - 30 * 86_400_000, updatedAt: now, createdBy: "user-1",
}];

test("commercial intelligence traces campaigns through pipeline decisions into clients", () => {
  const snapshot = buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency: "GBP", pageviews: 1_000, forms: 10, now });

  assert.equal(snapshot.people.length, 3);
  assert.equal(snapshot.lineage.leads, 3);
  assert.equal(snapshot.lineage.won, 1);
  assert.equal(snapshot.lineage.activeClients, 1);
  assert.equal(snapshot.quality.stageCoveragePercent, 100);
  assert.equal(snapshot.quality.conversionLinkCoveragePercent, 100);
  assert.ok(snapshot.formulas.length >= 35);

  const conversion = snapshot.formulas.find(metric => metric.id === "lead-to-client");
  assert.equal(conversion?.numerator, 1);
  assert.equal(conversion?.denominator, 3);
  assert.equal(conversion?.value, 33.3);
  assert.match(conversion?.formula ?? "", /Converted leads/);

  const source = snapshot.sources.find(row => row.id === "campaign:launch");
  assert.equal(source?.leads, 2);
  assert.equal(source?.won, 1);
  assert.equal(source?.lost, 1);
  assert.equal(source?.costPerLeadCents, 5_000);
  assert.equal(source?.acquisitionCostCents, 10_000);
  assert.equal(source?.roas, 5);
  assert.equal(source?.medianResponseMs, 4 * 60_000);
});

test("commercial formulas expose missing evidence as learning, never as a zero pass", () => {
  const snapshot = buildCommercialIntelligence({ leads: [], clients: [], campaigns: [], pipeline: null, cards: [], currency: "GBP", pageviews: 0, forms: 0, now });
  const roas = snapshot.formulas.find(metric => metric.id === "campaign-roas");
  const conversion = snapshot.formulas.find(metric => metric.id === "lead-to-client");
  assert.equal(roas?.value, null);
  assert.equal(roas?.display, "Not measurable");
  assert.equal(roas?.status, "learning");
  assert.equal(conversion?.value, null);
  assert.equal(conversion?.status, "learning");
});

// ── Measurement honesty (issue #15) ──────────────────────────────────────────
// A Radar `value: 0` from a `blind`/`learning`/`inactive` check is not a
// reading. These pin that the funnel says "unmeasured" instead of asserting
// that literally nobody visited the site.

test("with no monitored properties the funnel reports pageviews as unmeasured, not zero", () => {
  const snapshot = buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency: "GBP", pageviews: 0, forms: 4, pageviewsMeasured: false, formsMeasured: true, now });
  assert.equal(snapshot.lineage.pageviewsMeasured, false);
  assert.equal(snapshot.lineage.pageviews, 0, "the raw figure is preserved; only its honesty flag changes");
  assert.equal(snapshot.lineage.formsMeasured, true, "an unmeasured pageview count must not drag forms down with it");
});

test("with a real reading the funnel is measured and equals the reading", () => {
  const snapshot = buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency: "GBP", pageviews: 1_240, forms: 10, pageviewsMeasured: true, formsMeasured: true, now });
  assert.equal(snapshot.lineage.pageviewsMeasured, true);
  assert.equal(snapshot.lineage.pageviews, 1_240);
});

test("with no monitored properties the funnel reports forms as unmeasured, not zero", () => {
  const snapshot = buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency: "GBP", pageviews: 1_240, forms: 0, pageviewsMeasured: true, formsMeasured: false, now });
  assert.equal(snapshot.lineage.formsMeasured, false);
  assert.equal(snapshot.lineage.forms, 0);
  assert.equal(snapshot.lineage.pageviewsMeasured, true);
});

test("with a real form reading the funnel is measured and equals the reading", () => {
  const snapshot = buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency: "GBP", pageviews: 1_240, forms: 37, formsMeasured: true, now });
  assert.equal(snapshot.lineage.formsMeasured, true);
  assert.equal(snapshot.lineage.forms, 37);
});

test("callers that supply no honesty flag keep today's behaviour", () => {
  const snapshot = buildCommercialIntelligence({ leads, clients, campaigns, pipeline, cards, currency: "GBP", pageviews: 1_000, forms: 10, now });
  assert.equal(snapshot.lineage.pageviewsMeasured, true);
  assert.equal(snapshot.lineage.formsMeasured, true);
});

// ── The same honesty, driven through the real server path ────────────────────
// The `?? 0` that destroyed the distinction lives in
// `src/lib/server/commandIntelligence.ts`, not in the pure builder above, so
// these run the actual snapshot builder against a real Radar. A source grep
// would not have caught the original bug and does not prove this fix.

const require_ = createRequire(import.meta.url);
const serverOnlyPath = require_.resolve("server-only");
require_.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type RadarModule = typeof import("../src/lib/server/businessIssueRadar");
type EvidenceVault = typeof import("../src/lib/server/radarEvidenceVault");
type CommandIntelligence = typeof import("../src/lib/server/commandIntelligence");

let storage: Storage;
let tenants: Tenants;
let radarModule: RadarModule;
let evidenceVault: EvidenceVault;
let commandIntelligence: CommandIntelligence;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  radarModule = await import("../src/lib/server/businessIssueRadar");
  evidenceVault = await import("../src/lib/server/radarEvidenceVault");
  commandIntelligence = await import("../src/lib/server/commandIntelligence");
  await storage.ensureHydrated();
});

/** A fresh agency with nothing monitored, plus its real Radar. */
async function freshAgencyRadar() {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Unmonitored Co", slug: `unmonitored-${Math.random().toString(36).slice(2, 8)}` });
  const radar = await radarModule.buildBusinessIssueRadar(agency.id, now);
  return { agencyId: agency.id, radar };
}

const snapshotFor = async (agencyId: string, radar: Awaited<ReturnType<RadarModule["buildBusinessIssueRadar"]>>) =>
  commandIntelligence.buildCommandIntelligenceSnapshot({ agencyId, radar, evidence: evidenceVault.inspectRadarEvidence(agencyId), now });

/** Promote the reading lens the snapshot actually consults to a real measurement. */
function makeAssessed(radar: { checks: { domain: string; familyId: string; scope: string; lens: string; status: string; value?: number | null }[] }, familyId: string, value: number) {
  const check = radar.checks.find(row => row.domain === "marketing" && row.familyId === familyId && row.scope === "kpi" && row.lens === "threshold");
  assert.ok(check, `radar fixture must carry a marketing ${familyId} threshold check`);
  check.status = "pass";
  check.value = value;
}

test("a fresh agency's Command Centre reports pageviews and forms as unmeasured, never as a measured zero", async () => {
  const { agencyId, radar } = await freshAgencyRadar();
  const traffic = radar.checks.find(row => row.domain === "marketing" && row.familyId === "traffic-7d" && row.scope === "kpi" && row.lens === "threshold");
  assert.equal(traffic?.status, "learning", "precondition: the Radar reports learning, and still emits value 0");
  assert.equal(traffic?.value, 0);
  assert.equal(radar.summary.monitoredProperties, 0);

  const snapshot = await snapshotFor(agencyId, radar);
  assert.equal(snapshot.commercialIntelligence.lineage.pageviewsMeasured, false);
  assert.equal(snapshot.commercialIntelligence.lineage.formsMeasured, false);
  assert.equal(snapshot.kpis.find(kpi => kpi.id === "traffic-7d")?.display, "—", "the KPI card must not print a confident 0");
  assert.equal(snapshot.kpis.find(kpi => kpi.id === "forms-7d")?.display, "—");
});

test("a real Aqua Tag reading is measured and reaches the funnel unchanged", async () => {
  const { agencyId, radar } = await freshAgencyRadar();
  makeAssessed(radar, "traffic-7d", 1_240);
  makeAssessed(radar, "form-submissions", 18);

  const snapshot = await snapshotFor(agencyId, radar);
  assert.equal(snapshot.commercialIntelligence.lineage.pageviewsMeasured, true);
  assert.equal(snapshot.commercialIntelligence.lineage.pageviews, 1_240);
  assert.equal(snapshot.commercialIntelligence.lineage.formsMeasured, true);
  assert.equal(snapshot.commercialIntelligence.lineage.forms, 18);
  assert.equal(snapshot.kpis.find(kpi => kpi.id === "traffic-7d")?.display, "1,240");
  assert.equal(snapshot.kpis.find(kpi => kpi.id === "forms-7d")?.display, "18");
  assert.equal(snapshot.demandFlow.pageviews, 1_240);
});

test("a measured zero stays a zero — quiet is not the same as unmonitored", async () => {
  const { agencyId, radar } = await freshAgencyRadar();
  makeAssessed(radar, "traffic-7d", 0);

  const snapshot = await snapshotFor(agencyId, radar);
  assert.equal(snapshot.commercialIntelligence.lineage.pageviewsMeasured, true, "a lens that assessed and found nothing is a genuine reading");
  assert.equal(snapshot.commercialIntelligence.lineage.pageviews, 0);
  assert.equal(snapshot.kpis.find(kpi => kpi.id === "traffic-7d")?.display, "0");
});
