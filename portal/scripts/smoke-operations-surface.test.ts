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

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import type { NavPanel } from "../src/lib/chrome/sidebarLayout";

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
  it("groups every business function under the labelled Operations panel", () => {
    const ops = panel(ownerSidebar(), "ops");
    assert.ok(ops, "an Operations panel should assemble");
    assert.equal(ops!.label, "Operations", "the Operations surface carries its label");
    const opsIds = new Set(ops!.items.map(item => item.id));
    for (const { id } of OPERATIONS) {
      assert.ok(opsIds.has(id), `${id} should group under the Operations panel`);
    }
  });

  it("leaves only Command Centre + Inbox & actions on the main panel", () => {
    const main = panel(ownerSidebar(), "main");
    assert.ok(main, "a main (Command Centre) panel should assemble");
    assert.deepEqual(
      main!.items.map(item => item.id),
      ["home", "inbox"],
      "the main panel holds only Command Centre (home) and Inbox & actions",
    );
    // The business functions must NOT still sit on main.
    const mainIds = new Set(main!.items.map(item => item.id));
    for (const { id } of OPERATIONS) {
      assert.ok(!mainIds.has(id), `${id} should have moved off the main panel`);
    }
  });

  it("keeps Tools its own labelled surface, separate from Operations", () => {
    const panels = ownerSidebar();
    const tools = panel(panels, "tools");
    assert.ok(tools, "a Tools panel should assemble");
    assert.equal(tools!.label, "Tools");
    assert.ok(
      tools!.items.some(item => item.id === "tools" && item.href === "/portal/agency/tools"),
      "Tools keeps its own entry",
    );
    // Tools must not be swept into Operations.
    const ops = panel(panels, "ops");
    assert.ok(!ops!.items.some(item => item.id === "tools"), "Tools is not an Operations row");
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
    // SOP library, Governance — then owner-only "You deserve it" trailing.
    assert.deepEqual(
      ids,
      ["pipelines", "fulfilment", "aqua-tags", "marketing", "finance", "people", "freelancers", "sop-library", "governance", "you-deserve-it"],
      "Operations rows follow the delegation order",
    );
  });

  it("the five-surface shape assembles: main, Operations, Tools (settings in the footer)", () => {
    const panels = ownerSidebar();
    const ids = panels.map(p => p.id);
    // Executive is a later lane; Inbox & actions rides inside main today.
    assert.ok(ids.includes("main"), "Command Centre surface present");
    assert.ok(ids.includes("ops"), "Operations surface present");
    assert.ok(ids.includes("tools"), "Tools surface present");
    assert.ok(ids.includes("settings"), "Settings present (rendered in the footer)");
  });
});
