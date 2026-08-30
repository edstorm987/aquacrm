// The 2026-08-30 settings restructure — the contract.
//
// Ed's asks, all landed in one serial run because they share one file:
// trading companies INSIDE business details; team MERGED with roles & access;
// modules JOINED with workspaces (as a cog-per-workspace list); My account as a
// tab; brand colour in Appearance; the workspace name and brand colour EDITABLE
// (the slug deliberately not); a searchable timezone picker; and settings
// search over a hand-authored keyword registry.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const TABS = read("src/app/portal/agency/settings/SettingsTabs.tsx");

describe("the settings restructure holds", () => {
  it("every retired tab id still resolves, and none quietly returns", () => {
    // The alias and the absence are asserted as a PAIR so they cannot drift:
    // an alias for a tab that still exists would shadow it, and a removed
    // alias would strand every old deep link.
    for (const [retired, home] of [["companies", "account"], ["team", "access"], ["modules", "workspace"]] as const) {
      assert.match(TABS, new RegExp(`${retired}: "${home}"`),
        `the ${retired} → ${home} alias is gone — old #${retired} links land on the first tab with no explanation`);
      assert.doesNotMatch(TABS, new RegExp(`\\{ id: "${retired}", label:`),
        `the ${retired} tab is back — it was merged on 2026-08-30`);
    }
  });

  it("every tab id is one lowercase word", () => {
    // smoke-settings-hub extracts ids with /\{ id: "([a-z]+)", label:/ — a
    // hyphen or digit ESCAPES its structural checks rather than failing them.
    // This uses the permissive regex precisely so it can catch what the strict
    // one cannot see.
    const ids = [...TABS.matchAll(/\{ id: "([a-z0-9-]+)", label:/g)].map(m => m[1]!);
    assert.ok(ids.length >= 16, `expected the tab list, found ${ids.length} ids`);
    for (const id of ids) {
      assert.match(id, /^[a-z]+$/,
        `tab id "${id}" would silently escape smoke-settings-hub's id extraction`);
    }
  });

  it("trading companies are edited inside Business details", () => {
    const pane = TABS.slice(TABS.indexOf("function GeneralPane"));
    assert.match(pane.slice(0, 3000), /<TradingCompaniesPanel/,
      "trading companies left Business details");
  });

  it("the access tab leads with the team", () => {
    const pane = TABS.slice(TABS.indexOf("function AccessPane"));
    const team = pane.indexOf("<TeamUsersPanel");
    const grid = pane.indexOf("<AccessControlPanel");
    assert.ok(team > 0, "the people list is gone from the merged tab");
    assert.ok(grid > 0, "the access grid is gone from the merged tab");
    assert.ok(team < grid, "people should come before powers — who, then what");
  });

  it("workspaces carry a cog each instead of a wall of panels", () => {
    const pane = TABS.slice(TABS.indexOf("function ModulesPane"));
    assert.match(pane.slice(0, 3000), /aria-expanded=\{open\}/);
    assert.match(pane.slice(0, 3000), /settings for \$\{settings\.pluginName\}/,
      "the cog lost its accessible name");
  });

  it("the identity fields are editable — and the slug is not", () => {
    assert.match(TABS, /<WorkspaceNamePanel/, "the workspace name is read-only again");
    assert.match(TABS, /<BrandColourPanel/, "the brand colour is read-only again");
    const panel = read("src/app/portal/agency/settings/AgencyIdentityPanel.tsx");
    assert.match(panel, /readOnly aria-readonly/, "the slug field became editable");
    assert.match(panel, /Changing it would move where public enquiry forms deliver/,
      "the slug lost the reason it is fixed — it reads as a bug again");
    const route = read("src/app/api/portal/agency/identity/route.ts");
    assert.doesNotMatch(route, /agency\.slug\s*=/, "the identity route writes the slug");
  });

  it("the brand write path validates with the shared rules", () => {
    const route = read("src/app/api/portal/agency/identity/route.ts");
    assert.match(route, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(route, /validateBrandPatch/);
    const shared = read("src/lib/brands/brandFieldValidation.ts");
    assert.match(shared, /EDITABLE_BRAND_KEYS = \["primaryColor", "secondaryColor", "accentColor", "logoUrl"\]/,
      "the brand allow-list widened — customCSS through here reaches a <style> tag verbatim");
    assert.doesNotMatch(shared, /customCSS/i.source ? /"customCSS"/ : /$^/,
      "customCSS joined the editable keys");
  });

  it("the timezone picker searches every known zone and keeps custom ones", () => {
    assert.match(TABS, /list="workspace-timezones"/, "the searchable picker is gone");
    assert.match(TABS, /timezoneOptions\(initial\.timezone\)/,
      "the stored zone no longer joins the list — a custom value renders blank");
    const shared = read("src/lib/shared/timezones.ts");
    assert.match(shared, /EXTRA_TIMEZONES = \["UTC"\]/,
      "UTC left the list — Intl omits it, and the old select stored it");
    const settings = read("src/server/agencySettings.ts");
    assert.match(settings, /cleanTimezone\(patch\.timezone/,
      "the store no longer validates the zone — the five <option>s were the only guard");
    assert.match(settings, /return fallback/,
      "an invalid zone no longer keeps the stored one — a typo relocates the workspace");
  });

  it("the activity log pages rather than growing forever", () => {
    const panel = read("src/app/portal/agency/settings/ActivityLogPanel.tsx");
    assert.match(panel, /<Pagination/);
    for (const size of ['"10"', '"25"', '"50"', '"100"', '"all"']) {
      assert.ok(panel.includes(`<option value=${size}>`), `the ${size} page size is gone`);
    }
    assert.match(panel, /size === "all" \? 50_000 : size/,
      '"All" must be an explicit large limit — an omitted param used to return ONE record');
    const route = read("src/app/api/portal/settings/activity-log/route.ts");
    assert.match(route, /if \(value === null \|\| value\.trim\(\) === ""\) return fallback;/,
      "the Number(null)===0 dead-fallback bug is back");
  });

  it("settings search covers every tab and knows where things moved", () => {
    assert.match(TABS, /const TAB_KEYWORDS: Record<TabId, string>/);
    const registry = TABS.slice(TABS.indexOf("const TAB_KEYWORDS"), TABS.indexOf("};", TABS.indexOf("const TAB_KEYWORDS")));
    // The three retired tab NAMES must still find their new homes.
    assert.match(registry, /trading companies/, 'searching "trading companies" finds nothing');
    assert.ok(/access:.*team/.test(registry), 'searching "team" does not find the merged tab');
    assert.ok(/workspace:.*modules/.test(registry), 'searching "modules" does not find the merged tab');
    // And the search input itself exists.
    assert.match(TABS, /placeholder="Search settings…"/);
  });
});
