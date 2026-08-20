import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let sources: typeof import("../src/server/websiteSources");
let companies: typeof import("../src/server/tradingCompanies");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  sources = await import("../src/server/websiteSources");
  companies = await import("../src/server/tradingCompanies");
});

describe("normalising a website address", () => {
  it("reduces a full URL and a bare domain to the same host", () => {
    assert.equal(sources.normalizeHost("https://www.Cedar-Dental.com/contact?x=1"), "cedar-dental.com");
    assert.equal(sources.normalizeHost("cedar-dental.com"), "cedar-dental.com");
    assert.equal(sources.normalizeHost("http://cedar-dental.com:443/"), "cedar-dental.com");
  });

  it("keeps a subdomain distinct — it is often a different destination", () => {
    assert.notEqual(sources.normalizeHost("book.cedar-dental.com"), sources.normalizeHost("cedar-dental.com"));
  });
});

describe("routing tagged sites", () => {
  let agencyId: string;
  let clientId: string;

  beforeEach(() => {
    storage.mutate(state => { state.websiteSources = {}; });
    const agency = tenants.createAgency({ name: "Sources Co", slug: `src-${Math.floor(performance.now())}` });
    agencyId = agency.id;
    clientId = tenants.createClient(agencyId, { name: "Cedar Dental" }).id;
  });

  it("routes an unregistered site to the agency inbox", () => {
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "cedar-dental.com"), { kind: "inbox" });
  });

  it("routes a registered client site to that client, however the URL is written", () => {
    sources.addWebsiteSource({ agencyId, host: "https://www.cedar-dental.com/", destinationClientId: clientId, createdBy: "ed" });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "cedar-dental.com"), { kind: "client", clientId });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "http://CEDAR-DENTAL.com/book"), { kind: "client", clientId });
  });

  it("routes an owner's own site to the agency inbox when no destination is chosen", () => {
    sources.addWebsiteSource({ agencyId, host: "my-new-company.com", createdBy: "ed" });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "my-new-company.com"), { kind: "inbox" });
  });

  it("refuses a second entry for the same host", () => {
    sources.addWebsiteSource({ agencyId, host: "cedar-dental.com", destinationClientId: clientId, createdBy: "ed" });
    assert.throws(() => sources.addWebsiteSource({ agencyId, host: "www.cedar-dental.com", createdBy: "ed" }));
  });

  it("refuses to route to a client that isn't this agency's", () => {
    const other = tenants.createAgency({ name: "Other", slug: `o-${Math.floor(performance.now())}` });
    const foreign = tenants.createClient(other.id, { name: "Not mine" }).id;
    assert.throws(() => sources.addWebsiteSource({ agencyId, host: "x.com", destinationClientId: foreign, createdBy: "ed" }));
  });

  it("can be re-pointed and removed", () => {
    const s = sources.addWebsiteSource({ agencyId, host: "cedar-dental.com", createdBy: "ed" });
    sources.updateWebsiteSourceRouting({ agencyId, id: s.id, destinationClientId: clientId });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "cedar-dental.com"), { kind: "client", clientId });
    sources.updateWebsiteSourceRouting({ agencyId, id: s.id, destinationClientId: undefined });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "cedar-dental.com"), { kind: "inbox" });
    assert.equal(sources.removeWebsiteSource(agencyId, s.id), true);
    assert.equal(sources.listWebsiteSources(agencyId).length, 0);
  });

  it("only one agency can see or change its own sources", () => {
    const s = sources.addWebsiteSource({ agencyId, host: "cedar-dental.com", createdBy: "ed" });
    assert.equal(sources.removeWebsiteSource("someone-else", s.id), false);
    assert.equal(sources.listWebsiteSources("someone-else").length, 0);
  });
});

describe("routing a tagged site to one of Ed's own companies", () => {
  let agencyId: string;
  let clientId: string;
  let companyId: string;

  beforeEach(() => {
    storage.mutate(state => { state.websiteSources = {}; });
    const agency = tenants.createAgency({ name: "Owner Co", slug: `own-${Math.floor(performance.now())}` });
    agencyId = agency.id;
    clientId = tenants.createClient(agencyId, { name: "A Client" }).id;
    companyId = companies.createTradingCompany(agencyId, { name: "Zimante" }, "ed").id;
  });

  it("routes a site registered to a company to that company, however the URL is written", () => {
    sources.addWebsiteSource({ agencyId, host: "zimante.com", destinationCompanyId: companyId, createdBy: "ed" });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "https://www.Zimante.com/pricing"), { kind: "company", companyId });
  });

  it("refuses to route to a company that isn't this agency's", () => {
    const other = tenants.createAgency({ name: "Other Owner", slug: `oo-${Math.floor(performance.now())}` });
    const foreign = companies.createTradingCompany(other.id, { name: "Not mine" }, "ed").id;
    assert.throws(() => sources.addWebsiteSource({ agencyId, host: "x.com", destinationCompanyId: foreign, createdBy: "ed" }));
  });

  it("refuses a site pointed at a client and a company at once", () => {
    assert.throws(() => sources.addWebsiteSource({
      agencyId, host: "y.com", destinationClientId: clientId, destinationCompanyId: companyId, createdBy: "ed",
    }));
  });

  it("re-points a site client → company → inbox, one home at a time", () => {
    const s = sources.addWebsiteSource({ agencyId, host: "swing.com", destinationClientId: clientId, createdBy: "ed" });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "swing.com"), { kind: "client", clientId });
    // Moving to a company clears the client — never both.
    sources.updateWebsiteSourceRouting({ agencyId, id: s.id, destinationCompanyId: companyId });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "swing.com"), { kind: "company", companyId });
    assert.equal(sources.listWebsiteSources(agencyId).find(x => x.id === s.id)?.destinationClientId, undefined);
    // Clearing both points it back at the agency inbox.
    sources.updateWebsiteSourceRouting({ agencyId, id: s.id });
    assert.deepEqual(sources.resolveWebsiteSourceRouting(agencyId, "swing.com"), { kind: "inbox" });
  });
});

describe("the enquiry endpoint honours the route", () => {
  const src = (require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "app", "api", "public", "brand-enquiry", "route.ts"), "utf-8") as string);

  it("looks the route up by the submission's host and lets it win over the identity guess", () => {
    assert.match(src, /resolveWebsiteSourceRouting\(agency\.id, new URL\(sourceUrl\)\.host\)/);
    assert.match(src, /routedClientId \?\? identityResolution\.clientId/);
    // A company route claims the enquiry — it is not also filed onto a client.
    assert.match(src, /const owningClientId = routedCompanyId \? undefined :/);
    assert.match(src, /routedCompanyId \? \{ routedCompanyId \} : \{\}/);
  });

  it("writes the company route under the exact key the inbox reads back", async () => {
    // Closes the loop: `routedCompanyId` was written by two endpoints and read
    // by nothing for months. Drive the real row mapper with the metadata blob
    // the endpoint builds, so a rename on either side fails here rather than
    // silently emptying the inbox's company surface.
    const enquiries = await import("../src/lib/server/websiteEnquiries");
    const agency = tenants.createAgency({ name: "Loop Co", slug: `loop-${Math.floor(performance.now())}` });
    const company = companies.createTradingCompany(agency.id, { name: "Zimante Digital" }, "ed");
    const mapped = enquiries.mapBrandEnquiryRow({
      id: "enq_loop", brand_slug: "zimante", name: "Priya Nayar",
      email: "priya@nayar-build.co.uk", phone: null, contact_method: "email",
      consent: true, services: [], message: null,
      source_url: "https://zimante.com/contact", campaign: null,
      created_at: new Date().toISOString(),
      metadata: { siteName: "Zimante", pagePath: "/contact", routedCompanyId: company.id },
    });
    assert.equal(mapped.routedCompanyId, company.id);
    const [named] = enquiries.attachRoutedCompanyNames([mapped], companies.listTradingCompanies(agency.id, true));
    assert.equal(named.routedCompanyName, "Zimante Digital");
  });
});

describe("the agency routing panel is company-aware", () => {
  const src = (require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "app", "portal", "agency", "inbox", "_WebsiteSourcesConfig.tsx"), "utf-8") as string);

  it("reads the agency's companies and can route a site to one", () => {
    assert.match(src, /companies/);
    assert.match(src, /destinationCompanyId/);
    // The dropdown value carries the destination kind so a client and a company
    // id can never be confused (and choosing one clears the other).
    assert.match(src, /company:\$\{/);
    assert.match(src, /client:\$\{/);
  });
});

describe("the tag feeds Radar — routing intelligence (Phase 5)", () => {
  const read = (relative: string) => require("node:fs").readFileSync(require("node:path").join(__dirname, "..", relative), "utf-8") as string;
  const catalogue = read("src/lib/radar/radarRuleCatalog.ts");
  const observations = read("src/lib/server/radar/radarObservations.ts");

  it("registers a sales:enquiry-routing family fed by websiteSources routing", () => {
    // A new 12-lens family in the catalogue (the golden-sweep count test pins the 2,052 total).
    assert.match(catalogue, /"enquiry-routing", "Enquiry routing coverage"/);
    // Fed by the routing registry: how many tagged sites point at a specific client/company.
    assert.match(observations, /add\("sales", "enquiry-routing"/);
    assert.match(observations, /state\.websiteSources/);
    assert.match(observations, /destinationClientId \|\| source\.destinationCompanyId/);
    // Informational (connected:true) so an all-catch-all agency is never a false blind spot.
    assert.match(observations, /countMetric\(routedWebsiteSources, null,[^)]*"sales:routing", true/);
  });
});

describe("the master tag", () => {
  let agencyId: string;
  beforeEach(() => {
    storage.mutate(state => { state.agencyMasterTagKeys = {}; });
    agencyId = tenants.createAgency({ name: "Master Co", slug: `master-${Math.floor(performance.now())}` }).id;
  });

  it("generates one stable key per agency — never rotating (it lives in site HTML)", () => {
    const first = sources.ensureAgencyMasterSiteKey(agencyId);
    const second = sources.ensureAgencyMasterSiteKey(agencyId);
    assert.equal(first, second, "asking twice must return the same key");
    assert.match(first, /^aqua_/);
  });

  it("gives different agencies different keys", () => {
    const other = tenants.createAgency({ name: "Other Master", slug: `om-${Math.floor(performance.now())}` }).id;
    assert.notEqual(sources.ensureAgencyMasterSiteKey(agencyId), sources.ensureAgencyMasterSiteKey(other));
  });

  it("resolves a submission's master key back to its agency", () => {
    const key = sources.ensureAgencyMasterSiteKey(agencyId);
    assert.equal(sources.resolveAgencyByMasterSiteKey(key), agencyId);
    assert.equal(sources.resolveAgencyByMasterSiteKey("aqua_notreal"), undefined);
  });

  it("builds a one-line install snippet on the given origin", () => {
    assert.equal(
      sources.masterTagSnippet("https://aqua-crm.com/", "aqua_abc"),
      '<script src="https://aqua-crm.com/aqua-tag.js" data-site-key="aqua_abc" defer></script>',
    );
  });
});

describe("form-capture honours the master tag", () => {
  const src = (require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "app", "api", "public", "form-capture", "route.ts"), "utf-8") as string);

  it("attributes a master-tag submission to its agency and applies host routing", () => {
    assert.match(src, /resolveAgencyByMasterSiteKey\(siteKey\)/);
    assert.match(src, /masterAgencyId \? resolveWebsiteSourceRouting\(masterAgencyId, submissionHost\)/);
  });

  it("treats a master-tag submission as a real enquiry, not a held capture", () => {
    assert.match(src, /masterAgencyId \? \{ masterTag: true, agencyId: masterAgencyId \} : \{ captureOnly: true \}/);
  });

  it("surfaces a routed master submission on the client's record", () => {
    assert.match(src, /if \(masterAgencyId && routedClientId && inserted\?\.id\)/);
    assert.match(src, /upsertClientRecordLedgerEvent\(masterAgencyId, routedClientId/);
  });

  it("records a company route on the enquiry without firing the client ledger", () => {
    assert.match(src, /destination\.kind === "company" \? destination\.companyId : undefined/);
    assert.match(src, /routedCompanyId \? \{ routedCompanyId \} : \{\}/);
  });
});
