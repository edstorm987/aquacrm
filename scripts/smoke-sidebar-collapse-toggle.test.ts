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
    assert.ok(src.includes('SIDEBAR_COLLAPSED_KEY = "mm-sidebar-collapsed"'));
    assert.ok(src.includes('next ? "1" : "0"'));
    assert.ok(src.includes("localStorage.setItem"));
  });

  it("toggles data-collapsed on <aside aria-label=Primary navigation>", () => {
    const src = readFileSync(TOGGLE, "utf8");
    assert.ok(src.includes('aside[aria-label="Primary navigation"]'));
    assert.ok(src.includes('setAttribute("data-collapsed"'));
  });

  it("exports synchronous hydration script for <head> (no flash)", () => {
    const src = readFileSync(TOGGLE, "utf8");
    assert.ok(src.includes("SIDEBAR_HYDRATION_SCRIPT"));
    assert.ok(src.includes("export function SidebarCollapseHydrationScript"));
    // Must read localStorage synchronously (no async/await/setTimeout).
    assert.ok(src.includes("localStorage.getItem"));
    assert.ok(!src.includes("await fetch"));
  });
});

describe("Sidebar wires the toggle (R035)", () => {
  it("Sidebar renders <SidebarCollapseToggle> on desktop and ships data-collapsed=\"false\" default", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    assert.ok(src.includes("import { SidebarCollapseToggle }"));
    assert.ok(src.includes("<SidebarCollapseToggle />"));
    assert.ok(src.includes('data-collapsed="false"'));
    // Mobile slide-over opts out so the chevron doesn't render twice.
    assert.ok(src.includes("!mobile && <SidebarCollapseToggle"));
  });

  it("nav links carry title= tooltip + first-letter fallback (no auto-collapse on click)", () => {
    const src = readFileSync(SIDEBAR, "utf8");
    assert.ok(src.includes("title={item.label}"));
    assert.ok(src.includes("mm-sidebar-link-initial"));
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
});

describe("Root layout hydration (R035)", () => {
  it("layout.tsx mounts SidebarCollapseHydrationScript inside <head>", () => {
    const src = readFileSync(LAYOUT, "utf8");
    assert.ok(src.includes("SidebarCollapseHydrationScript"));
    assert.ok(src.includes("<head>"));
    // Must be inside <head> (script before <body> so it runs pre-paint).
    const headIdx = src.indexOf("<head>");
    const scriptIdx = src.indexOf("SidebarCollapseHydrationScript />");
    const bodyIdx = src.indexOf("<body>");
    assert.ok(headIdx > -1 && scriptIdx > headIdx && scriptIdx < bodyIdx);
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
