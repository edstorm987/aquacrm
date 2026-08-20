import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Enquiry contact details — the operator's manual layer (enquiry-detail-card
// plan, Phase 4). What the form never asked is recorded here, file-backed and
// agency-scoped, never touching the live enquiry row.

describe("enquiry contact details store (Phase 4)", () => {
  let storage: typeof import("../src/server/storage");
  let tenants: typeof import("../src/server/tenants");
  let details: typeof import("../src/server/enquiryContactDetails");
  let agencyId: string;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    tenants = await import("../src/server/tenants");
    details = await import("../src/server/enquiryContactDetails");
  });

  beforeEach(() => {
    storage.mutate(state => { state.enquiryContactDetails = {}; });
    agencyId = tenants.createAgency({ name: "Details Co", slug: `det-${Math.floor(performance.now())}` }).id;
  });

  it("saves and reads back company, job title, notes and custom fields", () => {
    const saved = details.saveEnquiryContactDetails({
      agencyId, enquiryId: "enq_1", company: "Innes & Co", jobTitle: "Owner",
      notes: "Met at the expo.", customFields: { Budget: "£10k", Timeline: "Spring" }, updatedBy: "ed",
    });
    assert.equal(saved.company, "Innes & Co");
    const read = details.getEnquiryContactDetails(agencyId, "enq_1");
    assert.equal(read?.jobTitle, "Owner");
    assert.equal(read?.notes, "Met at the expo.");
    assert.deepEqual(read?.customFields, { Budget: "£10k", Timeline: "Spring" });
    assert.ok(read?.updatedAt);
  });

  it("drops blank fields and blank custom key/value pairs", () => {
    const saved = details.saveEnquiryContactDetails({
      agencyId, enquiryId: "enq_2", company: "   ", customFields: { "": "x", k: "  ", good: "yes" }, updatedBy: "ed",
    });
    assert.equal(saved.company, undefined, "a blank field is not stored");
    assert.deepEqual(saved.customFields, { good: "yes" }, "only clean key/value pairs are kept");
  });

  it("won't return, or let another workspace overwrite, an enquiry's details", () => {
    details.saveEnquiryContactDetails({ agencyId, enquiryId: "enq_3", company: "Mine", customFields: {}, updatedBy: "ed" });
    const other = tenants.createAgency({ name: "Other", slug: `oth-${Math.floor(performance.now())}` }).id;
    assert.equal(details.getEnquiryContactDetails(other, "enq_3"), null, "another agency can't read it");
    assert.throws(
      () => details.saveEnquiryContactDetails({ agencyId: other, enquiryId: "enq_3", company: "Theirs", customFields: {}, updatedBy: "x" }),
      /another workspace/,
    );
  });

  it("requires an enquiry id", () => {
    assert.throws(() => details.saveEnquiryContactDetails({ agencyId, enquiryId: "", customFields: {}, updatedBy: "ed" }), /required/);
  });
});

describe("the contact-details route + card are wired (Phase 4)", () => {
  const read = (relative: string) => readFileSync(join(__dirname, "..", relative), "utf-8");
  const route = read("src/app/api/portal/website-enquiries/contact-details/route.ts");
  const card = read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");

  it("the route is agency-scoped and read/writes the store, never the live row", () => {
    assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
    assert.match(route, /getEnquiryContactDetails/);
    assert.match(route, /saveEnquiryContactDetails/);
    assert.doesNotMatch(route, /createSupabaseAdminClient|brand_enquiries/, "manual details must not touch the live enquiry row");
  });

  it("the card offers an editable 'Added by hand' layer that saves", () => {
    assert.match(card, /<ManualContactDetails enquiryId=\{item\.id\}/);
    assert.match(card, /Added by hand/);
    assert.match(card, /website-enquiries\/contact-details/);
    assert.match(card, /Save details/);
  });
});
