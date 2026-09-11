import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import { NAV_ELEMENT_KEYS } from "../src/lib/access/navElementKeys";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("src/app/portal/agency/scouting/page.tsx");
const workspace = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
const server = read("src/app/portal/agency/scouting/_ScoutingWorkspaceServer.tsx");
const discovery = read("src/app/portal/agency/pipelines/[slug]/_GoogleBusinessScout.tsx");

describe("standalone Scouting workspace", () => {
  it("has a role and growth-outreach gate before rendering the shared prospect engine", () => {
    assert.match(page, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(page, /requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "use"\)/);
    assert.match(server, /workspaceMode="scouting"/);
    assert.match(page, /workspaceElementLevel\(access, "growth\.outreach"\), "manage"/);
    assert.match(page, /workspaceElementLevel\(access, "growth\.leads"\), "use"/);
    assert.match(page, /resolvePersonalRadarAccess\(session\)/);
    assert.match(server, /calendarAvailable \? scoutingQuotaProgress\(agencyId, userId\) : undefined/);
    assert.match(workspace, /canManage=\{scoutingCanManage\}/);
    assert.match(workspace, /canQualify=\{scoutingCanQualify\}/);
    assert.match(workspace, /quotaWritable=\{scoutingQuotaWritable\}/);
  });

  it("loads a prospect-only, read-only-on-render server path", () => {
    assert.match(page, /ScoutingWorkspaceServer/);
    assert.match(server, /container\.prospects\.list\(\)/);
    assert.match(server, /leads=\{\[\]\}/);
    assert.match(server, /getInstall\(\{ agencyId \}, "leads-pipeline"\)/);
    assert.doesNotMatch(server, /installPlugin|setPluginEnabled|agencyProductsForRead|listClients|listCards/);
    assert.match(server, /googleMapsEmbedApiKey === googlePlacesApiKey/);
    assert.match(server, /mayUseEnvironmentCredentials\(agencyId\)/);
    assert.match(server, /googleMapsEmbedApiKey=\{googleKeysCollide \? "" : googleMapsEmbedApiKey\}/);
    assert.match(server, /googlePlacesConfigured=\{Boolean\(googlePlacesApiKey\) && !googleKeysCollide\}/);
  });

  it("is a visible owner/manager sidebar row and stays out of staff navigation", () => {
    for (const role of ["agency-owner", "agency-manager"] as const) {
      const rows = buildSidebar({ role, scope: "agency", installedPlugins: [] })
        .flatMap(panel => panel.hidden ? [] : panel.items);
      const scouting = rows.filter(item => item.id === "scouting");
      assert.equal(scouting.length, 1);
      assert.equal(scouting[0]!.href, "/portal/agency/scouting");
    }
    const staffRows = buildSidebar({ role: "agency-staff", scope: "agency", installedPlugins: [] })
      .flatMap(panel => panel.items);
    assert.ok(!staffRows.some(item => item.id === "scouting"));
    assert.equal(NAV_ELEMENT_KEYS.scouting, "growth.outreach");
  });

  it("uses the map as a preview and Places as the selected-business channel", () => {
    assert.match(discovery, /\/api\/portal\/leads-pipeline\/google-places\/search/);
    assert.match(discovery, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.match(discovery, /title=\{selected \?/);
    assert.match(discovery, /GoogleMapsAttribution/);
    assert.match(discovery, /place\.attributions/);
    assert.match(workspace, /GoogleMapsAttribution/);
    const attribution = read("src/components/attribution/GoogleMapsAttribution.tsx");
    assert.match(attribution, /google-maps-dark-gray\.png/);
    assert.match(attribution, /width=\{98\}/);
    assert.match(attribution, /height=\{18\}/);
    assert.match(attribution, /alt="Google Maps"/);
    assert.match(discovery, /placesConfigured/);
  });

  it("clears stale results, serialises searches, and keeps errors distinct from empty results", () => {
    assert.match(discovery, /if \(busy\) return/);
    const clearResults = discovery.indexOf("setPlaces([])");
    const providerFetch = discovery.indexOf('fetch("/api/portal/leads-pipeline/google-places/search"');
    assert.ok(clearResults >= 0 && providerFetch > clearResults, "old candidates must be removed before the next provider request");
    assert.match(discovery, /searchSequence\.current === sequence/);
    assert.match(discovery, /!busy && !error/);
    assert.match(discovery, /businessTypeLabel\(place\.primaryType\)/);
  });

  it("persists the durable Place ID without silently copying Google profile content", () => {
    const start = workspace.indexOf("function openGoogleProspect");
    const end = workspace.indexOf("async function saveProspect", start);
    const seed = workspace.slice(start, end);
    assert.match(seed, /googlePlaceId: place\.placeId/);
    assert.doesNotMatch(seed, /query_place_id/,
      "a Maps URL needs an operator-entered query as well as the Place ID, so it cannot be seeded from transient provider copy");
    assert.match(seed, /source: "google-maps"/);
    assert.doesNotMatch(seed, /company:\s*place\.displayName/);
    assert.doesNotMatch(seed, /address:\s*place\.formattedAddress/);
    assert.doesNotMatch(seed, /phone:\s*place\.phone/);
    assert.doesNotMatch(seed, /website:\s*place\.website/);
    assert.match(workspace, /has not copied Google profile fields into your CRM/);
    assert.match(workspace, /new URLSearchParams\(\{ api: "1", query, query_place_id: id \}\)/);
    assert.match(workspace, /focusedProspectId=\{focusedProspectId\}/);
    assert.match(workspace, /Add a business name, person, or website before saving this prospect/);
    const command = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");
    assert.match(command, /useState<Queue>\("research"\)/);
    assert.match(command, /prospects\.find\(item => item\.id === focusedProspectId\)/);
  });

  it("converges the old Journey Scouting entry on the standalone route", () => {
    assert.match(workspace, /router\.replace\("\/portal\/agency\/scouting"\)/);
    assert.match(workspace, /href="\/portal\/agency\/scouting"/);
  });

  it("keeps prospect errors in the focus-trapped modal and makes the mobile dossier reachable", () => {
    assert.match(workspace, /id="scout-prospect-error" role="alert"/);
    assert.match(workspace, /\(error \|\| success\) && !showProspectForm/);
    assert.match(workspace, /<footer className="sticky bottom-0/);
    const command = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");
    assert.match(command, /htmlFor="scouting-field-note"/);
    assert.match(command, /id="scouting-field-note"/);
    assert.match(command, /dossierRef\.current\?\.scrollIntoView/);
    assert.match(command, /prefers-reduced-motion: reduce/);
    assert.match(command, /aria-pressed=\{active\}/);
    assert.match(command, /aria-pressed=\{queue === item\.id && view === "command"\}/);
    assert.match(command, /aria-pressed=\{view === "pipeline"\}/);
    assert.match(command, /aria-disabled=\{Boolean\(qualificationBlockReason\)\}/);
    assert.match(command, /You need Leads use access to qualify this prospect into Journey/);
    assert.match(command, /\{canManage \? <label[\s\S]*Import scouting list/);
    assert.match(command, /\{canManage \? <button[^>]*onClick=\{\(\) => onDismiss\(selected\)\}/);
    assert.match(command, /ScoutingQuotaStrip quota=\{quota\} writable=\{quotaWritable\}/);
    assert.match(command, /role=\{notice\.tone === "error" \? "alert" : "status"\}/);
    assert.match(command, /setAttemptNote\(""\)/);
    assert.match(command, /setFollowUpAt\(""\)/);
    assert.match(command, /setFieldNote\(""\)/);
    assert.match(command, /!visibleProspects\.some\(item => item\.id === selectedId\)/);
    assert.match(command, /focus-within:ring-2/);
  });

  it("filters the Operations shortcut through the same authorised Scouting navigation", () => {
    const operations = read("src/app/portal/agency/operations/page.tsx");
    assert.match(operations, /assembleAgencyBasePanels\(session\)/);
    assert.match(operations, /item\.id === "scouting"/);
    assert.match(operations, /item\.href !== "\/portal\/agency\/scouting" \|\| canOpenScouting/);
  });

  it("documents separate restricted browser and server keys", () => {
    const example = read(".env.example");
    const env = read("src/lib/server/env.ts");
    assert.match(example, /GOOGLE_PLACES_API_KEY/);
    assert.match(example, /GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY/);
    assert.match(example, /NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY/);
    assert.match(env, /"GOOGLE_PLACES_API_KEY"/);
    assert.match(env, /"GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY"/);
    assert.match(env, /"NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY"/);
  });
});

describe("Security navigation has one authorised home", () => {
  it("puts founder Security in App Dev Mode and retains ordinary tenant-owner Security", () => {
    const founder = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [], isFounder: true, devTeamAvailable: true });
    const tenantOwner = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [], isFounder: false, devTeamAvailable: false });
    const manager = buildSidebar({ role: "agency-manager", scope: "agency", installedPlugins: [], isFounder: false, devTeamAvailable: false });
    assert.ok(!founder.flatMap(panel => panel.items).some(item => item.id === "agency-security"));
    assert.ok(tenantOwner.flatMap(panel => panel.items).some(item => item.id === "agency-security"));
    assert.ok(!manager.flatMap(panel => panel.items).some(item => item.id === "agency-security"));
  });
});
