import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Companies = typeof import("../src/server/tradingCompanies");
type Products = typeof import("../src/server/agencyProducts");
type CompanyProfiles = typeof import("../src/server/company");
type Legal = typeof import("../src/server/legalDocuments");
type PortalProviders = typeof import("../src/lib/server/clientPortalProvider");

let storage: Storage;
let tenants: Tenants;
let companies: Companies;
let products: Products;
let profiles: CompanyProfiles;
let legal: Legal;
let portalProviders: PortalProviders;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  companies = await import("../src/server/tradingCompanies");
  products = await import("../src/server/agencyProducts");
  profiles = await import("../src/server/company");
  legal = await import("../src/server/legalDocuments");
  portalProviders = await import("../src/lib/server/clientPortalProvider");
  await storage.ensureHydrated();
});

test("assigned company becomes the client portal provider identity", () => {
  const agency = tenants.createAgency({ name: "AquaOasis-Web Portal", slug: "aqua-client-provider-smoke" });
  const company = companies.createTradingCompany(agency.id, { name: "North Star Studio" }, "user_ed");
  const client = tenants.createClient(agency.id, { name: "Provider Test", companyId: company.id });

  assert.deepEqual(portalProviders.resolveClientPortalProvider(client), {
    company,
    name: "North Star Studio",
    mark: "N",
  });

  const unassigned = tenants.updateClient(agency.id, client.id, { companyId: null });
  assert.equal(unassigned && portalProviders.resolveClientPortalProvider(unassigned).name, "AquaOasis-Web");
});

test("AquaOasis-Web owns separately attributed service brands", () => {
  const agency = tenants.createAgency({ name: "AquaOasis-Web", slug: "aqua-service-brand-smoke" });
  const actor = "user_ed";
  const studio = companies.createTradingCompany(agency.id, {
    name: "Milesy Studio",
    brand: { primaryColor: "#145E75", accentColor: "#F2B84B" },
  }, actor);
  const local = companies.createTradingCompany(agency.id, {
    name: "Milesy Local",
    brand: { primaryColor: "#245C3A", accentColor: "#F0C36A" },
  }, actor);

  assert.equal(companies.listTradingCompanies(agency.id).length, 2);
  assert.notEqual(studio.brand.primaryColor, local.brand.primaryColor);
  assert.equal(companies.getTradingCompany(agency.id, studio.id)?.name, "Milesy Studio");
});

test("service-brand profiles are isolated while the owner workspace sees every record", () => {
  const agency = tenants.createAgency({ name: "AquaOasis-Web Scope", slug: "aqua-brand-scope-smoke" });
  const actor = "user_ed";
  const studio = companies.createTradingCompany(agency.id, { name: "Studio" }, actor);
  const local = companies.createTradingCompany(agency.id, { name: "Local" }, actor);

  profiles.updateCompanyProfile(agency.id, { mission: "Parent mission" }, actor);
  profiles.updateCompanyProfile(agency.id, { mission: "Studio mission" }, actor, studio.id);
  assert.equal(profiles.getCompanyProfile(agency.id).mission, "Parent mission");
  assert.equal(profiles.getCompanyProfile(agency.id, studio.id).mission, "Studio mission");
  assert.equal(profiles.getCompanyProfile(agency.id, local.id).mission, "");

  const shared = products.createAgencyProduct(agency.id, {
    name: "Shared discovery",
    category: "Strategy",
    pricing: "custom",
  }, actor);
  const studioOnly = products.createAgencyProduct(agency.id, {
    name: "Studio website",
    category: "Websites",
    pricing: "custom",
    companyIds: [studio.id],
  }, actor);

  assert.equal(companies.recordBelongsToCompany(shared.companyIds, studio.id), true);
  assert.equal(companies.recordBelongsToCompany(studioOnly.companyIds, studio.id), true);
  assert.equal(companies.recordBelongsToCompany(studioOnly.companyIds, local.id), false);
  assert.equal(companies.recordBelongsToCompany(studioOnly.companyIds, null), true);

  const document = legal.createLegalDocument({
    id: "legal_company_smoke",
    agencyId: agency.id,
    companyIds: [local.id],
    title: "Local terms",
    category: "contract",
    status: "active",
    fileName: "terms.pdf",
    contentType: "application/pdf",
    size: 10,
    storageProvider: "local",
    storageKey: "smoke/terms.pdf",
    createdBy: actor,
  });
  assert.equal(companies.recordBelongsToCompany(document.companyIds, local.id), true);
  assert.equal(companies.recordBelongsToCompany(document.companyIds, studio.id), false);
});
