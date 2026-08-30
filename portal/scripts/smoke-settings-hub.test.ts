// The Settings hub — one index, canonical editors.
//
// Ed, 2026-08-29: *"we've got a lot of settings all over the place, each
// workspace having their own — I think we should compile them all into the main
// settings as well so we can do either."*
//
// The hub already stated the right design: *"read-mostly info + deep-link
// buttons to the existing detail pages… reusing the canonical surfaces for real
// editing."* The defect was that it was applied to 3 of 11 tabs and skipped for
// the biggest case of all — integrations, whose panel LIVES in this folder and
// was mounted in Master Inbox, Company → Connections and Dev Team → API, but
// never in Settings.
//
// So these tests pin the RULE rather than the layout:
//
//   > A Settings tab either owns a control outright, or it is an index linking
//   > to the canonical editor. Never a second copy of an editor that exists
//   > elsewhere.
//
// Plan: docs/development/plans/settings-consolidation.md

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const TABS = readFileSync("src/app/portal/agency/settings/SettingsTabs.tsx", "utf8");

describe("everything is editable INSIDE Settings", () => {
  // Ed, 2026-08-29: *"bring it all into settings rather than taking us out of
  // settings — so I can do it all inside."*
  //
  // This REVERSES the earlier decision that sent integration work to Company.
  // The history matters, so it is written down rather than quietly overwritten:
  // a Settings integrations tab existed, was removed in favour of Company →
  // Connections, and Ed asked for it back the same day this file first asserted
  // the opposite. Company → Connections still works and still renders the SAME
  // panel — the rule that survives is "one editor, many doors", not "one door".

  it("mounts integrations rather than sending you away", () => {
    assert.match(TABS, /<IntegrationConnectionsPanel clients=\{ctx\.clients\}/);
    assert.match(TABS, /\{ id: "connections", label: "Connections"/);
  });

  it("mounts freelancer access inside Roles & access, not as its own tab", () => {
    // *"freelancer access can go with roles and access"* — it is the same
    // question asked about a contractor.
    assert.match(TABS, /<FreelancerAccessConfigPanel initial=\{ctx\.freelancerAccess\}/);
    assert.doesNotMatch(TABS, /\{ id: "freelancer", label:/);
  });

  it("mounts agency-scoped module settings", () => {
    // 2026-08-30: the stacked panels became a cog-per-workspace list (Ed:
    // "workspaces should show all ... with a settings cog next to it"). The
    // key moved from the panel to the <li>; the panel itself still mounts,
    // which is what this test guarantees.
    assert.match(TABS, /<li key=\{settings\.pluginId\}/);
    assert.match(TABS, /<PluginSettingsPanel initial=\{settings\} \/>/);
    assert.match(TABS, /aria-expanded=\{open\}/,
      "the cog is no longer a disclosure — every panel renders at once again");
  });

  it("keeps retired tab ids resolving", () => {
    // A bookmark to #freelancer must open Roles & access, not fall back to the
    // first tab with no hint that the thing moved.
    assert.match(TABS, /freelancer: "access"/);
    assert.match(TABS, /showcase: "environment"/);
    assert.match(TABS, /LEGACY_TAB_ALIASES\[hash\]/);
  });

  it("does NOT render client-scoped module settings at agency scope", () => {
    // Their values belong to a client; an agency-scoped form would save
    // successfully and change nothing.
    assert.match(TABS, /CLIENT_SCOPED_SETTINGS_MODULES/);
  });
});

describe("one editor, many doors", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("every mount of the integrations panel imports the SAME component", () => {
    // Four surfaces render it: Settings, Company → Connections, Master Inbox and
    // Dev Team → API. Four doors onto one editor is the design. Four COPIES
    // would be the bug, and the copies would drift silently because each looks
    // correct on its own screen.
    const mounts = walk("src/app").filter(file => {
      const source = readFileSync(file, "utf8");
      return /<IntegrationConnectionsPanel\b/.test(source);
    });
    assert.ok(mounts.length >= 3, `expected several mounts, found ${mounts.length}`);
    for (const file of mounts) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /import \{ IntegrationConnectionsPanel \} from ["'][^"']*settings\/IntegrationConnectionsPanel["']|from ["']\.\.\/settings\/IntegrationConnectionsPanel["']|from ["']\.\/IntegrationConnectionsPanel["']/,
        `${file} renders the panel but does not import the canonical one`);
    }
  });
});

describe("the tab list stays honest", () => {
  it("every declared tab id has a render branch", () => {
    // A tab that renders nothing is a menu entry onto a blank screen — which is
    // how `account`, `freelancer` and `launch` came to be doors nobody noticed.
    const ids = [...TABS.matchAll(/\{ id: "([a-z]+)", label:/g)].map(match => match[1]);
    assert.ok(ids.length >= 7, `expected the tab list, found ${ids.length}`);
    for (const id of ids) {
      assert.ok(TABS.includes(`active === "${id}"`), `tab "${id}" has no render branch`);
    }
  });

  it("every tab id is in the TabId union", () => {
    const union = /type TabId =([^;]+);/.exec(TABS)?.[1] ?? "";
    const ids = [...TABS.matchAll(/\{ id: "([a-z]+)", label:/g)].map(match => match[1]);
    for (const id of ids) {
      assert.ok(union.includes(`"${id}"`), `"${id}" is rendered but missing from TabId`);
    }
  });
});
