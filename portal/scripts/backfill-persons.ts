// Backfill canonical `Person` and `Organisation` records from existing
// clients, leads and contacts, and link each facet back with `personId`.
//
// The script GUESSES whether each record describes a human or a company and
// prints its reasoning. It does not act on a guess it is unsure about —
// ambiguous records are listed for a human decision instead. Read the dry-run
// output before applying.
//
// Idempotent: matches existing records by facet first, then by normalised
// identity, so re-running never duplicates.
//
//   Dry run (default):  npx tsx scripts/backfill-persons.ts
//   Apply:              npx tsx scripts/backfill-persons.ts --apply
//   Include showcase:   npx tsx scripts/backfill-persons.ts --include-showcase
//
// Showcase agencies are skipped by default: that data is fictional and gets
// wiped by resetAndSeedShowcaseWorkspace() anyway.
//
// Respects whichever backend PORTAL_BACKEND selects. Run against the file
// sandbox first — a plain run with Supabase env present writes to the LIVE
// database. See docs/DEVELOPMENT-HANDOFF.md.

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

const APPLY = process.argv.includes("--apply");
const INCLUDE_SHOWCASE = process.argv.includes("--include-showcase");

// ─── Shape detection ──────────────────────────────────────────────────────
//
// "Cedar Dental" is obviously a company and "Edward Miles Hallam" obviously
// is not, but the middle ground is wide enough that guessing wrong would
// permanently poison the data. Anything unclear is reported, not acted on.

const COMPANY_MARKERS = [
  "ltd", "limited", "llc", "llp", "plc", "inc", "incorporated", "corp",
  "co", "company", "group", "holdings", "partners", "associates", "services",
  "solutions", "consulting", "consultancy", "agency", "studio", "studios",
  "media", "digital", "design", "build", "builders", "construction",
  "dental", "dentist", "clinic", "medical", "physio", "physiotherapy",
  "therapy", "fitness", "gym", "salon", "spa", "kitchens", "bathrooms",
  "interiors", "motors", "autos", "garage", "plumbing", "electrical",
  "roofing", "landscaping", "cleaning", "catering", "bakery", "cafe",
  "restaurant", "bar", "hotel", "lettings", "estates", "properties",
  "legal", "solicitors", "accountants", "insurance", "finance", "capital",
  "ventures", "labs", "technologies", "systems", "software", "works",
];

type Shape = "person" | "company" | "ambiguous";

interface ShapeGuess {
  shape: Shape;
  reason: string;
}

function guessShape(name: string | undefined, email: string | undefined): ShapeGuess {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { shape: "ambiguous", reason: "no name recorded" };

  const words = trimmed.split(/\s+/);
  const lowered = words.map(word => word.toLowerCase().replace(/[^a-z]/g, ""));

  const marker = lowered.find(word => COMPANY_MARKERS.includes(word));
  if (marker) return { shape: "company", reason: `contains the company word "${marker}"` };
  if (/[&]|\band\b/i.test(trimmed) && words.length > 2) {
    return { shape: "company", reason: "reads as a trading name (contains \"&\"/\"and\")" };
  }

  // A local part matching the name is a strong human signal:
  // ruth@… for "Ruth Adeyemi".
  const localPart = email?.split("@")[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (localPart && words.length >= 2) {
    const first = lowered[0];
    const last = lowered[lowered.length - 1];
    if (first && localPart.startsWith(first)) {
      return { shape: "person", reason: `email starts with the first name "${first}"` };
    }
    if (last && localPart.startsWith(last)) {
      return { shape: "person", reason: `email starts with the surname "${last}"` };
    }
  }

  if (words.length >= 2 && words.length <= 4 && words.every(word => /^[A-Z][a-z'’-]*\.?$/.test(word))) {
    return { shape: "person", reason: "reads as a personal name" };
  }
  if (words.length === 1) {
    return { shape: "ambiguous", reason: "single word — could be a first name or a brand" };
  }
  return { shape: "ambiguous", reason: "no clear person or company signal" };
}

interface Summary {
  personsCreated: number;
  organisationsCreated: number;
  matched: number;
  clientsLinked: number;
  leadsLinked: number;
  contactsLinked: number;
  needsReview: string[];
  skipped: string[];
}

async function main() {
  const { ensureHydrated, getState, mutate, flushPendingWrites } = await import("@/server/storage");
  const { attachPersonFacet, findPersonByFacet, upsertPerson, derivePersonState } = await import("@/server/persons");
  const { upsertOrganisation, normaliseDomain, isGenericEmailDomain } = await import("@/server/organisations");
  const { clientRelationshipId } = await import("@/server/clientRelationships");
  const { updateClient } = await import("@/server/tenants");
  const { getInstall } = await import("@/server/pluginInstalls");

  await ensureHydrated({ fresh: true });

  // Leads and contacts are read straight out of `pluginData` rather than
  // through the plugin container. A migration should not emit domain events
  // or write activity entries, and this sidesteps the foundation bootstrap
  // entirely. We only add `personId` to existing records, so the plugin's
  // own email/phone/index keys are untouched.
  interface StoredRecord {
    id: string;
    personId?: string;
    email?: string;
    phone?: string;
    name?: string;
    company?: string;
    source?: string;
    enquiryIds?: string[];
    customFields?: Record<string, unknown>;
  }

  function readRecords(installId: string, prefix: string): StoredRecord[] {
    const slice = (getState().pluginData[installId] ?? {}) as Record<string, unknown>;
    return Object.entries(slice)
      .filter(([key]) => key.startsWith(`${prefix}:`))
      .map(([, value]) => value as StoredRecord)
      .filter(record => record && typeof record.id === "string");
  }

  function writePersonId(installId: string, prefix: string, recordId: string, personId: string) {
    mutate(state => {
      const slice = state.pluginData[installId] as Record<string, unknown> | undefined;
      const record = slice?.[`${prefix}:${recordId}`] as StoredRecord | undefined;
      if (record) record.personId = personId;
    });
  }

  const state = getState();
  const summary: Summary = {
    personsCreated: 0,
    organisationsCreated: 0,
    matched: 0,
    clientsLinked: 0,
    leadsLinked: 0,
    contactsLinked: 0,
    needsReview: [],
    skipped: [],
  };

  console.log(APPLY ? "APPLYING backfill\n" : "DRY RUN — pass --apply to write\n");

  for (const agency of Object.values(state.agencies)) {
    const agencyId = agency.id;
    const isShowcase = agencyId.includes("showcase") || agency.slug?.includes("showcase");
    if (isShowcase && !INCLUDE_SHOWCASE) {
      console.log(`─── skipping ${agency.name} (showcase data — pass --include-showcase to migrate) ───\n`);
      continue;
    }
    console.log(`─── agency ${agency.name} (${agencyId}) ───`);

    // ── Clients ──────────────────────────────────────────────────────────
    // Grouped by relationshipId first so a buyer holding several workspaces
    // resolves to ONE record, matching Client.relationshipId semantics.
    const clients = Object.values(state.clients).filter(client => client.agencyId === agencyId);
    const byRelationship = new Map<string, typeof clients>();
    for (const client of clients) {
      const key = clientRelationshipId(client);
      byRelationship.set(key, [...(byRelationship.get(key) ?? []), client]);
    }

    for (const [relationshipId, group] of byRelationship) {
      const primary = group[0];
      const metadata = primary.metadata ?? {};
      const email = [metadata.portalLoginEmail, metadata.clientEmail, primary.ownerEmail]
        .find(value => typeof value === "string" && value.trim()) as string | undefined;
      const phone = [metadata.phone, metadata.contactPhone]
        .find(value => typeof value === "string" && value.trim()) as string | undefined;
      const contactName = typeof metadata.portalContactName === "string" ? metadata.portalContactName : undefined;

      if (!email && !phone) {
        summary.skipped.push(`client "${primary.name}" (${primary.id}) — no email or phone to identify by`);
        continue;
      }

      // A client workspace is almost always a company engagement, so the
      // organisation is created from the workspace name and the person, when
      // there is a named contact, is attached to it.
      const domain = email && !isGenericEmailDomain(normaliseDomain(email)) ? normaliseDomain(email) : undefined;
      const guess = guessShape(contactName ?? primary.name, email);

      if (!APPLY) {
        console.log(`  client "${primary.name}" · ${group.length} workspace(s) · ${email ?? phone}`);
        console.log(`    → company "${primary.name}"${domain ? ` (domain ${domain})` : " (no usable domain)"}`);
        if (contactName) console.log(`    → contact "${contactName}" — ${guess.shape}: ${guess.reason}`);
        summary.clientsLinked += group.length;
        continue;
      }

      const { organisation, created: orgCreated } = upsertOrganisation(agencyId, {
        name: primary.name,
        domain,
        website: primary.websiteUrl,
        phone,
        classification: "existing-client",
        relationshipId,
        source: "client",
        clientIds: group.map(client => client.id),
      });
      if (orgCreated) summary.organisationsCreated += 1;

      const { person, created } = upsertPerson(agencyId, {
        emails: [email],
        phones: [phone],
        name: contactName,
        company: primary.name,
        source: typeof metadata.leadSource === "string" ? metadata.leadSource : "client",
        relationshipId,
        classification: "existing-client",
        facets: { clientIds: group.map(client => client.id) },
      });
      if (created) summary.personsCreated += 1;
      else summary.matched += 1;

      for (const client of group) {
        if (client.personId === person.id) continue;
        updateClient(agencyId, client.id, { personId: person.id } as never);
        summary.clientsLinked += 1;
      }
      console.log(`  client "${primary.name}" → org ${organisation.id} + person ${person.id} (${derivePersonState(person)})`);
    }

    // ── Leads and contacts ───────────────────────────────────────────────
    const install = getInstall({ agencyId }, "leads-pipeline");
    if (!install?.enabled) {
      console.log("  (leads-pipeline not installed — skipping leads/contacts)");
      continue;
    }

    for (const prefix of ["lead", "contact"] as const) {
      for (const record of readRecords(install.id, prefix)) {
        if (!record.email && !record.phone) {
          summary.skipped.push(`${prefix} "${record.name ?? record.id}" — no email or phone to identify by`);
          continue;
        }
        const guess = guessShape(record.name, record.email);
        const classification = typeof record.customFields?.enquiryClassification === "string"
          ? record.customFields.enquiryClassification
          : prefix === "lead" ? "sales" : "other";

        if (guess.shape === "ambiguous") {
          summary.needsReview.push(`${prefix} "${record.name ?? record.email}" — ${guess.reason}`);
          if (!APPLY) console.log(`  ${prefix} "${record.name ?? record.email}" · NEEDS REVIEW — ${guess.reason}`);
          continue;
        }

        if (!APPLY) {
          console.log(`  ${prefix} "${record.name ?? record.email}" · ${guess.shape} — ${guess.reason}`);
          if (prefix === "lead") summary.leadsLinked += 1; else summary.contactsLinked += 1;
          continue;
        }

        if (guess.shape === "company") {
          const domain = record.email && !isGenericEmailDomain(normaliseDomain(record.email))
            ? normaliseDomain(record.email)
            : undefined;
          const { organisation, created } = upsertOrganisation(agencyId, {
            name: record.name!,
            domain,
            phone: record.phone,
            classification: classification as never,
            source: record.source,
          });
          if (created) summary.organisationsCreated += 1;
          console.log(`  ${prefix} "${record.name}" → org ${organisation.id} (company)`);
          continue;
        }

        const { person, created } = upsertPerson(agencyId, {
          emails: [record.email],
          phones: [record.phone],
          name: record.name,
          company: record.company,
          source: record.source,
          classification: classification as never,
          facets: prefix === "lead"
            ? { leadId: record.id, enquiryIds: record.enquiryIds }
            : { contactId: record.id },
        });
        if (created) summary.personsCreated += 1;
        else summary.matched += 1;
        attachPersonFacet(agencyId, person.id, prefix === "lead"
          ? { leadId: record.id }
          : { contactId: record.id });

        if (record.personId !== person.id) {
          writePersonId(install.id, prefix, record.id, person.id);
          if (prefix === "lead") summary.leadsLinked += 1; else summary.contactsLinked += 1;
        }
        console.log(`  ${prefix} "${record.name ?? record.email}" → person ${person.id} (${derivePersonState(person)})`);
      }
    }
  }

  if (APPLY) await flushPendingWrites();

  console.log("\n─── summary ───");
  console.log(`persons created       : ${summary.personsCreated}`);
  console.log(`organisations created : ${summary.organisationsCreated}`);
  console.log(`matched existing      : ${summary.matched}`);
  console.log(`clients linked        : ${summary.clientsLinked}`);
  console.log(`leads linked          : ${summary.leadsLinked}`);
  console.log(`contacts linked       : ${summary.contactsLinked}`);

  if (summary.needsReview.length) {
    console.log(`\nNEEDS REVIEW (${summary.needsReview.length}) — not migrated, decide person or company:`);
    for (const line of summary.needsReview) console.log(`  · ${line}`);
  }
  if (summary.skipped.length) {
    console.log(`\nskipped (${summary.skipped.length}) — no identity key:`);
    for (const line of summary.skipped) console.log(`  · ${line}`);
  }
  if (!APPLY) console.log("\nDRY RUN — nothing was written. Re-run with --apply.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
