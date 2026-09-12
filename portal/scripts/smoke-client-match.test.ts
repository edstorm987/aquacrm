import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientMatchesContact, clientMatchesLead } from "../src/built-ins/modules/leads-pipeline/src/lib/clientMatch";
import type { Client } from "../src/server/types";
import type { Contact, Lead } from "../src/built-ins/modules/leads-pipeline/src/lib/domain";

const client = {
  id: "cli_existing",
  agencyId: "agency",
  name: "Existing client",
  slug: "existing-client",
  brand: {
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    accentColor: "#888888",
    fontHeading: "sans-serif",
    fontBody: "sans-serif",
    borderRadius: "8px",
  },
  stage: "discovery",
  status: "active",
  metadata: {},
  createdAt: 1,
  updatedAt: 1,
} satisfies Client;

const contact = {
  id: "ctc_new",
  agencyId: "agency",
  email: "new@example.com",
  type: "lead",
  tags: [],
  source: "manual",
  createdAt: 1,
  updatedAt: 1,
} satisfies Contact;

const lead = {
  id: "lead_new",
  agencyId: "agency",
  email: "new@example.com",
  tags: [],
  source: "manual",
  capturedAt: 1,
} satisfies Lead;

describe("lead and contact client matching", () => {
  it("does not match unrelated records when optional identifiers are absent", () => {
    assert.equal(clientMatchesContact(client, contact), false);
    assert.equal(clientMatchesLead(client, lead), false);
  });

  it("does not treat email or free-form client metadata as an identity edge", () => {
    const forged = {
      ...client,
      ownerEmail: " NEW@example.com ",
      metadata: {
        leadId: lead.id,
        contactId: contact.id,
        promotedFromLeadId: "lead_source",
        linkedContacts: [{ id: contact.id, email: contact.email }],
      },
    };
    assert.equal(clientMatchesContact(forged, { ...contact, promotedFromLeadId: "lead_source" }), false);
    assert.equal(clientMatchesLead(forged, lead), false);
  });

  it("matches leads only through a typed direct client id or canonical person id", () => {
    assert.equal(clientMatchesLead(client, { ...lead, clientId: client.id }), true);
    assert.equal(clientMatchesLead(client, { ...lead, convertedClientId: client.id }), true);
    assert.equal(clientMatchesLead({ ...client, personId: "person_exact" }, { ...lead, personId: "person_exact" }), true);
    assert.equal(clientMatchesLead({ ...client, personId: "person_a" }, { ...lead, personId: "person_b" }), false);
  });

  it("matches contacts only through a typed direct client id or canonical person id", () => {
    assert.equal(clientMatchesContact(client, { ...contact, clientId: client.id }), true);
    assert.equal(clientMatchesContact({ ...client, personId: "person_exact" }, { ...contact, personId: "person_exact" }), true);
    assert.equal(clientMatchesContact({ ...client, personId: "person_a" }, { ...contact, personId: "person_b" }), false);
  });
});
