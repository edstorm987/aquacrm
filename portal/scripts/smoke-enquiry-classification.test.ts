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

// Renamed: routing no longer archives anything. Classifying a sales lead as a
// supplier used to call leads.delete() — a real storage.del() — destroying the
// meeting notes, call recordings, sales presentations and journey events with
// it. The delete was also redundant: isLeadJourneyEligible already excludes a
// lead whose classification is not "sales", on every Journey surface.
//
// This test previously pinned that delete as the contract. It now pins its
// absence, which is what the behaviour actually needs to guarantee.
test("classification routing retains history and keeps precise destinations", () => {
  // Strip comments: the route explains WHY the delete was removed, and a
  // doesNotMatch would otherwise trip on the prose describing the old
  // behaviour rather than the behaviour itself.
  const routeRaw = readFileSync("src/app/api/portal/website-enquiries/classification/route.ts", "utf8");
  const route = routeRaw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter(line => !line.trim().startsWith("//"))
    .join("\n");
  const inbox = readFileSync("src/app/portal/agency/inbox/_MasterInbox.tsx", "utf8");
  const detailCard = readFileSync("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx", "utf8");
  const journey = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx", "utf8");
  const radar = readFileSync("src/lib/server/businessIssueRadar.ts", "utf8");
  const alerts = readFileSync("src/lib/server/operationalAlerts.ts", "utf8");

  assert.match(route, /classification === "sales"/);
  assert.doesNotMatch(route, /leads\.delete\(/,
    "the lead carries history that cannot be rebuilt — it must be retained, not deleted");
  assert.doesNotMatch(route, /contacts\.delete\(/,
    "retained contacts preserve a prior judgement about the same person");
  assert.match(route, /leads\.update\(/,
    "the lead is updated with its new classification instead");
  assert.match(route, /enquiryClassification: classification/,
    "the retained lead must carry the classification isLeadJourneyEligible filters on");
  assert.match(route, /ensureLeadCard/,
    "returning to sales must restore the kanban card, or the lead is invisible in Journey");
  assert.match(route, /removeLeadCards/);
  assert.match(route, /classificationContactType/);
  assert.match(route, /classification === "spam"/);
  assert.match(route, /enquiryClassificationHistory/);
  assert.match(inbox, /Every classification/);
  assert.match(inbox, /Classify enquiry from/);
  assert.match(detailCard, /Excluded from Journey/);
  assert.match(journey, /leadList\.filter\(isLeadJourneyEligible\)/);
  assert.match(radar, /enquiry\.classification === "sales"/);
  assert.match(alerts, /Classify enquiry from/);
});
