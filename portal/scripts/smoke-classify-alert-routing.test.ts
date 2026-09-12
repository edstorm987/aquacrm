import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { WebsiteEnquiry } from "../src/lib/server/websiteEnquiries";

// Asserts the RESOLVED href of a real generated alert, not that the source
// file contains a particular string.
//
// A canonical Person already admitted by a write path resolves to the protected
// card. A legacy enquiry without one resolves to its exact inbox detail. Alert
// generation itself must not create either record. Assert behaviour, not text.

let agencyId = "";
let mod: {
  listOperationalAlerts: typeof import("../src/lib/server/inbox/operationalAlerts").listOperationalAlerts;
  resolveAttentionAction: typeof import("../src/lib/inbox/attentionResolution").resolveAttentionAction;
  getState: typeof import("../src/server/storage").getState;
  upsertPerson: typeof import("../src/server/persons").upsertPerson;
};

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  await storage.reset();
  const tenants = await import("../src/server/tenants");
  const installs = await import("../src/server/pluginInstalls");
  const persons = await import("../src/server/persons");
  agencyId = tenants.createAgency({ name: "Alert routing", slug: "alert-routing" }).id;
  installs.upsertInstall({
    pluginId: "leads-pipeline",
    scope: { agencyId },
    enabled: true,
    config: {},
    features: {},
  });
  mod = {
    listOperationalAlerts: (await import("../src/lib/server/inbox/operationalAlerts")).listOperationalAlerts,
    resolveAttentionAction: (await import("../src/lib/inbox/attentionResolution")).resolveAttentionAction,
    getState: storage.getState,
    upsertPerson: persons.upsertPerson,
  };
});

describe("resolution guidance follows the destination", () => {
  it("describes the contact card, and does not open an inbox thread", () => {
    const resolution = mod.resolveAttentionAction({
      href: "/portal/agency/contacts/per_123",
      category: "client",
    } as never);
    assert.match(resolution.destination, /contact card/i);
    assert.equal(resolution.opensInboxThread, false);
  });

  it("still treats a genuine inbox link as an inbox thread", () => {
    const resolution = mod.resolveAttentionAction({
      href: "/portal/agency/inbox?view=enquiries&form=abc",
      category: "client",
    } as never);
    assert.equal(resolution.opensInboxThread, true);
  });
});

describe("the classify alert resolves to a contact card", () => {
  it("uses an existing Person without writing, and gives legacy rows an exact fallback", async () => {
    const admitted = enquiry("admitted", "admitted@example.test");
    const legacy = enquiry("legacy", "legacy@example.test");
    const { person } = mod.upsertPerson(agencyId, {
      emails: [admitted.email],
      name: admitted.name,
      source: "website:test",
      facets: { enquiryIds: [admitted.id] },
    });
    const peopleBefore = structuredClone(mod.getState().persons);
    const generated = await mod.listOperationalAlerts(agencyId, Date.now(), {
      websiteEnquiries: { available: true, data: [admitted, legacy] },
    });

    const admittedAlert = generated.find(alert => alert.id === `enquiry-classification:${admitted.id}`);
    const legacyAlert = generated.find(alert => alert.id === `enquiry-classification:${legacy.id}`);
    assert.ok(admittedAlert);
    assert.match(admittedAlert.href, new RegExp(`^/portal/agency/contacts/${person.id}`));
    assert.equal(mod.resolveAttentionAction(admittedAlert).opensInboxThread, false);
    assert.ok(legacyAlert);
    assert.match(legacyAlert.href, /^\/portal\/agency\/inbox\?view=forms&form=legacy/);
    assert.equal(mod.resolveAttentionAction(legacyAlert).opensInboxThread, true);
    assert.deepEqual(mod.getState().persons, peopleBefore, "an operational-alert read changed canonical people");
  });
});

function enquiry(id: string, email: string): WebsiteEnquiry {
  return {
    id,
    brand: "aquacrm",
    brandName: "AquaCRM",
    source: "website:test",
    channel: "form",
    status: "open",
    classification: "unclassified",
    priority: "normal",
    topic: "General enquiry",
    suggestedAction: "Review and classify.",
    propertyId: "property_test",
    siteName: "Test site",
    pagePath: "/contact",
    name: `${id} person`,
    email,
    services: [],
    submittedAt: Date.now() - 60_000,
    replies: [],
    calls: [],
    notification: "not-configured",
  };
}
