// Operations surface smoke (IA v2).
//
// Guards the five-surface agency sidebar: Command Centre · Inbox & actions ·
// Operations · Tools (Executive arrives later). Making Operations a real
// surface is a sidebar RE-GROUPING, not a route move: the business-function
// nav items move from the "main" panel to the labelled "ops" panel. Every
// /portal/agency/* route still resolves exactly as before — only the panelId
// (sidebar grouping) changed.
//
// See docs/development/plans/information-architecture-v2.md.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function ownerSidebar(): NavPanel[] {
  return buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
}

function panel(panels: NavPanel[], id: string): NavPanel | undefined {
  return panels.find(p => p.id === id);
}

// The business functions that make up the Operations surface, paired with the
// route each one still resolves to (routes are UNCHANGED by this regrouping).
const OPERATIONS: { id: string; href: string }[] = [
  { id: "pipelines",   href: "/portal/clients?view=journey" },
  { id: "fulfilment",  href: "/portal/agency/fulfilment" },
  { id: "aqua-tags",   href: "/portal/agency/fulfilment?view=tags" },
  { id: "marketing",   href: "/portal/agency/marketing" },
  { id: "finance",     href: "/portal/agency/agency-finance" },
  { id: "people",      href: "/portal/agency/people" },
  { id: "freelancers", href: "/portal/agency/freelancers" },
  { id: "sop-library", href: "/portal/agency/sop-library" },
  { id: "governance",  href: "/portal/agency/governance" },
];

describe("agency Operations surface (IA v2)", () => {
  it("collapses Operations to a single sidebar row with the functions held search-only", () => {
    const panels = ownerSidebar();
    const ops = panel(panels, "ops");
    assert.ok(ops, "an Operations functions panel should assemble");
    assert.equal(ops!.label, "Operations", "the Operations panel carries its label");
    // The functions panel is hidden — the Sidebar/MobileNav do NOT render it as
    // nested rows; it exists so Topbar quick-search can still reach the functions.
    assert.equal(ops!.hidden, true, "the Operations functions panel is search-only (hidden)");
    const opsIds = new Set(ops!.items.map(item => item.id));
    for (const { id } of OPERATIONS) {
      assert.ok(opsIds.has(id), `${id} should live in the hidden Operations functions panel`);
    }
    // The single rendered Operations row lives on main and lands on the hub.
    const main = panel(panels, "main");
    const operationsRow = main!.items.find(item => item.id === "operations-home");
    assert.ok(operationsRow, "a single Operations row renders on the main panel");
    assert.equal(operationsRow!.href, "/portal/agency/operations", "the Operations row lands on the hub");
  });

  it("renders the flat surface rows on the main panel: Command Centre, Inbox, Operations, Tools", () => {
    const main = panel(ownerSidebar(), "main");
    assert.ok(main, "a main (Command Centre) panel should assemble");
    assert.deepEqual(
      main!.items.map(item => item.id),
      ["home", "inbox", "operations-home", "tools"],
      "the main panel holds Command Centre, Inbox & actions, the Operations row, and Tools as flat rows",
    );
    // The business functions must NOT sit on main — they live on the hub.
    const mainIds = new Set(main!.items.map(item => item.id));
    for (const { id } of OPERATIONS) {
      assert.ok(!mainIds.has(id), `${id} should have moved off the main panel onto the hub`);
    }
  });

  it("renders Tools as a flat main row (not a nested labelled panel), separate from Operations", () => {
    const panels = ownerSidebar();
    // Ed: Tools should be a plain sidebar item, not a nested "TOOLS" group.
    assert.ok(!panels.some(p => p.id === "tools"), "Tools should no longer assemble as its own labelled panel");
    const main = panel(panels, "main");
    assert.ok(
      main!.items.some(item => item.id === "tools" && item.href === "/portal/agency/tools"),
      "Tools is a flat row on the main panel",
    );
    // Tools must not be swept into the Operations functions.
    const ops = panel(panels, "ops");
    assert.ok(!ops!.items.some(item => item.id === "tools"), "Tools is not an Operations function");
  });

  it("loses nothing — every Operations route/id still resolves in the sidebar", () => {
    const panels = ownerSidebar();
    const all = panels.flatMap(p => p.items);
    for (const { id, href } of OPERATIONS) {
      const matches = all.filter(item => item.id === id);
      assert.equal(matches.length, 1, `exactly one ${id} row should survive the regrouping`);
      assert.equal(matches[0]!.href, href, `${id} still points at its unchanged route`);
    }
  });

  it("orders the Operations surface as a delegation-friendly sequence", () => {
    const ops = panel(ownerSidebar(), "ops");
    const ids = ops!.items.map(item => item.id);
    // Journey, Fulfilment, Aqua tags, Marketing, Finance, People, Freelancers,
    // SOP library, Governance — then owner-only "You deserve it" trailing. This
    // is the delegation order the hub cards render in.
    assert.deepEqual(
      ids,
      ["pipelines", "fulfilment", "aqua-tags", "marketing", "finance", "people", "freelancers", "sop-library", "governance", "you-deserve-it"],
      "Operations functions follow the delegation order",
    );
  });

  it("assembles the flat surface shape: Command Centre · Inbox · Operations · Tools on main, settings in the footer", () => {
    const panels = ownerSidebar();
    const ids = panels.map(p => p.id);
    // Executive is a later lane. The rendered surfaces are now flat rows on the
    // unlabelled main panel (Command Centre, Inbox & actions, Operations, Tools),
    // with the Operations functions hidden and Settings in the footer.
    assert.ok(ids.includes("main"), "Command Centre surface present");
    assert.ok(ids.includes("ops"), "Operations functions panel present (hidden)");
    assert.ok(ids.includes("settings"), "Settings present (rendered in the footer)");
    const main = panel(panels, "main");
    assert.deepEqual(
      main!.items.map(item => item.id),
      ["home", "inbox", "operations-home", "tools"],
      "the main panel renders the four flat surface rows in order",
    );
  });

  // The hidden Operations panel is a two-sided contract between two consumers:
  // the Topbar MUST keep its items in quick-search, and the Sidebar MUST NOT
  // render it as a nav group. A "symmetry" cleanup that filters hidden in the
  // Topbar (or drops the filter in the Sidebar) would silently break search or
  // re-nest the functions — with nothing else failing. Pin both consumers.
  it("keeps hidden-panel functions in Topbar quick-search but out of the rendered Sidebar", () => {
    const topbar = read("src/components/chrome/Topbar.tsx");
    const sidebar = read("src/components/chrome/Sidebar.tsx");
    // Topbar's search source flattens ALL panels with no hidden filter.
    //
    // Renamed to `navSearchItems` on 2026-08-29 when search gained a second
    // source (`destinationSearchItems`, so pages with no nav row are findable
    // too). The CONTRACT is unchanged and is what is asserted: the panel flatten
    // still happens and still has no `hidden` filter. Matching the old variable
    // name would have failed on a rename while a real regression — adding a
    // hidden filter — would still have passed.
    assert.ok(
      /(nav)?[Ss]earchItems\s*=\s*panels\?\.flatMap/.test(topbar),
      "Topbar should build its nav search rows from panels.flatMap (all panels, hidden included)",
    );
    assert.ok(
      !/searchItems[\s\S]{0,120}hidden/.test(topbar),
      "Topbar searchItems must NOT filter out hidden panels — that would drop the Operations functions from search",
    );
    // Sidebar's rendered panels exclude hidden ones.
    assert.ok(
      /mainPanels\s*=\s*panels\.filter\([\s\S]*?!p\.hidden/.test(sidebar),
      "Sidebar mainPanels must exclude hidden panels so the Operations functions do not re-nest as rows",
    );
  });

  it("scopes the collapse to agency only — no hidden panel or Operations row leaks into client/customer nav", () => {
    for (const scope of ["client", "customer"] as const) {
      const panels = buildSidebar({ role: "agency-owner", scope, installedPlugins: [] });
      const allItems = panels.flatMap(p => p.items);
      assert.ok(!panels.some(p => p.hidden), `${scope} scope should assemble no hidden panel`);
      assert.ok(!allItems.some(i => i.id === "operations-home"), `${scope} scope should carry no Operations row`);
      assert.ok(!allItems.some(i => i.href === "/portal/agency/operations"), `${scope} scope should not link to the agency Operations hub`);
    }
  });

  it("gives agency-staff the same single Operations row (functions hidden, minus owner-only rows)", () => {
    const panels = buildSidebar({ role: "agency-staff", scope: "agency", installedPlugins: [] });
    const main = panels.find(p => p.id === "main");
    assert.ok(main?.items.some(i => i.id === "operations-home"), "agency-staff still gets the single Operations row");
    const ops = panels.find(p => p.id === "ops");
    if (ops) {
      assert.equal(ops.hidden, true, "the agency-staff Operations functions panel is search-only (hidden)");
      const ids = new Set(ops.items.map(i => i.id));
      assert.ok(!ids.has("people"), "agency-staff should not get the owner-only Staff function");
      assert.ok(!ids.has("freelancers"), "agency-staff should not get the owner-only Freelancers function");
    }
  });
});
