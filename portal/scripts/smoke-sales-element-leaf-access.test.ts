import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Journey, Contacts and Person routes enforce their exact Growth elements", () => {
  const journey = read("src/app/portal/agency/pipelines/[slug]/page.tsx");
  const contacts = read("src/app/portal/agency/contacts/page.tsx");
  const contact = read("src/app/portal/agency/contacts/[personId]/page.tsx");
  const personMutation = read("src/app/api/portal/persons/[personId]/route.ts");

  assert.match(journey, /pipeline\.kind === "leads"[\s\S]*?requireCurrentWorkspaceElementAccess\("growth", "growth\.leads", "view"\)[\s\S]*?installPlugin/);
  assert.match(contacts, /requireCurrentWorkspaceElementAccess\("growth", "growth\.contacts", "view"\)/);
  assert.match(contact, /requireCurrentWorkspaceElementAccess\("growth", "growth\.contacts", "view"\)/);
  assert.match(personMutation, /requireCurrentWorkspaceElementAccess\("growth", "growth\.contacts", "use"\)/);
});

test("Person interaction reads and writes require exact lineage and client Communications grants", () => {
  const contact = read("src/app/portal/agency/contacts/[personId]/page.tsx");
  const personMutation = read("src/app/api/portal/persons/[personId]/route.ts");
  const interactions = read("src/lib/server/personInteractionsService.ts");

  assert.match(contact, /person\.facets\.clientIds[\s\S]*?requireCurrentClientWorkspaceElementAccess\(clientId, "client\.communications", "view"\)/);
  assert.match(personMutation, /action === "add-record" \|\| action === "delete-record"[\s\S]*?requireCurrentClientWorkspaceElementAccess\(clientId, "client\.communications", "use"\)/);
  assert.match(interactions, /knownEnquiries\.has\(enquiry\.id\)[\s\S]*?enquiry\.personId === personId/);
  assert.doesNotMatch(interactions, /enquiry\.email \?|enquiry\.phone \?|endsWith\(enquiry\.phone/);
});

test("Inbox identity and enquiry-to-Sales bridges require both owning elements", () => {
  const identity = read("src/app/api/portal/identity-resolution/route.ts");
  const classification = read("src/app/api/portal/website-enquiries/classification/route.ts");
  const lead = read("src/app/api/portal/website-enquiries/lead/route.ts");

  assert.match(identity, /workspace\.inbox", "view"/);
  assert.ok((identity.match(/workspace\.inbox", "use"/g) ?? []).length >= 2);
  assert.match(classification, /classificationGrowthElement\(classification\)[\s\S]*?requireCurrentWorkspaceElementAccess\("growth", growthElement, "use"\)/);
  assert.match(classification, /classification === "spam"[\s\S]*?return classification === "sales" \? "growth\.leads" : "growth\.contacts"/);
  assert.match(lead, /workspace\.inbox", "use"[\s\S]*?growth\.leads", "use"/);
});
