import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("sidebar uses real icons and presents pipelines as Journey", () => {
  const link = read("src/components/chrome/SidebarNavLink.tsx");
  const layout = read("src/lib/chrome/sidebarLayout.ts");
  assert.match(link, /pipelines:\s*Ship/);
  assert.doesNotMatch(link, /const initial\s*=/);
  assert.match(layout, /label:\s*"Journey"/);
});

test("portal dark mode is persistent and scoped", () => {
  const mode = read("src/lib/chrome/colorMode.ts");
  const toggle = read("src/components/chrome/ColorModeToggle.tsx");
  const css = read("src/app/globals.css");
  const agencyLayout = read("src/app/portal/agency/layout.tsx");
  const clientLayout = read("src/app/portal/clients/[clientId]/layout.tsx");
  const customerChrome = read("src/app/portal/customer/_CustomerPortalChrome.tsx");

  assert.match(mode, /milesymedia-color-mode/);
  assert.match(toggle, /localStorage\.setItem/);
  assert.match(css, /html\[data-color-mode="dark"\] \.mm-portal-root/);
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
  assert.match(clientWorkspace, /max-w-7xl/);
});
