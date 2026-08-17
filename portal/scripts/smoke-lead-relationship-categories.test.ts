import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  inferLeadRelationshipCategory,
  isLeadRelationshipCategory,
} from "../src/built-ins/modules/leads-pipeline/src/lib/domain";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("lead relationship categories preserve context separately from attribution", () => {
  assert.equal(inferLeadRelationshipCategory({ source: "website:contact" }), "inbound-enquiry");
  assert.equal(inferLeadRelationshipCategory({ source: "csv:google-maps-export.csv" }), "scraped-list");
  assert.equal(inferLeadRelationshipCategory({ source: "manual", tags: ["met-at-networking-event"] }), "networking");
  assert.equal(inferLeadRelationshipCategory({ source: "manual", tags: ["family"] }), "friends-family");
  assert.equal(inferLeadRelationshipCategory({ relationshipCategory: "referral", source: "csv:list.csv" }), "referral");
  assert.equal(isLeadRelationshipCategory("personal-contact"), true);
  assert.equal(isLeadRelationshipCategory("random-value"), false);
});

test("Journey exposes category capture, filtering, cards and workspace editing", () => {
  const workspace = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
  assert.match(workspace, /How do you know this lead\?/);
  assert.match(workspace, /Every relationship/);
  assert.match(workspace, /How this relationship began/);
  assert.match(workspace, /Relationship category/);
  assert.match(workspace, /updateLeadCategory/);
});

test("spreadsheet imports default to a visible scraped-list category and accept row overrides", () => {
  const contacts = read("src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx");
  const handlers = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");
  const service = read("src/built-ins/modules/leads-pipeline/src/server/leads.ts");
  assert.match(contacts, /useState<LeadRelationshipCategory>\("scraped-list"\)/);
  assert.match(contacts, /defaultRelationshipCategory/);
  assert.match(contacts, /value: "relationshipCategory"/);
  assert.match(handlers, /defaultRelationshipCategory/);
  assert.match(service, /cell\("relationshipCategory"\)/);
  assert.match(service, /args\.defaultRelationshipCategory \?\? "scraped-list"/);
});

test("People Hub exposes leads as a categorised top-level view", () => {
  const hub = read("src/app/portal/clients/_PeopleHub.tsx");
  const route = read("src/app/portal/clients/page.tsx");
  assert.match(hub, /label="Leads"/);
  assert.match(hub, /view === "leads"/);
  assert.match(hub, /Every lead category/);
  assert.match(hub, /LEAD_RELATIONSHIP_CATEGORY_LABELS\[category\]/);
  assert.match(hub, /Open workspace/);
  assert.match(hub, /href=\{`\/portal\/clients\/\$\{client\.id\}\?tab=notes`\}/);
  assert.match(hub, /internal client record/);
  assert.match(hub, /Latest enquiry is awaiting a response/);
  assert.doesNotMatch(hub, /label="All"/);
  assert.match(hub, /"Other contacts"/);
  assert.match(route, /requestedView === "leads"/);
  assert.match(route, /requestedView === "all"[\s\S]*\? "contacts"/);
  assert.match(route, /relationshipCategory: inferLeadRelationshipCategory\(lead\)/);
});
