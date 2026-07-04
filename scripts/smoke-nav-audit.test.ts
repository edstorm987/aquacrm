// T1 nav-audit smoke (chapter 04-nav-audit-and-fixes).
// Run via `tsx --test scripts/smoke-nav-audit.test.ts`.
//
// Source-marker style — we don't boot Next here; we read the shipped
// source files and assert the navigation contracts that the chapter
// fixes. Twelve cases:
//   1. AQUA_HQ hrefs unique + non-empty
//   2. MORE_TOOLS hrefs unique + non-empty across sub-groups
//   3. Settings row href is /portal/agency/settings
//   4. ProfileMenu "Edit profile" → /portal/account exists
//   5. ProfileMenu "Preferences"  → /portal/account/preferences exists
//   6. ProfileMenu "Permissions"  → /portal/account/permissions exists
//   7. AgencySwitcher posts "+ Add" to /api/auth/agency-add (route exists)
//   8. Catch-all renders friendly not-installed page (no notFound on
//      known plugin id when install missing)
//   9. Catch-all still hard-404s for genuinely-unknown paths
//  10. SiteShell footer targets all resolve to a Next route OR a
//      public/_marketing/*.html OR a next.config rewrite
//  11. Sidebar empty-state + per-panel empty-state markup ships
//  12. AgencyToolsBallpark sub-grouping (Operations / Communications /
//      Growth) ships

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BALLPARK = join(ROOT, "src", "components", "chrome", "AgencyToolsBallpark.tsx");
const SIDEBAR  = join(ROOT, "src", "components", "chrome", "Sidebar.tsx");
const PROFILE  = join(ROOT, "src", "components", "chrome", "ProfileMenu.tsx");
const SWITCHER = join(ROOT, "src", "components", "chrome", "AgencySwitcher.tsx");
const SITESHELL = join(ROOT, "src", "components", "SiteShell.tsx");
const CATCHALL = join(ROOT, "src", "app", "portal", "agency", "[...rest]", "page.tsx");
const NEXTCFG  = join(ROOT, "next.config.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// Crude href-extractor — pulls every `href: "..."` literal from a
// component source. Sufficient for these arrays.
function extractHrefs(src: string): string[] {
  const out: string[] = [];
  const re = /href:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]!);
  return out;
}

describe("nav audit (T1 nav-audit)", () => {
  it("1. AQUA_HQ hrefs are unique + non-empty", () => {
    const src = read(BALLPARK);
    const block = src.match(/AQUA_HQ:[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
    const hrefs = extractHrefs(block);
    assert.ok(hrefs.length >= 5, `expected 5+ AQUA_HQ hrefs, got ${hrefs.length}`);
    for (const h of hrefs) assert.ok(h.length > 0);
    assert.equal(new Set(hrefs).size, hrefs.length, "AQUA_HQ hrefs not unique");
  });

  it("2. MORE_TOOLS_GROUPS hrefs are unique + non-empty across all groups", () => {
    const src = read(BALLPARK);
    const block = src.match(/MORE_TOOLS_GROUPS[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
    const hrefs = extractHrefs(block);
    assert.ok(hrefs.length >= 6, `expected 6+ MORE_TOOLS hrefs, got ${hrefs.length}`);
    for (const h of hrefs) assert.ok(h.startsWith("/portal/agency/"));
    assert.equal(new Set(hrefs).size, hrefs.length, "MORE_TOOLS hrefs not unique");
  });

  it("3. Settings row points at /portal/agency/settings", () => {
    const src = read(BALLPARK);
    assert.ok(/SETTINGS_ROW[\s\S]*?href:\s*"\/portal\/agency\/settings"/.test(src));
  });

  it("4. ProfileMenu 'Edit profile' resolves to /portal/account/page.tsx", () => {
    const src = read(PROFILE);
    assert.ok(src.includes('href="/portal/account"'));
    assert.ok(existsSync(join(ROOT, "src", "app", "portal", "account", "page.tsx")));
  });

  it("5. ProfileMenu 'Preferences' resolves to /portal/account/preferences", () => {
    const src = read(PROFILE);
    assert.ok(src.includes('href="/portal/account/preferences"'));
    assert.ok(existsSync(join(ROOT, "src", "app", "portal", "account", "preferences")));
  });

  it("6. ProfileMenu 'Permissions' resolves to /portal/account/permissions", () => {
    const src = read(PROFILE);
    assert.ok(src.includes('href="/portal/account/permissions"'));
    assert.ok(existsSync(join(ROOT, "src", "app", "portal", "account", "permissions")));
  });

  it("7. AgencySwitcher's '+ Add' posts to /api/auth/agency-add (route file exists)", () => {
    const src = read(SWITCHER);
    assert.ok(src.includes('"/api/auth/agency-add"'), "switcher must POST to agency-add");
    assert.ok(existsSync(join(ROOT, "src", "app", "api", "auth", "agency-add", "route.ts")));
  });

  it("8. Catch-all renders friendly not-installed page for known plugin paths", () => {
    const src = read(CATCHALL);
    assert.ok(src.includes('listPlugins'), "catch-all must consult registry");
    assert.ok(src.includes('plugin-not-installed'), "must render data-testid stub");
    // Friendly path exists BEFORE the bare notFound() fallthrough.
    const friendlyIdx = src.indexOf('plugin-not-installed');
    const notFoundIdx = src.lastIndexOf('notFound()');
    assert.ok(friendlyIdx > 0 && friendlyIdx < notFoundIdx,
      "friendly stub must precede generic notFound()");
  });

  it("9. Catch-all still hard-404s for genuinely-unknown paths", () => {
    const src = read(CATCHALL);
    // notFound() is still called on the unknown-plugin path.
    assert.ok(/if\s*\(\s*known\s*\)/.test(src), "must branch on `known` plugin");
    assert.ok(src.includes('notFound();'), "must keep hard-404 escape");
  });

  it("10. SiteShell footer targets resolve (route OR _marketing OR rewrite)", () => {
    const src = read(SITESHELL);
    const cfg = read(NEXTCFG);
    // Pull every `href="..."` from SiteShell footer block.
    const footer = src.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? "";
    const re = /href="(\/[^"#?]+)/g;
    const targets = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(footer)) !== null) targets.add(m[1]!);
    assert.ok(targets.size >= 5, "expected several footer targets");
    for (const t of targets) {
      const slug = t.replace(/^\//, "").split("/")[0]!;
      const asAppRoute = existsSync(join(ROOT, "src", "app", slug));
      const asMarketing =
        existsSync(join(ROOT, "public", "_marketing", `${slug}.html`)) ||
        existsSync(join(ROOT, "public", slug, "index.html")) ||
        existsSync(join(ROOT, "public", slug));
      const asRewrite = cfg.includes(`source: "${t}"`) || cfg.includes(`source: "/${slug}"`);
      assert.ok(
        asAppRoute || asMarketing || asRewrite,
        `footer target ${t} has no resolver (route / _marketing / rewrite)`,
      );
    }
  });

  it("11. Sidebar ships empty-state + per-panel empty-state stubs", () => {
    const src = read(SIDEBAR);
    assert.ok(src.includes('sidebar-empty-state'),
      "Sidebar must render an empty-state when no panels");
    assert.ok(src.includes('No tools enabled'),
      "Sidebar must render a per-panel empty-state line");
  });

  it("12. AgencyToolsBallpark groups MORE_TOOLS into Operations / Communications / Growth", () => {
    const src = read(BALLPARK);
    assert.ok(/id:\s*"operations"/.test(src),     "operations sub-group missing");
    assert.ok(/id:\s*"communications"/.test(src), "communications sub-group missing");
    assert.ok(/id:\s*"growth"/.test(src),         "growth sub-group missing");
  });
});
