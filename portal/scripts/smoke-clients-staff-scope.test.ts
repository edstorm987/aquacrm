import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync("src/app/portal/clients/page.tsx", "utf8");
const hub = readFileSync("src/app/portal/clients/_PeopleHub.tsx", "utf8");
const matcher = readFileSync("src/built-ins/modules/leads-pipeline/src/lib/clientMatch.ts", "utf8");
const embeddedPipeline = readFileSync("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx", "utf8");
const directPipeline = readFileSync("src/app/portal/agency/pipelines/[slug]/page.tsx", "utf8");

describe("least-privilege clients hub", () => {
  it("rejects explicit staff requests for sensitive views before loading their records", () => {
    const rejection = page.indexOf("forbiddenStaffViews.has(requestedView)");
    assert.ok(rejection > 0);
    for (const load of [
      "leadsContainer.contacts.list()",
      "listWebsiteEnquiries(session.agencyId, 500)",
      "listIdentityResolutionReviews(session.agencyId",
      "listContractTemplates(agency.id)",
      'getInstall({ agencyId: agency.id }, "agency-finance")',
    ]) {
      assert.ok(page.indexOf(load) > rejection, `${load} must stay after the staff view rejection`);
    }
    assert.match(page, /new Set\(\["all", "contacts", "leads", "journey", "identity", "staff"\]\)/);
  });

  it("filters staff client rows by the canonical overview permission and makes the hub read-only", () => {
    assert.match(page, /resolveActorClientWorkspaceElementAccess\(actor, client\.id\)/);
    assert.match(page, /clientWorkspaceElementLevel\([^\n]+, "client\.overview"\)/);
    assert.match(page, /clientWorkspaceElementAtLeast\([\s\S]*?"view",\n\s*\)\)/);
    assert.match(page, /const canManage = canAccessAllHubViews && !session\.publicShowcase/);
    assert.match(page, /isStaff\s*\? \["clients"\]/);
    assert.match(hub, /allowedViews\.includes\("clients"\)/);
    assert.match(hub, /if \(!allowedViews\.includes\(nextView\)\) return/);
  });
});

describe("exact client association joins", () => {
  it("uses only typed client ids and canonical person ids", () => {
    assert.match(matcher, /lead\.clientId === client\.id/);
    assert.match(matcher, /lead\.convertedClientId === client\.id/);
    assert.match(matcher, /samePerson\(client\.personId, lead\.personId\)/);
    assert.match(matcher, /contact\.clientId === client\.id/);
    assert.match(matcher, /samePerson\(client\.personId, contact\.personId\)/);
    assert.doesNotMatch(matcher, /\.(?:ownerEmail|metadata)|sameEmail\(/);
  });

  it("does not recover card or client identity through email or metadata in either pipeline projection", () => {
    for (const source of [embeddedPipeline, directPipeline]) {
      assert.match(source, /clientMatchesLead\(candidate, lead\)/);
      assert.doesNotMatch(source, /candidate\.metadata\?\.leadId|candidate\.ownerEmail|snapshot\.email|lead\.email ===/);
    }
    assert.match(page, /clientMatchesLead\(client, contact\)/);
    assert.match(page, /clientMatchesContact\(client, contact\)/);
    assert.doesNotMatch(page, /metadata\?\.linkedContacts|metadata\?\.contactId|ownerEmail\?\.trim\(\)\.toLowerCase\(\) ===/);
  });
});
