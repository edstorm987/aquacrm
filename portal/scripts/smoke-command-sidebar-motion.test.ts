import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Command Center sidebar interactions", () => {
  it("acquires each station using its own colour in both bridge palettes", async () => {
    const [styles, navLink, footer, collapse] = await Promise.all([
      readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/SidebarNavLink.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/SidebarFooter.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/chrome/SidebarCollapseToggle.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(navLink, /data-nav-tone=\{NAV_TONES\[id\]/);
    assert.match(footer, /data-nav-tone="slate"/);
    assert.match(footer, /data-nav-tone="rose"/);
    assert.match(collapse, /data-nav-tone="slate"/);
    assert.match(styles, /@keyframes mm-command-sidebar-scan/);
    assert.match(styles, /@keyframes mm-command-nav-lock/);
    assert.match(styles, /data-color-mode="light"\]\[data-portal-shell="command"\][\s\S]*?\.mm-sidebar-link:hover \.mm-sidebar-link-icon/);
    assert.match(styles, /data-color-mode="dark"\]\[data-portal-shell="command"\][\s\S]*?\.mm-sidebar-link:hover \.mm-sidebar-link-icon/);
    assert.match(styles, /\.mm-sidebar-link:focus-visible \.mm-sidebar-link-icon/);
    assert.match(styles, /\.mm-sidebar-footer \.mm-sidebar-link:hover \.mm-sidebar-link-icon[\s\S]*?background: transparent !important/);
    assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.mm-sidebar-link::after/);
  });
});
