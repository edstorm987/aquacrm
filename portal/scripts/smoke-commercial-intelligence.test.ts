import assert from "node:assert/strict";
import { test } from "node:test";

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
