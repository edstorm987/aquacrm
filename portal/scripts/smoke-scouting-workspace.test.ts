import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { NAV_ELEMENT_KEYS } from "../src/lib/access/navElementKeys";
import { buildSidebar } from "../src/lib/chrome/sidebarLayout";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("src/app/portal/agency/scouting/page.tsx");
const sharedPage = read("src/app/portal/agency/_SalesProspectWorkspacePage.tsx");
const workspace = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
const server = read("src/app/portal/agency/scouting/_ScoutingWorkspaceServer.tsx");
const discovery = read("src/app/portal/agency/pipelines/[slug]/_GoogleBusinessScout.tsx");
const importer = read("src/app/portal/agency/pipelines/[slug]/_ProspectImportDialog.tsx");
const command = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");

describe("standalone Scouting workspace", () => {
  it("uses one owner/manager and growth-outreach gate for all pre-Journey desks", () => {
    assert.match(sharedPage, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(sharedPage, /requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "use"\)/);
    assert.match(sharedPage, /workspaceElementLevel\(access, "growth\.outreach"\), "manage"/);
    assert.match(sharedPage, /workspaceElementLevel\(access, "growth\.leads"\), "use"/);
    assert.match(sharedPage, /resolvePersonalRadarAccess\(session\)/);
    assert.match(page, /workspaceMode="scouting"/);
    assert.match(server, /workspaceMode=\{workspaceMode\}/);
    assert.match(workspace, /canManage=\{scoutingCanManage\}/);
    assert.match(workspace, /canQualify=\{scoutingCanQualify\}/);
    assert.match(workspace, /quotaWritable=\{scoutingQuotaWritable\}/);
  });

  it("loads only prospect data on render and filters the requested desk on the server", () => {
    assert.match(server, /container\.prospects\.list\(\)/);
    assert.match(server, /prospectVisibleInWorkspace\(prospect\.qualificationState, workspaceMode\)/);
    assert.match(server, /leads=\{\[\]\}/);
    assert.doesNotMatch(server, /installPlugin|setPluginEnabled|agencyProductsForRead|listClients|listCards/);
    assert.match(server, /mayUseEnvironmentCredentials\(agencyId\)/);
    assert.match(server, /NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY/);
    assert.doesNotMatch(server, /GOOGLE_PLACES_API_KEY/,
      "map-first Scouting must not load or expose the server Places credential");
  });

  it("keeps focused Sales rows hidden for owner/manager until the Sales hat is active", () => {
    for (const role of ["agency-owner", "agency-manager"] as const) {
      const panels = buildSidebar({ role, scope: "agency", installedPlugins: [] });
      const sales = panels.find(panel => panel.id === "sales");
      assert.equal(sales?.hidden, true);
      assert.deepEqual(sales?.items.map(item => item.id), ["scouting", "researching", "prospecting", "meetings", "contacts"]);
      assert.equal(sales?.items.find(item => item.id === "scouting")?.href, "/portal/agency/scouting");
    }
    const staff = buildSidebar({ role: "agency-staff", scope: "agency", installedPlugins: [] });
    assert.ok(!staff.flatMap(panel => panel.items).some(item => item.id === "scouting"));
    assert.equal(NAV_ELEMENT_KEYS.scouting, "growth.outreach");
  });

  it("uses Google's supported live map as the canvas with an honest missing-key fallback", () => {
    assert.match(discovery, /www\.google\.com\/maps\/embed\/v1\/search/);
    assert.match(discovery, /<iframe/);
    assert.match(discovery, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.match(discovery, /Use Google&apos;s map, listings, and controls below/);
    assert.match(discovery, /Connect the restricted Google Maps Embed key/);
    assert.match(discovery, /Open Google Maps/);
    assert.match(discovery, /GoogleMapsAttribution/);
    assert.doesNotMatch(discovery, /google-places\/search|place\.attributions|setPlaces/);
  });

  it("captures map, networking, and referral prospects without copying iframe state", () => {
    assert.match(discovery, /onCapture\("google-maps"\)/);
    assert.match(discovery, /onCapture\("networking"\)/);
    assert.match(discovery, /copy its Maps share link and capture a private Aqua dossier/);
    assert.match(workspace, /Google Maps listing/);
    assert.match(workspace, /Networking or referral/);
    assert.match(workspace, /qualificationState: "unreviewed"/);
    assert.match(workspace, /Every scout is immediately available for research or outreach/);
  });

  it("opens the mapped prospect importer from Scouting and the Contacts deep link", () => {
    assert.match(workspace, /Import and map list/);
    assert.match(workspace, /<ProspectImportDialog/);
    assert.match(page, /initialImportOpen=\{rawImport === "1"\}/);
    assert.match(importer, /role="dialog" aria-modal="true"/);
    assert.match(importer, /useFocusTrap\(dialogRef, true/);
    assert.match(importer, /Approve mapping and import/);
    assert.match(importer, /Maximum 5 MB and 500 data rows/);
  });

  it("keeps modal errors visible and makes the mobile research dossier reachable", () => {
    assert.match(workspace, /id="scout-prospect-error" role="alert"/);
    assert.match(workspace, /<footer className="sticky bottom-0/);
    assert.match(command, /htmlFor="scouting-field-note"/);
    assert.match(command, /dossierRef\.current\?\.scrollIntoView/);
    assert.match(command, /prefers-reduced-motion: reduce/);
    assert.match(command, /aria-pressed=\{view === "power-dialler"\}/);
    assert.match(command, /aria-pressed=\{view === "email"\}/);
    assert.match(command, /aria-pressed=\{view === "pipeline"\}/);
    assert.match(command, /role=\{notice\.tone === "error" \? "alert" : "status"\}/);
    assert.match(command, /ScoutingQuotaStrip quota=\{quota\} writable=\{quotaWritable\}/);
  });

  it("converges legacy Journey Scouting links on the standalone intake route", () => {
    assert.match(workspace, /router\.replace\("\/portal\/agency\/scouting"\)/);
    assert.match(workspace, /href="\/portal\/agency\/scouting"/);
  });

  it("keeps focused Sales desks out of the generic Operations card wall", () => {
    const operations = read("src/app/portal/agency/operations/page.tsx");
    assert.doesNotMatch(operations, /href: "\/portal\/agency\/(?:scouting|researching|prospecting)"/);
    assert.match(read("src/lib/chrome/sidebarLayout.ts"), /const salesFocusIds = \["scouting", "researching", "prospecting", "meetings", "contacts"\]/);
  });

  it("documents the restricted Embed key and keeps Places configuration server-only", () => {
    const example = read(".env.example");
    const env = read("src/lib/server/env.ts");
    assert.match(example, /GOOGLE_PLACES_API_KEY/);
    assert.match(example, /GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY/);
    assert.match(example, /NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY/);
    assert.match(env, /"GOOGLE_PLACES_API_KEY"/);
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
