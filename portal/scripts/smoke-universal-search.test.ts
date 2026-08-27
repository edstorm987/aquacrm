import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const searchApi = readFileSync("src/app/api/portal/search/route.ts", "utf8");
const searchUi = readFileSync("src/components/chrome/PortalSearch.tsx", "utf8");
const socialInbox = readFileSync("src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const commandCentre = readFileSync("src/app/portal/agency/_DashboardCommandCenter.tsx", "utf8");
const radarSources = readFileSync("src/engines/data/server/radar/radarSourceInspection.ts", "utf8");

test("universal search indexes complete website enquiries and social messages", () => {
  assert.match(searchApi, /listWebsiteEnquiries\(agencyId, 500\)/);
  assert.match(searchApi, /listInboxSnapshot\(agencyId\)/);
  assert.match(searchApi, /enquiry\.message/);
  assert.match(searchApi, /message\.text/);
  assert.match(searchApi, /category: "Enquiry"/);
  assert.match(searchApi, /view=\$\{view\}&form=/);
  assert.match(searchApi, /view=social&thread=/);
  assert.match(socialInbox, /searchParams\.get\("thread"\)/);
});

test("universal search routes executive strategy into Battle Table", () => {
  assert.match(searchApi, /category: "Executive"/);
  assert.match(searchApi, /title: "Battle Table"/);
  assert.match(searchApi, /href: "\/portal\/agency\?station=battle"/);
});

test("universal search ranks partial matches and returns useful context", () => {
  assert.match(searchApi, /title\.includes\(normalised\)/);
  assert.match(searchApi, /detail\.includes\(normalised\)/);
  assert.match(searchApi, /allTermsMatch/);
  assert.match(searchApi, /fuzzyTermMatch/);
  assert.match(searchApi, /contextualSnippet/);
  assert.match(searchApi, /matchedOn: matchLabel/);
  assert.match(searchApi, /SEARCH_INDEX_TTL_MS/);
  assert.doesNotMatch(searchUi, /\/api\/portal\/search\?warm=1/);
  assert.match(searchUi, /!recordsEnabled \|\| !open \|\| normalised\.length < 2/);
  assert.match(searchUi, /\/api\/portal\/search\?q=/);
  assert.match(searchUi, /Type to search live records/);
});

test("universal search indexes the complete Command Centre intelligence and Radar context", () => {
  assert.match(searchApi, /buildCommandIntelligenceSnapshot/);
  assert.match(searchApi, /for \(const kpi of snapshot\.kpis\)/);
  assert.match(searchApi, /for \(const check of radar\.checks\)/);
  assert.match(searchApi, /for \(const incident of radar\.incidents\)/);
  assert.match(searchApi, /for \(const series of evidence\.series\)/);
  assert.match(searchApi, /for \(const campaign of snapshot\.campaigns\)/);
  assert.match(searchApi, /for \(const profile of snapshot\.audienceProfiles\)/);
  for (const category of ["KPI", "Radar", "Check", "Evidence", "Source", "Campaign", "Audience", "Data"]) {
    assert.match(searchApi, new RegExp(`category: "${category}"`));
  }
  assert.match(searchApi, /listRadarSourceSearchDatasets/);
  assert.match(radarSources, /records: dataset\.records\.map/);
  assert.match(searchApi, /source-record:/);
  assert.match(searchApi, /view=checks/);
  assert.match(searchApi, /radarInspectorHref\("evidence"/);
  assert.match(searchApi, /station=intelligence&view=compare&kpi=/);
  assert.match(searchApi, /safeSerialise\(kpi\.plan\)/);
  assert.match(searchApi, /baseline target projection forecast pace variance gap/);
  assert.match(searchApi, /for \(const scope of snapshot\.scopes\)/);
  assert.match(searchApi, /for \(const reading of scope\.readings\)/);
  assert.match(searchApi, /scope=\$\{encodeURIComponent\(scope\.id\)\}/);
  assert.match(searchApi, /command-scope-kpi:/);
  assert.match(commandCentre, /requestedStationValue = searchParams\.get\("station"\)/);
  // The `?station=` a search result links to must still be resolved by
  // `commandStationMode`. It now takes a second argument (the founder-only
  // `devteam` station is admitted only when visible), so this pins the call
  // AND — the part that actually matters for search — that every station value
  // search emits is still accepted by the resolver.
  assert.match(commandCentre, /requestedStation = commandStationMode\(requestedStationValue\b/);
  for (const station of ["battle", "intelligence"]) {
    assert.match(searchApi, new RegExp(`station=${station}`));
    assert.match(commandCentre, new RegExp(`"${station}"`));
  }
  assert.match(commandCentre, /\["executive", "day", "battle", "intelligence", "radar"\]\.includes\(value\)/);
  assert.match(commandCentre, /if \(value === "calendar"\) return "day";/);
  assert.match(commandCentre, /searchParams\.get\("kpi"\)/);
  assert.match(commandCentre, /searchParams\.get\("scope"\)/);
  assert.match(searchApi, /snapshot\.commercialIntelligence\.formulas/);
  assert.match(searchApi, /snapshot\.commercialIntelligence\.people/);
  assert.match(searchApi, /snapshot\.commercialIntelligence\.sources/);
  assert.match(searchApi, /snapshot\.commercialIntelligence\.stages/);
  assert.match(commandCentre, /commercialFocus\(searchParams\)/);
});

test("search reports index scope and total matches instead of hiding capped results", () => {
  assert.match(searchApi, /indexed: candidates\.length/);
  assert.match(searchApi, /total: matches\.length/);
  assert.match(searchApi, /slice\(0, 60\)/);
  assert.match(searchUi, /Whole workspace/);
  assert.match(searchUi, /searchable records/);
  assert.match(searchUi, /Search all data, KPIs, checks, messages/);
  assert.match(searchUi, /totalMatches/);
});

test("search palette is accessible, keyboard navigable, and uses restrained focus styling", () => {
  assert.match(searchUi, /role="combobox"/);
  assert.match(searchUi, /role="listbox"/);
  assert.match(searchUi, /aria-activedescendant/);
  assert.match(searchUi, /event\.key === "ArrowDown"/);
  assert.match(searchUi, /event\.key === "ArrowUp"/);
  assert.match(searchUi, /event\.key === "Enter"/);
  assert.match(searchUi, /aria-live="polite"/);
  assert.match(globals, /\.mm-universal-search-input:focus-visible/);
  assert.match(globals, /outline: none !important/);
});
