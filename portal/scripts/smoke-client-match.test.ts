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
  email: "new@example.com",
  type: "lead",
  tags: [],
  source: "manual",
  createdAt: 1,
  updatedAt: 1,
} satisfies Contact;

const lead = {
  id: "lead_new",
  email: "new@example.com",
  tags: [],
  source: "manual",
  capturedAt: 1,
  status: "new",
} satisfies Lead;

describe("lead and contact client matching", () => {
  it("does not match unrelated records when optional identifiers are absent", () => {
    assert.equal(clientMatchesContact(client, contact), false);
    assert.equal(clientMatchesLead(client, lead), false);
  });

  it("matches only a real contact id, promoted lead id, or owner email", () => {
    assert.equal(clientMatchesContact({ ...client, metadata: { contactId: contact.id } }, contact), true);
    assert.equal(clientMatchesContact(
      { ...client, metadata: { promotedFromLeadId: "lead_source" } },
      { ...contact, promotedFromLeadId: "lead_source" },
    ), true);
    assert.equal(clientMatchesContact({ ...client, ownerEmail: " NEW@example.com " }, contact), true);
  });

  it("matches leads by real lead id or normalized owner email", () => {
    assert.equal(clientMatchesLead({ ...client, metadata: { leadId: lead.id } }, lead), true);
    assert.equal(clientMatchesLead({ ...client, ownerEmail: "New@Example.com" }, lead), true);
  });
});
