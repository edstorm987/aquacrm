// Seeds the `Bare Co` dev tenant with contact/company fixtures covering every
// card state, so dev mode always has something meaningful to drive.
//
// Idempotent — re-run freely. Safe by construction: refuses to run against a
// durable backend, the same guard dev mode itself uses.
//
//   PORTAL_BACKEND=file npx tsx scripts/seed-dev-tenant.ts

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true,
  exports: {}, paths: [], children: [],
} as never;

async function main() {
  const { ensureHydrated, getState, flushPendingWrites, getBackendInfo } = await import("@/server/storage");
  const { createAgency } = await import("@/server/tenants");
  const {
    upsertPerson, classifyPerson, decidePersonOrganisation, addPersonPhone, updatePerson,
  } = await import("@/server/persons");
  const { upsertOrganisation } = await import("@/server/organisations");
  const { DEV_AGENCY_NAME, DEV_AGENCY_SLUG } = await import("@/lib/server/dev/devMode");

  await ensureHydrated();

  const backend = getBackendInfo().kind;
  if (backend !== "file" && backend !== "memory") {
    throw new Error(
      `Refusing to seed the dev tenant against the "${backend}" backend — that is real data. `
      + `Run with PORTAL_BACKEND=file.`,
    );
  }

  const agency = Object.values(getState().agencies)
    .find(entry => entry.slug === DEV_AGENCY_SLUG || entry.id === DEV_AGENCY_SLUG)
    ?? createAgency({ name: DEV_AGENCY_NAME, slug: DEV_AGENCY_SLUG });
  const agencyId = agency.id;

  // ── A company with a confirmed contact and an unconfirmed colleague ──
  const { organisation: cedar } = upsertOrganisation(agencyId, {
    name: "Cedar Dental",
    domain: "cedardental.co.uk",
    website: "https://cedardental.co.uk",
    classification: "sales",
    source: "dev-seed",
  });

  const { person: ruth } = upsertPerson(agencyId, {
    emails: ["ruth@cedardental.co.uk", "ruth.adeyemi@gmail.com"],
    phones: ["07305 410203"],
    name: "Ruth Adeyemi",
    company: "Cedar Dental",
    jobTitle: "Practice Manager",
    source: "website:aquaoasis",
    classification: "sales",
  });
  addPersonPhone(agencyId, ruth.id, "01204 123456", { label: "office" });
  updatePerson(agencyId, ruth.id, { isPrimaryContact: true });
  decidePersonOrganisation(agencyId, ruth.id, cedar.id, "confirmed", "dev-seed");

  // Pending company question — renders the "Is X part of Y?" flow.
  const { person: marcus } = upsertPerson(agencyId, {
    emails: ["marcus@cedardental.co.uk"],
    name: "Marcus Byrne",
    jobTitle: "Finance Director",
    source: "website:aquaoasis",
  });

  // ── An unclassified enquiry, the starting state ──
  const { person: walkin } = upsertPerson(agencyId, {
    emails: ["hello@meridiankitchens.co.uk"],
    name: "Dara Okafor",
    company: "Meridian Kitchens",
    source: "website:aquaoasis",
    facets: { enquiryIds: ["enq_dev_1"] },
  });

  // ── Someone reclassified away from sales, proving history survives ──
  const { person: supplier } = upsertPerson(agencyId, {
    emails: ["accounts@northpapersupplies.co.uk"],
    phones: ["0161 496 0000"],
    name: "Helen Twine",
    company: "North Paper Supplies",
    jobTitle: "Accounts",
    classification: "sales",
    facets: { leadId: "lead_dev_legacy" },
  });
  classifyPerson(agencyId, supplier.id, {
    classification: "supplier",
    by: "dev-seed",
    note: "Turned out to be a supplier, not a sales opportunity.",
  });

  // ── A private individual on a personal address (no company grouping) ──
  upsertPerson(agencyId, {
    emails: ["jo.brennan@gmail.com"],
    name: "Jo Brennan",
    classification: "other",
    source: "referral",
  });

  await flushPendingWrites();

  const { derivePersonState, listPersons } = await import("@/server/persons");
  console.log(`seeded ${agency.name} (${agencyId})\n`);
  for (const person of listPersons(agencyId)) {
    console.log(
      `  ${derivePersonState(person).padEnd(8)} ${(person.name ?? "?").padEnd(16)} `
      + `${person.classification.padEnd(16)} ${person.organisationId ? "company linked" : "no company"}`,
    );
  }
  console.log(`\nopen: http://localhost:3032/dev`);
  void marcus; void walkin;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
