// Tools / Operations split — the anti-orphan guard.
//
// HISTORY, because this test REVERSED a decision and that must not look like a
// mistake to whoever reads it next. It used to assert that the agency Tools
// page listed EVERY workspace directory, from Ed's request "not all directories
// are listed, we should get them all in".
//
// On 2026-08-30 Ed reversed it: "just put all the workspaces in operations just
// have additional spaces or something… no more workspace directory since this
// should all be in operations already". Tools becomes his personal workbench
// (calendar, notes, chat, and his own saved links).
//
// The reason the old test existed is still live, so it is kept and REPOINTED
// rather than deleted. The AquaOasis agency override parks three plugin
// workspaces out of the sidebar (People records / Email operations / Marketing
// operations) and drops the Activity log; the directory was their only door.
// Moving the directory without carrying those would leave four real workspaces
// reachable from nowhere. So the completeness requirement now lands on
// OPERATIONS, and this file proves the move orphaned nothing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";
import agencyHrManifest from "../src/built-ins/modules/agency-hr/index";
import emailSenderManifest from "../src/built-ins/modules/email-sender/index";
import agencyMarketingManifest from "../src/built-ins/modules/agency-marketing/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TOOLS_PAGE = join(ROOT, "src", "app", "portal", "agency", "tools", "page.tsx");
const OPS_PAGE = join(ROOT, "src", "app", "portal", "agency", "operations", "page.tsx");
const read = (p: string) => readFileSync(p, "utf8");

// A card in the directory is an object literal `href: "…"`. Matching the
// literal (with its closing quote) means `/portal/agency` does not spuriously
// match `/portal/agency/inbox`.
const linksTo = (page: string, href: string) => page.includes(`href: "${href}"`);

// The Tools page itself — never needs a card pointing at itself.
const SELF_HREF = "/portal/agency/tools";

describe("every workspace kept a door when the directory moved", () => {
  it("Operations lists every reachable sidebar destination the agency owner sees", () => {
    const page = read(OPS_PAGE);
    // The real assembly, respecting the AquaOasis agency override.
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const hrefs = panels.flatMap(panel => panel.items.map(item => item.href));
    assert.ok(hrefs.length >= 12, `sidebar should assemble the agency destinations, got ${hrefs.length}`);

    // Operations never links to itself, and the two personal utilities stay in
    // Tools by design — Ed asked for "calender notes chat in tools".
    const KEPT_IN_TOOLS = ["/portal/agency/calendar", "/portal/agency/notepad"];
    const OPS_SELF = "/portal/agency/operations";
    const toolsPage = read(TOOLS_PAGE);
    const missing = hrefs.filter(href =>
      href !== SELF_HREF && href !== OPS_SELF && !KEPT_IN_TOOLS.includes(href) && !linksTo(page, href));
    assert.deepEqual(
      missing,
      [],
      `Operations is missing reachable sidebar destinations: ${missing.join(", ")}. ` +
        `The Tools directory moved here — add a card for each so nothing is orphaned.`,
    );
    for (const href of KEPT_IN_TOOLS) {
      assert.ok(linksTo(toolsPage, href), `${href} should still be on the Tools utility deck`);
    }
  });

  it("keeps the plugin workspaces the sidebar override parks out of the nav", () => {
    const page = read(OPS_PAGE);
    // These plugins are installed/enabled but the agency override filters their
    // rows out of the sidebar entirely, so Tools is their only entry point.
    // Anchor each requirement to the plugin actually declaring agency nav items
    // under that workspace prefix — if the plugin is retired the requirement
    // relaxes with it; while it lives, Tools must link into it.
    const cases: { manifest: { navItems: { href: string }[] }; prefix: string; name: string }[] = [
      { manifest: agencyHrManifest, prefix: "/portal/agency/agency-hr", name: "People records (agency-hr)" },
      { manifest: emailSenderManifest, prefix: "/portal/agency/email-sender", name: "Email operations (email-sender)" },
      { manifest: agencyMarketingManifest, prefix: "/portal/agency/agency-marketing", name: "Marketing operations (agency-marketing)" },
    ];
    for (const { manifest, prefix, name } of cases) {
      const declaresWorkspace = manifest.navItems.some(item => item.href.startsWith(prefix));
      assert.ok(declaresWorkspace, `${name} should still declare agency nav items under ${prefix}`);
      assert.ok(
        page.includes(prefix),
        `Operations must keep an entry point into ${name}; nothing links into ${prefix}. ` +
          `These are parked out of the sidebar, so this is their only door.`,
      );
    }
  });

  it("keeps the core rows the override drops but that stay reachable", () => {
    const page = read(OPS_PAGE);
    // Freelancers and the Activity log are real agency routes that the override
    // does not surface in the sidebar; the directory carries them, and each
    // resolves to a real mounted page — not an invented route.
    for (const segment of ["freelancers", "activity-inbox"]) {
      const href = `/portal/agency/${segment}`;
      assert.ok(linksTo(page, href), `Operations should link to ${href}`);
      assert.ok(
        existsSync(join(ROOT, "src", "app", "portal", "agency", segment, "page.tsx")),
        `${href} should be a mounted page`,
      );
    }
  });

  it("preserves the Quick actions hub (Calendar + Notepad)", () => {
    const page = read(TOOLS_PAGE);
    assert.ok(page.includes("Quick actions"), "Quick actions heading should remain");
    assert.ok(linksTo(page, "/portal/agency/calendar"), "Calendar quick action should remain");
    assert.ok(linksTo(page, "/portal/agency/notepad"), "Notepad quick action should remain");
  });

  it("does not point a directory card at the Tools page itself", () => {
    const page = read(TOOLS_PAGE);
    assert.ok(!linksTo(page, SELF_HREF), "Tools should not list a card that navigates back to Tools");
  });

  it("groups Operations into scannable sections rather than one wall of cards", () => {
    const page = read(OPS_PAGE);
    // The five original delegation clusters, plus the two that absorbed the
    // directory on 2026-08-30.
    for (const title of [
      "Sell & deliver", "Grow", "Money & people", "Standards & governance", "Reward",
      "Records & operations", "Surfaces",
    ]) {
      assert.ok(page.includes(title), `Operations should carry the "${title}" group`);
    }
  });

  it("has actually removed the directory from Tools", () => {
    // The point of the move. Without this, both pages could carry it and the
    // duplication Ed asked to remove would quietly survive.
    const page = read(TOOLS_PAGE);
    assert.ok(!page.includes("Workspace directory"),
      "the workspace directory is still on Tools — the move duplicated it instead of moving it");
    assert.ok(!page.includes("All agency workspaces"));
    for (const href of ["/portal/agency/agency-hr", "/portal/agency/email-sender", "/portal/agency/agency-marketing"]) {
      assert.ok(!page.includes(href), `Tools still links into ${href}; it should live on Operations now`);
    }
  });

  it("does not leave the showcase a blank Tools page", () => {
    // In public showcase the utility deck is deliberately empty. With the
    // directory gone that rendered nothing at all, so there is an explicit
    // empty state that points at Operations instead.
    const page = read(TOOLS_PAGE);
    assert.match(page, /!quickTools\.length \? \(/,
      "nothing handles the showcase case, so the page renders empty");
    assert.ok(page.includes("/portal/agency/operations"),
      "the empty state should send people to Operations");
  });
});
