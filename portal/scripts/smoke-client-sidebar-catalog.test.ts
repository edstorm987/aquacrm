// The client workspace shows its modules' navigation — and the metadata that
// makes that possible cannot drift from the manifests it mirrors.
//
// ── The bug ──────────────────────────────────────────────────────────────
//
// Found 2026-08-28. `buildSidebar` was called in exactly two places, both with
// `scope: "agency"`; the client workspace layout built its panel by hand and
// never called it. So the builder's `scope === "client"` branch — role gates,
// `requiresFeature`, `:clientId` rewriting, all of it — was dead code for the
// only surface it was written for, and **33 declared nav items across six
// modules rendered nowhere**. Every client-scoped feature was reachable only by
// URL, or through a bespoke CTA someone remembered to add.
//
// ── The trade this file guards ───────────────────────────────────────────
//
// The fix could not be "import the manifests in the layout": the agency chrome
// already learned that lesson, and `agencySidebarPluginCatalog.ts` exists
// because importing the executable registry made every agency route compile the
// entire plugin graph. So the client chrome gets the same treatment — a
// lightweight, serialisable catalogue — and the same cost: a hand-maintained
// copy that can fall behind.
//
// That cost is what these tests remove. A copy pinned by `deepEqual` against
// the real manifest is not a duplicate, it is a projection.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, before } from "node:test";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import {
  CLIENT_SIDEBAR_PLUGIN_CATALOG,
  CLIENT_SIDEBAR_UNADVERTISED,
} from "../src/lib/chrome/clientSidebarPluginCatalog";
import { listPlugins } from "../src/built-ins/runtime/_registry";
import type { AquaPlugin, NavItem } from "../src/built-ins/runtime/_types";
import type { PluginInstall } from "../src/server/types";

const CLIENT_LAYOUT = "src/app/portal/clients/[clientId]/layout.tsx";

/** A nav item that lands on the client workspace, by its href alone. */
const isClientNav = (item: NavItem): boolean =>
  item.href.includes(":clientId") || item.href.includes("[clientId]") || item.href.startsWith("/portal/clients/");

const declaresRoles = (item: NavItem): boolean =>
  Boolean((item.visibleToRoles && item.visibleToRoles.length) || (item.roles && item.roles.length));

let plugins: AquaPlugin[] = [];
before(() => { plugins = listPlugins().filter(plugin => !plugin.id.startsWith("zz-")); });

describe("the client sidebar catalogue mirrors the manifests", () => {
  it("finds client-surface nav to check", () => {
    // Guards the guard: if the href test stops matching, every assertion below
    // passes over empty lists and proves nothing.
    const total = plugins.flatMap(p => (p.navItems ?? []).filter(isClientNav)).length;
    assert.ok(total > 20, `expected the modules' client nav items, found ${total}`);
  });

  it("every catalogued entry equals its manifest exactly", () => {
    for (const entry of CLIENT_SIDEBAR_PLUGIN_CATALOG) {
      const plugin = plugins.find(candidate => candidate.id === entry.id);
      assert.ok(plugin, `catalogue names "${entry.id}", which is not a registered module`);
      assert.deepEqual(
        entry.navItems,
        (plugin.navItems ?? []).filter(isClientNav),
        `client navigation for "${entry.id}" has drifted from its manifest. The catalogue is a `
        + "projection of the manifest, not a second source — copy the manifest's items across.",
      );
    }
  });

  it("no module that declares client roles is left out", () => {
    // The failure this prevents is silent: add a module with client nav, forget
    // the catalogue, and its pages are URL-only again with nothing to say so.
    const unadvertised = new Set(CLIENT_SIDEBAR_UNADVERTISED.map(entry => entry.id));
    const catalogued = new Set(CLIENT_SIDEBAR_PLUGIN_CATALOG.map(entry => entry.id));
    const missing = plugins
      .filter(plugin => (plugin.navItems ?? []).some(item => isClientNav(item) && declaresRoles(item)))
      .map(plugin => plugin.id)
      .filter(id => !catalogued.has(id) && !unadvertised.has(id));
    assert.deepEqual(
      missing,
      [],
      "These modules declare client-workspace nav with roles on it, but appear in neither the "
      + "catalogue nor the deliberately-unadvertised list, so their navigation renders nowhere:\n  "
      + missing.join("\n  "),
    );
  });

  it("the unadvertised modules are still genuinely undeclared", () => {
    // The reason each one is held back is "its nav items declare no roles". The
    // day someone declares them, that reason is false and this says so rather
    // than leaving a stale excuse in the file.
    for (const entry of CLIENT_SIDEBAR_UNADVERTISED) {
      const plugin = plugins.find(candidate => candidate.id === entry.id);
      assert.ok(plugin, `"${entry.id}" is listed as unadvertised but is not a registered module`);
      const clientNav = (plugin.navItems ?? []).filter(isClientNav);
      assert.ok(clientNav.length > 0, `"${entry.id}" no longer has client nav — drop it from the list`);
      const declared = clientNav.filter(declaresRoles);
      assert.deepEqual(
        declared.map(item => item.id),
        [],
        `"${entry.id}" now declares roles on some client nav items, so the stated reason for holding `
        + "it back no longer holds. Decide: move it into CLIENT_SIDEBAR_PLUGIN_CATALOG, or update the "
        + "reason to say what the new one is.",
      );
    }
  });
});

describe("the client workspace actually renders it", () => {
  it("the layout calls buildSidebar for the client scope, with the catalogue", () => {
    const layout = readFileSync(CLIENT_LAYOUT, "utf8");
    assert.match(layout, /buildSidebar\(\{/, "the layout must call the shared builder");
    assert.match(layout, /scope:\s*"client"/, "…for the client scope");
    assert.match(layout, /CLIENT_SIDEBAR_PLUGIN_CATALOG/, "…with the client catalogue");
    assert.match(layout, /currentClient:\s*client/, "…and the current client, or `:clientId` never resolves");
  });

  it("it drops the two foundation items the layout already builds by hand", () => {
    const layout = readFileSync(CLIENT_LAYOUT, "utf8");
    assert.match(layout, /FOUNDATION_DUPLICATES/, "the duplicate-dropping must be explicit");
    assert.match(layout, /"home",\s*"client-settings"/, "both duplicates must be named");
  });

  it("it is gated on the same element the plugin pages require", () => {
    // `[...rest]/page.tsx` refuses any plugin page below `view` on
    // `client.systems`. A link that redirects is worse than no link.
    const layout = readFileSync(CLIENT_LAYOUT, "utf8");
    assert.match(layout, /clientElementVisible\("client\.systems"\)/,
      "plugin nav must be gated on client.systems, as the plugin route host is");
    const host = readFileSync("src/app/portal/clients/[clientId]/[...rest]/page.tsx", "utf8");
    assert.match(host, /client\.systems/, "…and the host must still be the thing that gate mirrors");
  });
});

describe("the gates still bite once the nav renders", () => {
  const install = (pluginId: string, features: Record<string, boolean> = {}): PluginInstall => ({
    id: `a|c|${pluginId}`, pluginId, agencyId: "a", clientId: "c",
    enabled: true, config: {}, features, installedAt: 0, updatedAt: 0,
  } as PluginInstall);
  const client = { id: "c", agencyId: "a", name: "C" } as never;

  const labels = (role: string, installs: PluginInstall[]): string[] =>
    buildSidebar({
      role: role as never, scope: "client", currentClient: client,
      installedPlugins: installs, pluginCatalog: CLIENT_SIDEBAR_PLUGIN_CATALOG,
    }).flatMap(panel => panel.items.map(item => item.label));

  it("hides a feature-gated item when the add-on is off, and shows it when on", () => {
    const off = labels("client-owner", [install("client-crm")]);
    assert.ok(!off.includes("Pipelines"), "an absent feature key must hide the board");
    assert.ok(off.includes("Contacts"), "…without hiding the rest of the module");

    const on = labels("client-owner", [install("client-crm", { "journey-pipelines": true })]);
    assert.ok(on.includes("Pipelines"), "and switching it on must reveal it");
    assert.ok(on.includes("Automations"));
  });

  it("hides an item whose roles exclude the viewer", () => {
    const staff = labels("agency-staff", [install("client-crm")]);
    assert.ok(staff.includes("Contacts"), "agency-staff may view the CRM");
    assert.ok(!staff.includes("Settings"), "…but its Settings names only owners/managers and the client");
  });

  it("shows nothing for a module that is not installed", () => {
    assert.deepEqual(labels("client-owner", []).filter(l => l === "Contacts"), []);
  });

  it("rewrites the :clientId placeholder", () => {
    const hrefs = buildSidebar({
      role: "client-owner" as never, scope: "client", currentClient: client,
      installedPlugins: [install("client-crm", { "journey-pipelines": true })],
      pluginCatalog: CLIENT_SIDEBAR_PLUGIN_CATALOG,
    }).flatMap(panel => panel.items.map(item => item.href));
    assert.ok(hrefs.includes("/portal/clients/c/client-crm/pipelines"), `saw ${hrefs.join(", ")}`);
    assert.ok(!hrefs.some(href => href.includes(":clientId")), "no placeholder may survive");
  });
});
