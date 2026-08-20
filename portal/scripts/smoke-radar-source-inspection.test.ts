import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Radar source records remain tenant scoped and owner or manager only", () => {
  const route = read("src/app/api/portal/advisor/radar/sources/route.ts");
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
  assert.match(route, /session\.agencyId/);
  assert.match(route, /datasetId\.length > 240/);
  assert.match(route, /private, no-store/);
  assert.match(inspector, /listClients\(agencyId/);
  assert.match(inspector, /pipeline\.agencyId === agencyId/);
  assert.match(inspector, /entry\.agencyId === agencyId/);
  assert.match(inspector, /install\.agencyId === agencyId/);
  assert.match(inspector, /listInboxSnapshot\(agencyId\)/);
  assert.match(inspector, /listRadarLeads\(agencyId/);
  assert.match(inspector, /state\.agencies\[agencyId\]\?\.slug === FOUNDER_AGENCY_SLUG/);
  // The contract is the GATE: public enquiry rows are read only when the agency
  // is the canonical founder workspace, otherwise an empty list. The reader
  // itself may be the request-deduped wrapper (`getRequestWebsiteEnquiries`) or
  // the raw `listWebsiteEnquiries` — both hit the same query — so match either
  // rather than pinning one identifier and failing on a perf refactor.
  assert.match(inspector, /canInspectPublicEnquiries \? (?:getRequest|list)WebsiteEnquiries\(agencyId, 500\) : Promise\.resolve\(\[\]\)/);
});

test("Radar source records redact credentials before display or export", () => {
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  assert.match(inspector, /SECRET_KEY/);
  assert.match(inspector, /passwordhash/);
  assert.match(inspector, /accessToken/);
  assert.match(inspector, /encryptedSecrets/);
  assert.match(inspector, /"\[redacted\]"/);
  assert.match(inspector, /"\[embedded binary data omitted\]"/);
  assert.doesNotMatch(inspector, /passwordHash: user\.passwordHash/);
  assert.doesNotMatch(inspector, /encryptedSecrets: record\.encryptedSecrets/);
});

test("Radar source API supports bounded paging and complete JSON archives", () => {
  const route = read("src/app/api/portal/advisor/radar/sources/route.ts");
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  assert.match(route, /boundedInteger\(params\.get\("offset"\), 0, 1_000_000, 0\)/);
  assert.match(route, /boundedInteger\(params\.get\("limit"\), 1, 250, 100\)/);
  assert.match(route, /content-disposition/);
  assert.match(route, /exportRadarSourceData/);
  assert.match(inspector, /hasMore: safeOffset \+ safeLimit < dataset\.records\.length/);
  assert.match(inspector, /dataset\.records\.slice\(safeOffset, safeOffset \+ safeLimit\)/);
  assert.match(inspector, /EXTERNAL_SOURCE_TIMEOUT_MS = 4_000/);
  assert.match(inspector, /SOURCE_CACHE_TTL_MS = 15_000/);
  assert.match(route, /invalidateRadarSourceInspection\(session\.agencyId\)/);
});

test("Radar audit room exposes underlying source datasets and raw records", () => {
  const workspace = read("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx");
  assert.match(workspace, /\["records", "Source records"/);
  assert.match(workspace, /Operational source catalogue/);
  assert.match(workspace, /Actual records behind Radar conclusions/);
  assert.match(workspace, /Raw records/);
  assert.match(workspace, /Export all sources/);
  assert.match(workspace, /Export dataset/);
  assert.match(workspace, /Previous source record page/);
  assert.match(workspace, /Next source record page/);
  assert.match(workspace, /JSON\.stringify\(record, null, 2\)/);
});

test("source catalogue spans the operational records Radar relies on", () => {
  const inspector = read("src/engines/data/server/radar/radarSourceInspection.ts");
  for (const dataset of [
    "core:clients",
    "core:tasks",
    "core:activity",
    "core:team",
    "core:company",
    "core:legal",
    "core:pipelines",
    "core:pipeline-cards",
    "core:products",
    "core:milestones",
    "core:automations",
    "core:automation-runs",
    "core:website-telemetry",
    "core:synthetic-probes",
    "external:website-enquiries",
    "external:social-conversations",
    "external:social-messages",
    "module:lead-records",
  ]) assert.match(inspector, new RegExp(dataset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(inspector, /plugin:\$\{install\.id\}/);
});
