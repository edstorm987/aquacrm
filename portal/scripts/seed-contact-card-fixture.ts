// Seeds one company and two colleagues into the SHOWCASE agency so the
// contact card can be viewed and verified without touching real data.
//
// Showcase data is fictional and is wiped by resetAndSeedShowcaseWorkspace(),
// so this is a safe place for fixtures.
//
//   PORTAL_BACKEND=file npx tsx scripts/seed-contact-card-fixture.ts

import { createRequire } from "node:module";

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

async function main() {
  const { ensureHydrated, getState, flushPendingWrites } = await import("@/server/storage");
  const { upsertPerson, classifyPerson, decidePersonOrganisation, addPersonPhone, updatePerson } =
    await import("@/server/persons");
  const { upsertOrganisation } = await import("@/server/organisations");

  await ensureHydrated({ fresh: true });
  const agency = Object.values(getState().agencies).find(entry => entry.id.includes("showcase"));
  if (!agency) throw new Error("No showcase agency found.");
  const agencyId = agency.id;

  const { organisation } = upsertOrganisation(agencyId, {
    name: "Cedar Dental",
    domain: "cedardental.co.uk",
    website: "https://cedardental.co.uk",
    classification: "sales",
    source: "fixture",
  });

  // Primary contact: two emails and two numbers, confirmed at the company.
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
  decidePersonOrganisation(agencyId, ruth.id, organisation.id, "confirmed", "fixture");
  classifyPerson(agencyId, ruth.id, { classification: "sales", by: "fixture" });

  // Colleague with a PENDING company suggestion, so the question renders.
  const { person: marcus } = upsertPerson(agencyId, {
    emails: ["marcus@cedardental.co.uk"],
    name: "Marcus Byrne",
    jobTitle: "Finance Director",
    source: "website:aquaoasis",
  });

  await flushPendingWrites();

  console.log("seeded into", agency.name);
  console.log("  organisation :", organisation.id, organisation.name);
  console.log("  confirmed    :", ruth.id, "Ruth Adeyemi (2 emails, 2 phones)");
  console.log("  pending      :", marcus.id, "Marcus Byrne (company suggestion awaiting decision)");
  console.log("\nview:");
  console.log(`  /portal/agency/contacts/${ruth.id}`);
  console.log(`  /portal/agency/contacts/${marcus.id}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
