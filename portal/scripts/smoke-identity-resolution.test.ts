import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

test("identity normalisation treats UK local and international phone formats as the same number", async () => {
  const { normaliseIdentityEmail, normaliseIdentityPhone } = await import("../src/lib/server/identityResolution");
  assert.equal(normaliseIdentityEmail("  ED@Example.COM "), "ed@example.com");
  assert.equal(normaliseIdentityPhone("07700 900 123"), "+447700900123");
  assert.equal(normaliseIdentityPhone("+44 (0) 7700 900 123"), "+447700900123");
  assert.equal(normaliseIdentityPhone("0044 7700 900 123"), "+447700900123");
});

test("exact client contact evidence resolves automatically and explains why", async () => {
  const { ensureHydrated } = await import("../src/server/storage");
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { resolveContactIdentity } = await import("../src/lib/server/identityResolution");
  await ensureHydrated();
  const agency = createAgency({ name: "Identity exact agency" });
  const client = createClient(agency.id, {
    name: "Northstar Studio",
    ownerEmail: "owner@northstar.example",
    metadata: {
      linkedContacts: [{
        id: "person-northstar",
        name: "Morgan North",
        email: "morgan@northstar.example",
        phone: "07700 900 321",
        primary: true,
        createdAt: 1,
        updatedAt: 1,
      }],
    },
  });

  const result = resolveContactIdentity({
    agencyId: agency.id,
    sourceType: "website-enquiry",
    sourceId: "enquiry-exact",
    sourceLabel: "Northstar website enquiry",
    name: "Morgan North",
    email: "MORGAN@northstar.example",
    phone: "+44 7700 900321",
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.clientId, client.id);
  assert.equal(result.clientContactId, "person-northstar");
  assert.ok(result.candidates[0]?.reasons.some(reason => reason.kind === "email"));
  assert.ok(result.candidates[0]?.reasons.some(reason => reason.kind === "phone"));
  assert.match(result.explanation, /linked to northstar studio/i);
});

test("duplicate authoritative evidence is held for review instead of choosing a client", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { resolveContactIdentity } = await import("../src/lib/server/identityResolution");
  const agency = createAgency({ name: "Identity duplicate agency" });
  createClient(agency.id, { name: "Duplicate One", ownerEmail: "shared@example.test" });
  createClient(agency.id, { name: "Duplicate Two", ownerEmail: "shared@example.test" });

  const result = resolveContactIdentity({
    agencyId: agency.id,
    sourceType: "website-enquiry",
    sourceId: "enquiry-duplicate",
    sourceLabel: "Shared inbox",
    email: "shared@example.test",
  });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.clientId, undefined);
  assert.equal(result.candidates.length, 2);
  assert.match(result.explanation, /too close/i);
});

test("an exact company name safely routes a shared buyer email to the right workspace", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { linkClientWorkspaces } = await import("../src/server/clientRelationships");
  const { resolveContactIdentity } = await import("../src/lib/server/identityResolution");
  const agency = createAgency({ name: "Identity multi-workspace agency" });
  const first = createClient(agency.id, { name: "North Shore Dental", ownerEmail: "owner@shared.example" });
  const second = createClient(agency.id, { name: "Harbour Wellness", ownerEmail: "owner@shared.example" });
  linkClientWorkspaces(agency.id, first.id, second.id);

  const result = resolveContactIdentity({
    agencyId: agency.id,
    sourceType: "website-enquiry",
    sourceId: "enquiry-workspace-company",
    sourceLabel: "Harbour Wellness form",
    email: "owner@shared.example",
    company: "Harbour Wellness",
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.clientId, second.id);
  assert.ok(result.candidates[0]?.reasons.some(reason => reason.kind === "company"));
});

test("name and company similarity can suggest but cannot silently link", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { resolveContactIdentity } = await import("../src/lib/server/identityResolution");
  const agency = createAgency({ name: "Identity weak evidence agency" });
  createClient(agency.id, { name: "Harbour Systems" });
  const result = resolveContactIdentity({
    agencyId: agency.id,
    sourceType: "social-inbox",
    sourceId: "social-weak",
    sourceLabel: "Harbour Systems",
    name: "Harbour Systems",
    company: "Harbour Systems",
  });
  assert.equal(result.status, "ambiguous");
  assert.equal(result.clientId, undefined);
  assert.match(result.explanation, /not authoritative/i);
});

test("review records deduplicate repeat scans and manual decisions stay tenant scoped", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const {
    decideIdentityResolutionReview,
    listIdentityResolutionReviews,
    resolveContactIdentity,
    upsertIdentityResolutionReview,
  } = await import("../src/lib/server/identityResolution");
  const agency = createAgency({ name: "Identity review agency" });
  const otherAgency = createAgency({ name: "Identity other agency" });
  const client = createClient(agency.id, { name: "Review Target" });
  const input = {
    agencyId: agency.id,
    sourceType: "social-inbox" as const,
    sourceId: "social-review-one",
    sourceLabel: "Unknown social contact",
    name: "Unknown contact",
  };
  const first = upsertIdentityResolutionReview(input, resolveContactIdentity(input));
  const second = upsertIdentityResolutionReview(input, resolveContactIdentity(input));
  assert.equal(first.id, second.id);
  assert.equal(listIdentityResolutionReviews(agency.id).length, 1);
  assert.equal(listIdentityResolutionReviews(otherAgency.id).length, 0);

  const linked = decideIdentityResolutionReview({
    agencyId: agency.id,
    reviewId: first.id,
    action: "link",
    clientId: client.id,
    actorUserId: "owner-review",
  });
  assert.equal(linked?.status, "linked");
  assert.equal(linked?.selectedClientId, client.id);
  assert.equal(decideIdentityResolutionReview({ agencyId: otherAgency.id, reviewId: first.id, action: "dismiss", actorUserId: "other-owner" }), null);
});

test("known lead lineage resolves even when the source has no email", async () => {
  const { createAgency, createClient } = await import("../src/server/tenants");
  const { resolveContactIdentity } = await import("../src/lib/server/identityResolution");
  const agency = createAgency({ name: "Identity lineage agency" });
  const client = createClient(agency.id, { name: "Converted Client", metadata: { leadId: "lead-lineage-1" } });
  const result = resolveContactIdentity({
    agencyId: agency.id,
    sourceType: "website-enquiry",
    sourceId: "lineage-source",
    sourceLabel: "Known lead",
    leadId: "lead-lineage-1",
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.clientId, client.id);
  assert.equal(result.candidates[0]?.reasons[0]?.kind, "crm-id");
});

test("Showcase Mode cannot import or rescan live external identities", () => {
  const clientsPage = readFileSync("src/app/portal/clients/page.tsx", "utf8");
  const inboxPage = readFileSync("src/app/portal/agency/inbox/page.tsx", "utf8");
  const apiRoute = readFileSync("src/app/api/portal/identity-resolution/route.ts", "utf8");
  assert.match(clientsPage, /if \(session\.isDemo && !session\.publicShowcase\) \{\s*clearIdentityResolutionReviews/);
  assert.match(inboxPage, /session\.isDemo \|\| session\.publicShowcase \? Promise\.resolve\(\[\]\) : listWebsiteEnquiries/);
  assert.match(apiRoute, /session\.isDemo.*Showcase Mode is read-only/);
});

test("identity review exposes the exact linked workspace instead of merging a buyer's portals", () => {
  const workspace = readFileSync("src/app/portal/clients/_IdentityReviewWorkspace.tsx", "utf8");
  assert.match(workspace, /Known buyer, multiple workspaces/);
  assert.match(workspace, /workspaceLabel/);
  assert.match(workspace, /will not copy it into every portal/);
});
