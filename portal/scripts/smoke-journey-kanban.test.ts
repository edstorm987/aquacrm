import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Journey embeds the canonical pipeline workspace instead of linking away", () => {
  const hub = readFileSync("src/app/portal/clients/_PeopleHub.tsx", "utf8");
  const page = readFileSync("src/app/portal/clients/page.tsx", "utf8");

  assert.match(hub, /view === "journey" \? <div className="mt-6 min-w-0">\{journeyWorkspace\}<\/div>/);
  assert.doesNotMatch(hub, /Open journey workspace/);
  assert.match(page, /LeadsPipelineWorkspaceServer/);
  assert.match(page, /pipeline=\{<LeadsPipelineWorkspaceServer/);
});

test("Clients, contacts and the live Journey workspace share brand and service scope", () => {
  const hub = readFileSync("src/app/portal/clients/_PeopleHub.tsx", "utf8");
  const workspace = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx", "utf8");
  const server = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx", "utf8");

  assert.match(hub, /Filter by brand/);
  assert.match(hub, /Filter by service/);
  assert.match(hub, /client\.serviceIds\.includes\(serviceFilter\)/);
  assert.match(hub, /contact\.brandIds\.includes\(brandFilter\)/);
  assert.match(workspace, /lead\.brandId === brandFilter/);
  assert.match(workspace, /lead\.serviceIds\.includes\(serviceFilter\)/);
  assert.match(workspace, /const timingRows = scopedLeads/);
  assert.match(workspace, /companyId: form\.brandId \|\| undefined/);
  assert.match(workspace, /serviceLines: form\.serviceId \? \[form\.serviceId\] : undefined/);
  assert.match(server, /resolvePortalProductAssignment\(clientMetadata, productCatalogue\)\.products/);
});
