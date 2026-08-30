// Ed's palette — saved external links as cards on Tools.
//
// The load-bearing part is not the cards, it is the URL: an arbitrary string a
// person typed, stored, and rendered back into an `href`. `javascript:` in an
// href executes on click — stored XSS with no script tag anywhere near it —
// so the scheme check is an ALLOW-list and it runs on write, on server read,
// and again in the client store.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkSavedToolUrl, savedToolHref } from "../src/lib/chrome/savedToolUrl";
import { normaliseSavedTool } from "../src/lib/server/chrome/userChromeLayout";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("a saved tool's URL cannot become a weapon", () => {
  it("allows exactly the two schemes that open a page", () => {
    assert.equal(checkSavedToolUrl("https://coolors.co/palettes").ok, true);
    assert.equal(checkSavedToolUrl("http://192.168.1.20:8080/admin").ok, true);
  });

  it("refuses every scheme that runs code instead", () => {
    for (const payload of [
      "javascript:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/uuid",
      // The scheme nobody has invented yet — allow-list means it fails closed.
      "web+custom://do-something",
    ]) {
      const check = checkSavedToolUrl(payload);
      assert.equal(check.ok, false, `${payload} was accepted`);
    }
  });

  it("strips control characters BEFORE judging, so smuggling fails", () => {
    // `java\nscript:` walks past a startsWith check; the URL parser and every
    // browser strip the newline, so the string judged must be the string acted on.
    const smuggled = "java\nscript:alert(1)";
    assert.equal(checkSavedToolUrl(smuggled).ok, false, "newline smuggling got through");
    const tabbed = "\tjavascript:alert(1)";
    assert.equal(checkSavedToolUrl(tabbed).ok, false, "tab smuggling got through");
  });

  it("refuses embedded credentials and over-length rather than repairing", () => {
    assert.equal(checkSavedToolUrl("https://admin:hunter2@evil.example/login").ok, false);
    assert.equal(checkSavedToolUrl(`https://example.com/${"a".repeat(2000)}`).ok, false,
      "an over-length URL must be refused, never truncated — half a URL is a link somewhere else");
  });

  it("savedToolHref answers with a safe value or nothing at all", () => {
    assert.equal(savedToolHref("javascript:void(0)"), "");
    assert.equal(savedToolHref(undefined), "");
    assert.match(savedToolHref("https://example.com"), /^https:\/\/example\.com/);
  });
});

describe("the store validates on the way OUT, not only in", () => {
  it("drops a stored record whose URL fails today's rules", () => {
    // The realm files are hand-edited and records outlive rules. A malicious or
    // stale record must die at read time, before it can reach an href.
    assert.equal(normaliseSavedTool({
      id: "t1", label: "Trap", url: "javascript:alert(1)",
      order: 0, createdAt: 1, updatedAt: 1,
    }), null);
  });

  it("keeps a good record intact", () => {
    const tool = normaliseSavedTool({
      id: "t2", label: "Coolors", url: "https://coolors.co", note: "palettes",
      order: 3, createdAt: 1, updatedAt: 2,
    });
    assert.ok(tool);
    assert.equal(tool!.label, "Coolors");
    assert.equal(tool!.note, "palettes");
  });

  it("is validated a third time in the client store, the last gate before the href", () => {
    const store = read("src/components/chrome/pinnedTabsStore.ts");
    assert.match(store, /export function normalizeTools/,
      "the client-side gate is gone — a response from an older deploy reaches the href unchecked");
    assert.match(store, /savedToolHref/, "the client gate no longer uses the shared checker");
  });
});

describe("the palette renders safely and survives the store's other clients", () => {
  it("opens cards with noopener AND noreferrer, as plain anchors", () => {
    const palette = read("src/app/portal/agency/tools/_MyToolsPalette.tsx");
    assert.match(palette, /target="_blank"/);
    assert.match(palette, /rel="noopener noreferrer"/,
      "noreferrer matters on its own: portal URLs carry client ids that must not ride the Referer header");
    assert.doesNotMatch(palette, /<Link[^>]*href=\{tool\.url\}/,
      "next/link is for in-app routes — an external URL through it is wrong");
  });

  it("refuses over the cap instead of evicting", () => {
    const palette = read("src/app/portal/agency/tools/_MyToolsPalette.tsx");
    assert.match(palette, /Remove one you no longer use first/,
      "the cap now evicts — a palette somebody curated silently loses a card");
  });

  it("survives the sidebar and pin clients saving their own fields", () => {
    // The chrome-layout route's rule: absent means "leave it", present means
    // "set it". Without the savedTools line, a sidebar drag would wipe the
    // palette — the exact bug smoke-topbar-control-pins exists to prevent.
    const route = read("src/app/api/portal/chrome/layout/route.ts");
    assert.match(route, /savedTools: Array\.isArray\(body\.savedTools\) \? body\.savedTools : current\.savedTools/,
      "an absent savedTools field now clears the palette");
  });

  it("survives a sidebar reset", () => {
    const store = read("src/lib/server/chrome/userChromeLayout.ts");
    const reset = store.slice(store.indexOf("export function resetUserChromeOrder"));
    assert.match(reset.slice(0, 1400), /savedTools: current\.savedTools/,
      "reset-my-sidebar now deletes the palette — cards are shortcuts made, not an arrangement chosen");
    assert.match(reset.slice(0, 1400), /customCss: current\.customCss/,
      "reset-my-sidebar erases the person's stylesheet again (Ed's 2026-08-30 finding)");
  });

  it("stays out of the public showcase", () => {
    const page = read("src/app/portal/agency/tools/page.tsx");
    assert.match(page, /\{!session\.publicShowcase \? <MyToolsPalette \/> : null\}/,
      "a read-only showcase visitor is being offered a personal palette");
  });
});
