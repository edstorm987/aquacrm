import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

test("one client relationship can own isolated company and project workspaces", async () => {
  const { ensureHydrated } = await import("../src/server/storage");
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { createLinkedClientWorkspace, listClientRelationshipWorkspaces } = await import("../src/server/clientRelationships");
  const { clientWorkspaceDisplayName } = await import("../src/lib/clientWorkspace");
  await ensureHydrated();
  const agency = createAgency({ name: "Relationship workspace agency" });
  const original = createClient(agency.id, {
    name: "First company",
    ownerEmail: "owner@buyer.example",
    metadata: {
      portalLoginEmail: "owner@buyer.example",
      portalBuiltAt: 10,
      portalSelectedProductIds: ["service-one"],
      files: [{ id: "private-old-file" }],
      contracts: [{ id: "private-old-contract" }],
    },
  });
  const second = createLinkedClientWorkspace(agency.id, {
    sourceClientId: original.id,
    name: "Second company",
    workspaceLabel: "New launch",
    carryContact: true,
    carryServices: false,
    selectedProductIds: ["service-two", "service-two", "service-three"],
  });

  assert.equal(second.relationshipId, original.id);
  assert.equal(second.ownerEmail, original.ownerEmail);
  assert.equal(second.metadata?.portalLoginEmail, "owner@buyer.example");
  assert.equal(second.metadata?.files, undefined);
  assert.equal(second.metadata?.contracts, undefined);
  assert.deepEqual(second.metadata?.portalSelectedProductIds, ["service-two", "service-three"]);
  assert.equal(clientWorkspaceDisplayName(second), "Second company · New launch");
  assert.deepEqual(listClientRelationshipWorkspaces(agency.id, original.id).map(item => item.id), [original.id, second.id]);
});

test("existing workspaces can be linked and detached without merging their records", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { linkClientWorkspaces, listClientRelationshipWorkspaces, unlinkClientWorkspace } = await import("../src/server/clientRelationships");
  const agency = createAgency({ name: "Relationship linking agency" });
  const first = createClient(agency.id, { name: "Historic Milesymedia project", metadata: { files: ["historic"] } });
  const second = createClient(agency.id, { name: "New company project", metadata: { files: ["new"] } });
  linkClientWorkspaces(agency.id, first.id, second.id);
  assert.equal(listClientRelationshipWorkspaces(agency.id, first.id).length, 2);
  assert.deepEqual(first.metadata?.files, ["historic"]);
  assert.deepEqual(second.metadata?.files, ["new"]);
  unlinkClientWorkspace(agency.id, second.id);
  assert.deepEqual(listClientRelationshipWorkspaces(agency.id, first.id).map(item => item.id), [first.id]);
  assert.deepEqual(listClientRelationshipWorkspaces(agency.id, second.id).map(item => item.id), [second.id]);

  linkClientWorkspaces(agency.id, first.id, second.id);
  unlinkClientWorkspace(agency.id, first.id, second.id);
  assert.deepEqual(listClientRelationshipWorkspaces(agency.id, first.id).map(item => item.id), [first.id]);
  assert.deepEqual(listClientRelationshipWorkspaces(agency.id, second.id).map(item => item.id), [second.id]);
});

test("customer portal switching requires an explicit relationship and exact portal email", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { linkClientWorkspaces, listAccessibleClientPortals } = await import("../src/server/clientRelationships");
  const agency = createAgency({ name: "Portal switch agency" });
  const first = createClient(agency.id, { name: "First portal", metadata: { portalLoginEmail: "owner@example.test", portalBuiltAt: 10 } });
  const second = createClient(agency.id, { name: "Second portal", metadata: { portalLoginEmail: "owner@example.test", portalBuiltAt: 20 } });
  const unrelated = createClient(agency.id, { name: "Same email but unrelated", metadata: { portalLoginEmail: "owner@example.test", portalBuiltAt: 30 } });
  const wrongEmail = createClient(agency.id, { name: "Wrong email", metadata: { portalLoginEmail: "other@example.test", portalBuiltAt: 40 } });
  linkClientWorkspaces(agency.id, first.id, second.id);
  linkClientWorkspaces(agency.id, first.id, wrongEmail.id);

  const accessible = listAccessibleClientPortals(agency.id, first.id, "OWNER@example.test");
  assert.deepEqual(new Set(accessible.map(item => item.id)), new Set([first.id, second.id]));
  assert.ok(!accessible.some(item => item.id === unrelated.id));
  assert.ok(!accessible.some(item => item.id === wrongEmail.id));
});

test("relationship record view aggregates linked workspaces without changing record ownership", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { linkClientWorkspaces } = await import("../src/server/clientRelationships");
  const { queryClientRecordLedger, upsertClientRecordLedgerEvent } = await import("../src/lib/server/clientRecordLedger");
  const agency = createAgency({ name: "Relationship record agency" });
  const first = createClient(agency.id, { name: "First operating company" });
  const second = createClient(agency.id, { name: "Second operating company" });
  linkClientWorkspaces(agency.id, first.id, second.id);
  upsertClientRecordLedgerEvent(agency.id, first.id, { sourceType: "record-entry", sourceId: "first-note", group: "notes", title: "First workspace decision", occurredAt: 100, eyebrow: "decision", visibility: "internal" });
  upsertClientRecordLedgerEvent(agency.id, second.id, { sourceType: "record-entry", sourceId: "second-note", group: "notes", title: "Second workspace decision", occurredAt: 200, eyebrow: "decision", visibility: "internal" });

  const single = queryClientRecordLedger({ agencyId: agency.id, clientId: first.id });
  const relationship = queryClientRecordLedger({ agencyId: agency.id, clientId: first.id, clientIds: [first.id, second.id] });
  assert.equal(single.retainedTotal, 1);
  assert.equal(relationship.retainedTotal, 2);
  assert.deepEqual(new Set(relationship.events.map(event => event.clientId)), new Set([first.id, second.id]));
});

test("dual-workspace controls are available internally and in the customer portal", () => {
  const internal = readFileSync("src/app/portal/clients/[clientId]/_ClientWorkspaceSwitcher.tsx", "utf8");
  const record = readFileSync("src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx", "utf8");
  const overview = readFileSync("src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx", "utf8");
  const customer = readFileSync("src/app/portal/customer/_CustomerPortalChrome.tsx", "utf8");
  const route = readFileSync("src/app/api/portal/customer/workspace/route.ts", "utf8");
  const workspaceRoute = readFileSync("src/app/api/tenants/client-workspaces/route.ts", "utf8");
  const ledgerRoute = readFileSync("src/app/api/tenants/client-record-ledger/route.ts", "utf8");
  assert.match(internal, /New separate workspace/);
  assert.match(internal, /Link existing/);
  assert.match(internal, /View portal/);
  assert.match(internal, /Portal studio/);
  assert.match(internal, /Prepare portal/);
  assert.match(internal, /Initial services/);
  assert.match(internal, /Use current selection/);
  assert.match(internal, /productIds/);
  assert.match(internal, /Project: \$\{item\.workspaceLabel\}/);
  assert.match(internal, /item\.providerName/);
  assert.match(internal, /item\.relationshipWorkspaceCount/);
  assert.match(internal, /Detach this workspace\?/);
  assert.match(record, /Whole buyer relationship/);
  assert.match(record, /clientId: item\.clientId/);
  assert.match(overview, /Buyer portfolio/);
  assert.match(overview, /isolated client workspaces/);
  assert.match(overview, /Services needed/);
  assert.match(overview, /workspace\.serviceNames/);
  assert.match(overview, /workspace\.openRequests/);
  assert.match(overview, /deliveryAttention/);
  assert.match(overview, /portfolioAttentionCount/);
  assert.match(overview, /Assign services/);
  assert.match(overview, /Aqua Health/);
  assert.match(overview, /workspace\.outstandingCents/);
  assert.match(overview, /workspace\.portalAccessState/);
  assert.match(overview, /Manage access/);
  assert.match(overview, /Open Aqua Health/);
  assert.match(overview, /Open client requests and messages/);
  assert.match(overview, /Open contracts, invoices and payment plans/);
  assert.match(customer, /Switch client workspace/);
  assert.match(route, /listAccessibleClientPortals/);
  assert.match(workspaceRoute, /resolveAgencyProductAssignment/);
  assert.match(workspaceRoute, /reconcileClientProductWorkspaces/);
  assert.match(workspaceRoute, /linked-workspace-creation/);
  assert.match(ledgerRoute, /listClientRelationshipWorkspaces/);
});

test("Journey and Fulfilment identify linked buyers without merging project operations", () => {
  const clientsPage = readFileSync("src/app/portal/clients/page.tsx", "utf8");
  const people = readFileSync("src/app/portal/clients/_PeopleHub.tsx", "utf8");
  const journey = readFileSync("src/app/portal/clients/_JourneyCommercialWorkspace.tsx", "utf8");
  const fulfilmentPage = readFileSync("src/app/portal/agency/fulfilment/page.tsx", "utf8");
  const fulfilment = readFileSync("src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx", "utf8");
  const search = readFileSync("src/app/api/portal/search/route.ts", "utf8");
  const telemetry = readFileSync("src/lib/server/radarTelemetry.ts", "utf8");
  const intelligence = readFileSync("src/lib/server/commandIntelligence.ts", "utf8");
  const probes = readFileSync("src/lib/server/radarSyntheticProbes.ts", "utf8");
  const inbox = readFileSync("src/app/portal/agency/inbox/page.tsx", "utf8");
  const marketing = readFileSync("src/app/portal/agency/marketing/page.tsx", "utf8");
  const development = readFileSync("src/app/portal/agency/development/page.tsx", "utf8");
  const externalAssistant = readFileSync("src/lib/server/externalAssistantApi.ts", "utf8");
  const advisor = readFileSync("src/lib/server/advisorSkillContext.ts", "utf8");

  assert.match(clientsPage, /relationshipWorkspaceCounts/);
  assert.match(people, /Linked buyer · \{count\} workspaces/);
  assert.match(people, /client\.workspaceLabel/);
  assert.match(journey, /Project: \{client\.workspaceLabel\}/);
  assert.match(journey, /client\.relationshipWorkspaceCount/);
  assert.match(fulfilmentPage, /linked buyer \(\$\{linkedCount\}\)/);
  assert.match(fulfilment, /isolated project workspaces belong to this buyer relationship/);
  assert.match(fulfilment, /clientWorkspaceDisplayName\(client\)/);
  assert.match(search, /Linked buyer · \$\{relationshipWorkspaceCount\} workspaces/);
  assert.match(search, /addNestedClientCandidates\(candidates, client\.id, clientContext, metadata\)/);
  assert.match(telemetry, /clientWorkspaceDisplayName\(client\)/);
  assert.match(intelligence, /clientWorkspaceHref\(client\.id, "relationship"\)/);
  assert.doesNotMatch(intelligence, /tab=health/);
  assert.match(probes, /clientWorkspaceDisplayName\(client\)/);
  assert.match(inbox, /clientName: clientLabel/);
  assert.match(marketing, /clientWorkspaceDisplayName\(selectedClient\)/);
  assert.match(development, /clientName: clientLabel/);
  assert.match(externalAssistant, /record\(module, client\.id, clientWorkspaceDisplayName\(client\), client\)/);
  assert.match(advisor, /name: clientWorkspaceDisplayName\(client\)/);
});
