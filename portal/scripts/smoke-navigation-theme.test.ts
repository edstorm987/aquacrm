import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("sidebar uses real icons and presents the merged people hub as Journey", () => {
  const link = read("src/components/chrome/SidebarNavLink.tsx");
  const layout = read("src/lib/chrome/sidebarLayout.ts");
  assert.match(link, /pipelines:\s*Ship/);
  assert.doesNotMatch(link, /const initial\s*=/);
  assert.match(layout, /label:\s*"Journey"/);
  assert.match(layout, /href:\s*"\/portal\/clients\?view=journey"/);
});

test("portal dark mode is persistent and scoped", () => {
  const mode = read("src/lib/chrome/colorMode.ts");
  const toggle = read("src/components/chrome/ColorModeToggle.tsx");
  const routeCanvas = read("src/components/chrome/PortalRouteCanvas.tsx");
  const profile = read("src/components/chrome/ProfileMenu.tsx");
  const css = read("src/app/globals.css");
  const agencyLayout = read("src/app/portal/agency/layout.tsx");
  const clientLayout = read("src/app/portal/clients/[clientId]/layout.tsx");
  const customerChrome = read("src/app/portal/customer/_CustomerPortalChrome.tsx");

  assert.match(mode, /milesymedia-color-mode/);
  assert.match(toggle, /localStorage\.setItem/);
  assert.match(toggle, /variant === "menu"/);
  assert.match(toggle, /role="menuitemcheckbox"/);
  assert.match(toggle, /MutationObserver/);
  assert.match(toggle, /commandLocked/);
  assert.match(toggle, /data-portal-shell/);
  assert.match(toggle, /if \(commandLocked\) return null/);
  assert.match(routeCanvas, /commandPreviousColorMode/);
  assert.match(routeCanvas, /root\.dataset\.colorMode = "dark"/);
  assert.match(routeCanvas, /localStorage\.getItem\(COLOR_MODE_STORAGE_KEY\)/);
  assert.doesNotMatch(routeCanvas, /localStorage\.setItem/);
  assert.match(profile, /ColorModeToggle variant="menu"/);
  assert.match(profile, /mm-profile-trigger/);
  assert.match(profile, /mm-profile-menu-header/);
  assert.match(profile, /bg-\[#FFFDF8\]/);
  assert.match(css, /html\[data-color-mode="dark"\] \.mm-portal-root/);
  assert.match(css, /html\[data-portal-shell="command"\] \.mm-color-mode-toggle\s*\{\s*display:\s*none !important/);
  assert.match(css, /\.mm-profile-trigger\[data-open="true"\]/);
  assert.match(css, /\.mm-profile-menu-header\s*\{\s*background:\s*#F8EEDB/);
  assert.match(css, /html\[data-color-mode="dark"\] \.mm-portal-root \.mm-profile-trigger/);
  assert.match(css, /html\[data-color-mode="dark"\] \.mm-portal-root \.mm-profile-menu-header/);
  assert.match(css, /html\[data-color-mode="dark"\] \.mm-portal-root \.mm-profile-menu :is\(\[role="menuitem"\], \[role="menuitemcheckbox"\]\)/);
  assert.match(agencyLayout, /mm-portal-root/);
  assert.match(clientLayout, /mm-portal-root/);
  assert.match(customerChrome, /mm-portal-root/);
  assert.match(customerChrome, /ColorModeToggle/);
});

test("shared visual baseline preserves readable surfaces and controls", () => {
  const css = read("src/app/globals.css");
  const customerChrome = read("src/app/portal/customer/_CustomerPortalChrome.tsx");
  const clientWorkspace = read("src/app/portal/clients/[clientId]/page.tsx");

  assert.match(css, /Portal visual QA baseline/);
  assert.match(css, /\[class~="bg-white\/35"\]/);
  assert.match(css, /--mm-text-secondary:/);
  assert.match(css, /min-height:\s*2\.5rem/);
  assert.match(css, /\.mm-auth-foot a\s*\{\s*color:\s*#70452F/);
  assert.match(css, /\[data-auth-brand="aqua"\] \.mm-auth-foot a\s*\{\s*color:\s*#17686A/);
  assert.match(css, /\[data-auth-brand="zimante"\] \.mm-auth-foot a\s*\{\s*color:\s*#795D32/);
  assert.match(customerChrome, /contrastRatio/);
  assert.match(customerChrome, /--portal-accent-dark/);
  assert.match(clientWorkspace, /ClientWorkspaceHeader/);
  assert.doesNotMatch(clientWorkspace, /max-w-7xl/);
});

// ── The active nav icon, and why it kept "getting downed out" ───────────────
//
// lucide-react renders its `color` prop as a `stroke` PRESENTATION ATTRIBUTE on
// the <svg> (node_modules/lucide-react → `stroke: color`). A `color:` declaration
// on the parent span cannot reach it. So `.is-active .mm-sidebar-link-icon`'s
// `color: #fff` never painted the glyph in any nav that hands its icons an
// explicit colour — Dev Team gives every section its own hue — and the section
// colour stayed on the solid tone tile: #2f7d4a on #68717c is 1.02:1.
test("the active nav icon's glyph is set with stroke, not just color", () => {
  const css = read("src/app/globals.css");
  assert.match(
    css,
    /\.mm-sidebar-link\.is-active \.mm-sidebar-link-icon > svg \{[^}]*stroke:\s*currentColor/,
    "the active icon tile must restate its foreground as `stroke` so it reaches a lucide glyph",
  );
  // The Command Center shell makes the same move for its own focus/active tiles.
  assert.match(
    css,
    /\.mm-sidebar-link:is\(:focus-visible, \.is-active\) \.mm-sidebar-link-icon svg \{[^}]*stroke:\s*currentColor/,
  );
});

test("no nav-icon hover effect may lower the icon's contrast", () => {
  const css = read("src/app/globals.css");
  const devTeam = read("src/app/portal/dev-team/layout.tsx");

  // The active tile carries a WHITE glyph, so brightening the tile moves the two
  // colours together (4.94:1 → 4.29:1 on the default tone). Deepening it is the
  // lift that always raises contrast (4.94:1 → 6.05:1).
  assert.doesNotMatch(css, /\.mm-sidebar-link\.is-active:hover \.mm-sidebar-link-icon \{[^}]*brightness/);
  assert.match(
    css,
    /\.mm-sidebar-link\.is-active:hover \.mm-sidebar-link-icon \{[^}]*background:\s*color-mix\(in srgb, var\(--nav-tone\) 88%, black\)/,
  );

  // Dev Team's own hover re-tinted glyph and chip together with saturate(1.4),
  // which cost the non-active rows 3.70:1 → 3.44:1 in the mill. A ring lifts
  // without touching either colour.
  assert.doesNotMatch(devTeam, /\.mm-sidebar-link:hover \.mm-sidebar-link-icon \{[^}]*filter:/);
  assert.match(devTeam, /\.mm-sidebar-link:hover \.mm-sidebar-link-icon \{[^}]*box-shadow:\s*0 0 0 1px color-mix/);
});

test("dark mode re-points ring-white, the way it already re-points ring-black", () => {
  // `ring-2 ring-white` separates an attention badge from the surface behind it.
  // That surface is white only in light mode; left alone the ring draws a bright
  // halo on every dark sidebar and topbar.
  const css = read("src/app/globals.css");
  assert.match(
    css,
    /html\[data-color-mode="dark"\] \.mm-portal-root \[class~="ring-white"\] \{[^}]*--tw-ring-color:\s*var\(--mm-badge-ring/,
  );
  assert.match(read("src/app/portal/dev-team/layout.tsx"), /--mm-badge-ring:\s*var\(--dt-surface\)/);
});
