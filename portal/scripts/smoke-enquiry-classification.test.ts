import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  classificationContactType,
  isLeadJourneyEligible,
  isWebsiteEnquiryClassification,
} from "../src/lib/enquiryClassification";

test("website enquiry classification separates sales from every other relationship", () => {
  assert.equal(isWebsiteEnquiryClassification("sales"), true);
  assert.equal(isWebsiteEnquiryClassification("supplier"), true);
  assert.equal(isWebsiteEnquiryClassification("definitely-a-client"), false);
  assert.equal(classificationContactType("supplier"), "vendor");
  assert.equal(classificationContactType("existing-client"), "account");
  assert.equal(classificationContactType("spam"), null);
});

test("only classified website sales opportunities enter Journey", () => {
  const base = { source: "website:aquacrm", tags: ["website-enquiry"] };
  assert.equal(isLeadJourneyEligible({ ...base, customFields: { enquiryClassification: "unclassified" } }), false);
  assert.equal(isLeadJourneyEligible({ ...base, customFields: { enquiryClassification: "supplier" } }), false);
  assert.equal(isLeadJourneyEligible({ ...base, customFields: { enquiryClassification: "sales" } }), true);
  assert.equal(isLeadJourneyEligible({ source: "manual", tags: [] }), true);
  assert.equal(isLeadJourneyEligible({ ...base, convertedAt: Date.now() }), true);
});

test("classification routing archives false leads and retains precise destinations", () => {
  const route = readFileSync("src/app/api/portal/website-enquiries/classification/route.ts", "utf8");
  const inbox = readFileSync("src/app/portal/agency/inbox/_MasterInbox.tsx", "utf8");
  const journey = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx", "utf8");
  const radar = readFileSync("src/lib/server/businessIssueRadar.ts", "utf8");
  const alerts = readFileSync("src/lib/server/operationalAlerts.ts", "utf8");

  assert.match(route, /classification === "sales"/);
  assert.match(route, /await leads\.delete\(activeLead\.id/);
  assert.match(route, /removeLeadCards/);
  assert.match(route, /classificationContactType/);
  assert.match(route, /classification === "spam"/);
  assert.match(route, /enquiryClassificationHistory/);
  assert.match(inbox, /Every classification/);
  assert.match(inbox, /Classify enquiry from/);
  assert.match(inbox, /Excluded from Journey/);
  assert.match(journey, /leadList\.filter\(isLeadJourneyEligible\)/);
  assert.match(radar, /enquiry\.classification === "sales"/);
  assert.match(alerts, /Classify enquiry from/);
});
