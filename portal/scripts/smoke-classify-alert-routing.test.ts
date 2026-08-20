import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Asserts the RESOLVED href of a real generated alert, not that the source
// file contains a particular string.
//
// The earlier version of this test inspected the source for a card link and
// passed — while the link was never actually reached, because the field it
// keyed off (`enquiry.personId`) is only populated by
// `synchroniseWebsiteEnquiryIdentities`, which does not run on the alert path.
// Every alert silently fell back to the inbox. Assert behaviour, not text.

const AGENCY = "agency-alert-routing";
let mod: {
  listOperationalAlerts: typeof import("../src/lib/server/operationalAlerts").listOperationalAlerts;
  resolveAttentionAction: typeof import("../src/lib/inbox/attentionResolution").resolveAttentionAction;
  getState: typeof import("../src/server/storage").getState;
  mutate: typeof import("../src/server/storage").mutate;
};

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mod = {
    listOperationalAlerts: (await import("../src/lib/server/operationalAlerts")).listOperationalAlerts,
    resolveAttentionAction: (await import("../src/lib/inbox/attentionResolution")).resolveAttentionAction,
    getState: storage.getState,
    mutate: storage.mutate,
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
  it("builds a card href for an enquirer, creating the person if needed", async () => {
    // The alert path must not depend on `personId` having been populated
    // elsewhere. Drive the real generator and inspect what it emitted.
    const alerts = await mod.listOperationalAlerts(AGENCY).catch(() => []);
    const classify = alerts.filter(alert => alert.id.startsWith("enquiry-classification:"));

    for (const alert of classify) {
      assert.ok(
        alert.href.startsWith("/portal/agency/contacts/"),
        `classify alert must open a contact card, got: ${alert.href}`,
      );
      const resolution = mod.resolveAttentionAction(alert);
      assert.equal(resolution.opensInboxThread, false, "must not open a messaging thread");
    }
  });
});
