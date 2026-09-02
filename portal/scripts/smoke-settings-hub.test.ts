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

process.env.PORTAL_BACKEND ??= "memory";

import { listPlugins } from "../src/built-ins/runtime/_registry";
import { isSettingUnwired } from "../src/lib/plugins/unwiredSettings";
import { AGENCY_SCOPED_SETTINGS_MODULE_IDS } from "../src/lib/chrome/settingsModules";

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
    assert.match(TABS, /resolveSettingsTabHash\(window\.location\.hash, TAB_IDS, LEGACY_TAB_ALIASES\)/);
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

// ─── The other half of the hub's refusal ──────────────────────────────────

describe("a module the hub refuses to edit is editable where its scope IS clear", () => {
  // `settingsModules.ts` sends the four `scopePolicy: "client"` modules away
  // from the agency hub on purpose — an agency-scoped form would write values
  // the client-scoped read never looks at. That refusal is only honest if the
  // client workspace actually has the editor.
  //
  // It did not. Until 2026-08-30 only `ecommerce` mounted the panel;
  // `affiliates`, `memberships` and `client-crm` shipped read-only <dl>s that
  // PRINTED the configured values — client-CRM's went as far as instructing the
  // operator to "define a schema by setting `install.config.customAttributeSchema`",
  // a key nothing in the product could write. So the hub said "edit it in the
  // client workspace" and three of the four had nowhere to do it.

  const CLIENT_SCOPED = ["client-crm", "affiliates", "ecommerce", "memberships"] as const;

  it("the list under test is the same one the hub defers to", () => {
    // If a module is added to CLIENT_SCOPED_SETTINGS_MODULES and not here, the
    // hub starts sending people to a page this test never checked.
    const source = readFileSync("src/lib/chrome/settingsModules.ts", "utf8");
    const declared = /CLIENT_SCOPED_SETTINGS_MODULES = \[([^\]]+)\]/.exec(source)?.[1] ?? "";
    const ids = [...declared.matchAll(/"([a-z-]+)"/g)].map(match => match[1]);
    assert.deepEqual([...ids].sort(), [...CLIENT_SCOPED].sort());
  });

  for (const pluginId of CLIENT_SCOPED) {
    it(`${pluginId}'s Settings page mounts the canonical panel, client-scoped`, () => {
      const page = readFileSync(
        `src/built-ins/modules/${pluginId}/src/pages/SettingsPage.tsx`,
        "utf8",
      );
      assert.match(
        page,
        /import \{ PluginSettingsPanel \} from "@\/components\/workspaces\/PluginSettingsPanel"/,
        "one editor, many doors — a per-module copy would drift silently",
      );
      assert.match(page, /<PluginSettingsPanel initial=\{settings\}/,
        "the page reads settings but never renders the editor");
      // The clientId is the whole reason this page exists rather than a hub row.
      assert.match(page, /clientId=\{props\.clientId\}/,
        "the panel must post at client scope, or the save lands where the read never looks");
      assert.match(page, /describePluginSettings\(/);
      assert.match(page, /clientId: props\.clientId/,
        "the server read must be client-scoped too, or one client sees another's values");
    });
  }
});

// ─── No agency-scoped module is left with nowhere to be edited ────────────

describe("an agency-scoped module with a working setting has a door in the hub", () => {
  // The hub list is hand-maintained, so a module can declare a setting the code
  // genuinely reads and simply never be named — a wired value editable from
  // nowhere. This derives the obligation instead of trusting the list.
  //
  // The rule is deliberately "has at least one WIRED field", not "declares
  // settings": `public-funnel`, `fulfillment`, `website-editor` and
  // `leads-pipeline` declare only fields nothing reads, and a cog opening a
  // panel of "Not connected" controls teaches people that cogs are decoration.
  // Wire one of theirs and this test starts demanding the row.
  //
  // 2026-08-30 (review): `leads-pipeline` was briefly listed on the grounds
  // that `campaigns.fromName` is read when a blast is composed. It is not — the
  // module contains no `install.config` read at all, and `fromName` only looked
  // wired because `lib/integrations/catalog.ts` declares an SMTP credential of
  // the same id. It is in `UNWIRED_SETTINGS` now, so this test no longer owes
  // it a row. That is the failure mode this rule is FOR, so it is worth saying
  // out loud: `isSettingUnwired` is only as good as the sweep behind it.

  it("every agency-scoped module with a wired field is in the hub list", () => {
    const owed = listPlugins()
      .filter(plugin => plugin.scopePolicy === "agency")
      .filter(plugin => (plugin.settings?.groups ?? [])
        .flatMap(group => group.fields ?? [])
        .some(field => !isSettingUnwired(plugin.id, field.id)))
      .map(plugin => plugin.id);

    // Guard the guard: an empty registry, or an `isSettingUnwired` that
    // answered `true` to everything, would make `owed` empty and the assertion
    // below pass while proving nothing. Anchored on named modules rather than a
    // count — the count was `>= 4` until 2026-08-30, and the fourth was
    // `leads-pipeline`, owed only because of the `fromName` id collision. Three
    // is the true figure: `agency-hr` is listed in the hub but declares only
    // unwired fields, so it is not OWED a row by this rule (it has one anyway —
    // a separate finding, and removing it is a product call, not a test's).
    for (const anchor of ["agency-finance", "agency-marketing", "email-sender"]) {
      assert.ok(owed.includes(anchor),
        `${anchor} reads its own settings, so the derivation must owe it a row — found ${owed.join(", ")}`);
    }
    const missing = owed.filter(id => !AGENCY_SCOPED_SETTINGS_MODULE_IDS.includes(id));
    assert.deepEqual(
      missing,
      [],
      "these modules read a setting nothing can edit — add a row to AGENCY_SCOPED_SETTINGS_MODULES "
      + "(or wire an editor into the module itself)",
    );
  });

  it("every listed module is actually registered, so the row is not silently dropped", () => {
    // `settings/page.tsx` filters out a null describe. A row for an
    // unregistered plugin therefore looks like a fix and renders nothing —
    // `bos-auth-gate` declares `loginPath` and is exactly this case.
    const registered = new Set(listPlugins().map(plugin => plugin.id));
    for (const id of AGENCY_SCOPED_SETTINGS_MODULE_IDS) {
      assert.ok(registered.has(id), `"${id}" is listed in the settings hub but is not a registered plugin`);
    }
  });
});
