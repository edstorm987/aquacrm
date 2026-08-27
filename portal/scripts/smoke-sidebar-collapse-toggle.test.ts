// T1 R035 smoke — Sidebar collapse toggle.
// Run via `npm run smoke:sidebar-collapse-toggle` (tsx --test).
//
// Source-marker style — components are client/server React under the
// Next runtime; we exercise the contract via shipped-source assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TOGGLE = join(ROOT, "src", "components", "chrome", "SidebarCollapseToggle.tsx");
const SIDEBAR = join(ROOT, "src", "components", "chrome", "Sidebar.tsx");
const SIDEBAR_FOOTER = join(ROOT, "src", "components", "chrome", "SidebarFooter.tsx");
const SIDEBAR_NAV_LINK = join(ROOT, "src", "components", "chrome", "SidebarNavLink.tsx");
const SIDEBAR_STATE = join(ROOT, "src", "components", "chrome", "sidebarCollapseState.ts");
const MOBILE_NAV = join(ROOT, "src", "components", "chrome", "MobileNav.tsx");
const LAYOUT = join(ROOT, "src", "app", "layout.tsx");
const CSS = join(ROOT, "src", "app", "globals.css");

describe("SidebarCollapseToggle component (R035)", () => {
  it("file exists + is a client component", () => {
    assert.equal(existsSync(TOGGLE), true);
    const src = readFileSync(TOGGLE, "utf8");
    assert.ok(src.startsWith('"use client"'), "must be a client component");
    assert.ok(src.includes("export function SidebarCollapseToggle"));
  });

  it("persists to localStorage[\"mm-sidebar-collapsed\"] as \"1\"/\"0\"", () => {
    const src = readFileSync(TOGGLE, "utf8");
    const state = readFileSync(SIDEBAR_STATE, "utf8");
    assert.ok(src.includes("SIDEBAR_COLLAPSED_KEY"));
    assert.ok(state.includes('SIDEBAR_COLLAPSED_KEY = "mm-sidebar-collapsed"'));
    assert.ok(src.includes('next ? "1" : "0"'));
    assert.ok(src.includes("localStorage.setItem"));
  });

  it("toggles data-collapsed on <aside aria-label=Primary navigation>", () => {
    const src = readFileSync(TOGGLE, "utf8");
    assert.ok(src.includes('aside[aria-label="Primary navigation"]'));
    assert.ok(src.includes('setAttribute("data-collapsed"'));
  });

  it("exports synchronous hydration script for <head> (no flash)", () => {
    const src = readFileSync(SIDEBAR_STATE, "utf8");
    assert.ok(src.includes("SIDEBAR_COLLAPSE_HYDRATION_SCRIPT"));
    // Must read localStorage synchronously (no async/await/setTimeout).
    assert.ok(src.includes("localStorage.getItem"));
    assert.ok(!src.includes("await fetch"));
  });
});

describe("Sidebar wires the toggle (R035)", () => {
  it("Sidebar ships data-collapsed=\"false\" and delegates the one toggle to the footer", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    const footer = readFileSync(SIDEBAR_FOOTER, "utf8");
    assert.ok(src.includes('data-collapsed="false"'));
    assert.ok(src.includes("<SidebarFooter settingsItems={settingsItems} mobile={mobile} />"));
    assert.ok(!src.includes("<SidebarCollapseToggle"));
    assert.ok(footer.includes("import { SidebarCollapseToggle }"));
    assert.ok(footer.includes("<SidebarCollapseToggle />"));
  });

  it("nav links carry title= tooltip + first-letter fallback (no auto-collapse on click)", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    const navLink = readFileSync(SIDEBAR_NAV_LINK, "utf8");
    assert.ok(navLink.includes("title={hoverTitle}"));
    assert.ok(navLink.includes("attentionTitle(visibleAttention)"));
    assert.ok(navLink.includes("mm-sidebar-link-icon"));
    // Critical: nothing in the Link onClick mutates data-collapsed or
    // calls setItem on the collapsed key. Source-marker assertion.
    assert.ok(!src.includes("setAttribute(\"data-collapsed\""));
    assert.ok(!src.includes("mm-sidebar-collapsed"));
  });

  it("collapsible class + label/heading hide-targets present for CSS selectors", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    assert.ok(src.includes("mm-sidebar-collapsible"));
    assert.ok(src.includes("mm-sidebar-heading"));
    assert.ok(src.includes("mm-sidebar-link-label"));
    assert.ok(src.includes("mm-sidebar-tenant"));
  });

  it("keeps the persistent collapsible sidebar on tablet and reserves the drawer for phones", () => {
    const sidebar = readFileSync(SIDEBAR, "utf8");
    const mobileNav = readFileSync(MOBILE_NAV, "utf8");
    assert.ok(sidebar.includes('"hidden md:flex border-r'));
    assert.ok(mobileNav.includes("md:hidden"));
    assert.ok(mobileNav.includes("right-5 top-6"));
    assert.ok(!sidebar.includes('"hidden xl:flex border-r'));
  });

  it("keeps internal client workspaces expanded with every navigation section visible", () => {
    const sidebar = readFileSync(SIDEBAR, "utf8");
    const toggle = readFileSync(TOGGLE, "utf8");
    const styles = readFileSync(CSS, "utf8");

    assert.ok(sidebar.includes('data-sidebar-lock={variant === "client" ? "expanded" : undefined}'));
    assert.ok(sidebar.includes('className="mm-sidebar-panel mm-sidebar-panel-expanded"'));
    assert.ok(sidebar.includes('mobile || variant === "client" ? "overflow-y-auto overscroll-contain pr-1"'));
    assert.ok(toggle.includes('aside?.dataset.sidebarLock === "expanded"'));
    assert.ok(styles.includes(':not([data-sidebar-lock="expanded"])'));
    assert.ok(styles.includes('[data-sidebar-variant="client"] [data-sidebar-collapse-toggle]'));
  });
});

describe("Root layout hydration (R035)", () => {
  it("layout.tsx mounts the sidebar bootstrap through Next beforeInteractive in <head>", () => {
    const src = readFileSync(LAYOUT, "utf8");
    assert.ok(src.includes("SIDEBAR_COLLAPSE_HYDRATION_SCRIPT"));
    assert.ok(src.includes('import Script from "next/script"'));
    assert.ok(src.includes("<head>"));
    // Must be inside <head> (script before <body> so it runs pre-paint).
    const headIdx = src.indexOf("<head>");
    const scriptIdx = src.indexOf('id="aqua-sidebar-collapse-bootstrap"');
    const bodyIdx = src.indexOf("<body>");
    assert.ok(headIdx > -1 && scriptIdx > headIdx && scriptIdx < bodyIdx);
    assert.match(src, /id="aqua-sidebar-collapse-bootstrap" strategy="beforeInteractive"/);
    assert.doesNotMatch(src, /<script\s+dangerouslySetInnerHTML/);
  });
});

describe("Collapsed CSS contract (R035)", () => {
  it("globals.css shrinks to 56px and hides labels under [data-collapsed=true]", () => {
    const src = readFileSync(CSS, "utf8");
    assert.ok(src.includes('data-collapsed="true"'));
    assert.ok(src.includes("3.5rem")); // 56px
    assert.ok(src.includes("mm-sidebar-link-label"));
    assert.ok(src.includes("mm-sidebar-heading"));
    // Mobile slide-over is excluded so drawer keeps full width.
    assert.ok(src.includes('data-sidebar-mobile="true"'));
  });

  it("lets the route canvas consume both sides of the workspace padding", () => {
    const src = readFileSync(CSS, "utf8");
    assert.match(src, /\.mm-route-canvas\s*\{[\s\S]*?width:\s*auto;[\s\S]*?max-width:\s*none;/);
    assert.doesNotMatch(src, /\.mm-portal-topbar,\s*\.mm-private-surface,\s*\.mm-route-canvas\s*\{/);
  });
});

describe("No auto-collapse on route change (R035)", () => {
  it("Sidebar.tsx is server-rendered with no useEffect/usePathname route hook", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    assert.ok(!src.startsWith('"use client"'));
    assert.ok(!src.includes("useEffect"));
    assert.ok(!src.includes("usePathname"));
    // No mobile-viewport auto-hide CSS that could read as auto-collapse:
    // collapse is purely user-driven via the toggle button.
  });
});
