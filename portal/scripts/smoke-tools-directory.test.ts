// Tools directory completeness smoke.
//
// Ed asked for the agency Tools page to list EVERY agency workspace directory
// so it works as one scannable launcher ("not all directories are listed, we
// should get them all in"). The risk this guards is silent omission: a future
// agency section is added to the sidebar assembly (or a plugin workspace) and
// nobody remembers to add it here, so it quietly falls out of the directory.
//
// The source of truth is the sidebar assembly (src/lib/chrome/sidebarLayout.ts).
// This test rebuilds the real agency-owner sidebar and asserts every reachable
// destination it produces appears on the Tools page — plus the plugin
// workspaces that the AquaOasis agency override deliberately parks OUT of the
// sidebar (People records / Email operations / Marketing operations), which are
// otherwise only reachable from Tools, and the core rows the override also drops
// (Freelancers). If any of those go missing, this fails.

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
const read = (p: string) => readFileSync(p, "utf8");

// A card in the directory is an object literal `href: "…"`. Matching the
// literal (with its closing quote) means `/portal/agency` does not spuriously
// match `/portal/agency/inbox`.
const linksTo = (page: string, href: string) => page.includes(`href: "${href}"`);

// The Tools page itself — never needs a card pointing at itself.
const SELF_HREF = "/portal/agency/tools";

describe("agency Tools page — complete workspace directory", () => {
  it("lists every reachable sidebar destination the agency owner sees", () => {
    const page = read(TOOLS_PAGE);
    // The real assembly, respecting the AquaOasis agency override.
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const hrefs = panels.flatMap(panel => panel.items.map(item => item.href));
    assert.ok(hrefs.length >= 12, `sidebar should assemble the agency destinations, got ${hrefs.length}`);

    const missing = hrefs.filter(href => href !== SELF_HREF && !linksTo(page, href));
    assert.deepEqual(
      missing,
      [],
      `Tools directory is missing reachable sidebar destinations: ${missing.join(", ")}. ` +
        `Add a card for each so navigation stays complete.`,
    );
  });

  it("keeps the plugin workspaces the sidebar override parks out of the nav", () => {
    const page = read(TOOLS_PAGE);
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
        `Tools must keep an entry point into ${name}; nothing links into ${prefix}`,
      );
    }
  });

  it("keeps the core rows the override drops but that stay reachable", () => {
    const page = read(TOOLS_PAGE);
    // Freelancers and the Activity log are real agency routes that the override
    // does not surface in the sidebar; the directory carries them, and each
    // resolves to a real mounted page — not an invented route.
    for (const segment of ["freelancers", "activity-inbox"]) {
      const href = `/portal/agency/${segment}`;
      assert.ok(linksTo(page, href), `Tools should link to ${href}`);
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

  it("groups the directory into scannable sections", () => {
    const page = read(TOOLS_PAGE);
    // Grouped by the sidebar's panels rather than one flat wall of cards.
    for (const title of ["Operating areas", "Money & people", "Operations", "Administration"]) {
      assert.ok(page.includes(title), `directory should carry the "${title}" group`);
    }
  });
});
