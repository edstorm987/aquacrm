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
import {
  MAX_SAVED_TOOL_FOLDERS,
  normaliseLayout,
  normaliseSavedTool,
  normaliseSavedToolFolder,
  normaliseSavedToolIconAsset,
} from "../src/lib/server/chrome/userChromeLayout";

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
      id: "t2", label: "Coolors", url: "https://coolors.co", note: "palettes", icon: "external-link",
      order: 3, createdAt: 1, updatedAt: 2,
    });
    assert.ok(tool);
    assert.equal(tool!.label, "Coolors");
    assert.equal(tool!.note, "palettes");
    assert.equal(tool!.icon, "external-link");
    assert.equal(normaliseSavedTool({
      id: "t3", label: "Legacy", url: "https://example.com", icon: "external_link",
      order: 4, createdAt: 1, updatedAt: 2,
    })?.icon, undefined, "server and client icon-key normalization diverged");
  });

  it("keeps only bounded private raster icon references", () => {
    const valid = normaliseSavedToolIconAsset({
      fileName: "logo.png",
      contentType: "image/png",
      size: 12_000,
      storageProvider: "local",
      storageKey: "scope/tool/icon.png",
      uploadedAt: 5,
    });
    assert.equal(valid?.storageKey, "scope/tool/icon.png");
    assert.equal(normaliseSavedToolIconAsset({ ...valid, contentType: "image/svg+xml" }), null);
    assert.equal(normaliseSavedToolIconAsset({ ...valid, size: 512 * 1024 + 1 }), null);
    assert.equal(normaliseSavedToolIconAsset({ ...valid, storageProvider: "public-url" }), null);
  });

  it("normalises folders and unfiles orphaned cards without deleting them", () => {
    assert.deepEqual(normaliseSavedToolFolder({ id: "folder_1", name: "  Design  ", order: 2, createdAt: 1, updatedAt: 2 }), {
      id: "folder_1", name: "Design", order: 2, createdAt: 1, updatedAt: 2,
    });
    const layout = normaliseLayout({
      savedToolFolders: [{ id: "folder_1", name: "Design", order: 0, createdAt: 1, updatedAt: 1 }],
      savedTools: [
        { id: "kept", label: "Coolors", url: "https://coolors.co", folderId: "folder_1", order: 0, createdAt: 1, updatedAt: 1 },
        { id: "unfiled", label: "Test", url: "https://example.com", folderId: "missing", order: 1, createdAt: 1, updatedAt: 1 },
      ],
    }, "agency_a", "user_a");
    assert.equal(layout.savedTools.length, 2);
    assert.equal(layout.savedTools[0]?.folderId, "folder_1");
    assert.equal(layout.savedTools[1]?.folderId, undefined);
  });

  it("caps flat folders rather than allowing an unbounded chrome payload", () => {
    const layout = normaliseLayout({
      savedToolFolders: Array.from({ length: MAX_SAVED_TOOL_FOLDERS + 4 }, (_, index) => ({
        id: `folder_${index}`, name: `Folder ${index}`, order: index, createdAt: 1, updatedAt: 1,
      })),
    }, "agency_a", "user_a");
    assert.equal(layout.savedToolFolders.length, MAX_SAVED_TOOL_FOLDERS);
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

  it("uses normal-sized cards, descriptions, uploaded icons, and touch-sized controls", () => {
    const palette = read("src/app/portal/agency/tools/_MyToolsPalette.tsx");
    assert.match(palette, /Description/);
    assert.match(palette, /min-h-40/);
    assert.match(palette, /prepareSavedToolIcon/);
    assert.match(palette, /savedToolFolders/);
    assert.match(palette, /size-11/);
    assert.match(palette, /Delete folder/);
  });

  it("serialises mutations and keeps editor errors in their own scope", () => {
    const palette = read("src/app/portal/agency/tools/_MyToolsPalette.tsx");
    assert.match(palette, /const busyRef = useRef\(false\)/,
      "state-only disabling allows two same-tick clicks to start duplicate saves");
    assert.match(palette, /function beginMutation\(\): boolean/);
    assert.match(palette, /const \[toolProblem, setToolProblem\]/);
    assert.match(palette, /const \[folderProblem, setFolderProblem\]/);
    assert.match(palette, /const \[paletteProblem, setPaletteProblem\]/);
    assert.match(palette, /role="group" aria-label=\{`Manage \$\{tool\.label\}`\}/,
      "the always-visible card controls need a labelled group for assistive technology");
    assert.match(palette, /disabled=\{interactionLocked\}/,
      "edit, cancel, folder and icon controls must lock while an acknowledged mutation is in flight");
  });

  it("keeps recovery, privacy help, destructive touch targets, and delete payloads fail-closed", () => {
    const palette = read("src/app/portal/agency/tools/_MyToolsPalette.tsx");
    const confirm = read("src/components/ui/ConfirmDialog.tsx");
    assert.match(palette, /window\.addEventListener\("online", retryIcon\)/,
      "a transient private-icon request failure never recovers when connectivity returns");
    assert.match(palette, /window\.setTimeout\(retryIcon, 2_000\)/,
      "a transient icon-route failure while still online remains latched until reload");
    assert.match(palette, /iconIdentity/,
      "changing private-icon metadata leaves the old broken-image state latched");
    assert.match(palette, /aria-describedby="my-tools-privacy"/);
    assert.match(palette, /Only you can see these shortcuts/,
      "the privacy explanation is hidden in a hover-only title again");
    assert.doesNotMatch(palette, /title="Your own saved links/);
    assert.ok((confirm.match(/min-h-11/g) ?? []).length >= 2,
      "the shared confirmation actions fell below the 44px touch target");
    assert.match(palette, /authoritativeToolsAfterIconDelete/);
    assert.match(palette, /tools\.length !== rawTools\.length/,
      "a malformed icon-delete layout can be normalised to an empty array and wipe every card");
    assert.match(palette, /const latest = await refresh\(\)/,
      "the store does not adopt the route-owned icon revision before removing the card");
    assert.match(palette, /latest\.savedTools\.filter/,
      "the card deletion ignores intervening or still-projected palette changes");
    assert.match(palette, /Your tools were left untouched/);
  });

  it("keeps uploaded bytes private and user-owned", () => {
    const route = read("src/app/api/portal/chrome/tools/[toolId]/icon/route.ts");
    assert.match(route, /getSessionFromRequest/);
    assert.match(route, /getUserChromeLayout\(who\.agencyId, who\.userId\)/);
    assert.match(route, /image\/png/);
    assert.doesNotMatch(route, /image\/svg\+xml/);
    assert.match(route, /MAX_ICON_BYTES = 512 \* 1024/);
    assert.match(route, /x-content-type-options/);
    assert.doesNotMatch(route, /searchParams\.get\(["'](?:key|provider)["']\)/,
      "a caller must never be able to address somebody else's object by provider key");
  });

  it("survives the sidebar and pin clients saving their own fields", () => {
    // The chrome-layout route's rule: absent means "leave it", present means
    // "set it". Without the savedTools line, a sidebar drag would wipe the
    // palette — the exact bug smoke-topbar-control-pins exists to prevent.
    const route = read("src/app/api/portal/chrome/layout/route.ts");
    assert.match(route, /const savedTools = Array\.isArray\(body\.savedTools\)/,
      "an absent savedTools field now clears the palette");
    assert.match(route, /iconAsset: current\.savedTools\.find/,
      "the general layout writer now trusts a browser-supplied private storage key");
    assert.match(route, /normaliseLayout\([\s\S]*?\)\.savedTools/,
      "the private-icon deletion guard no longer compares against the canonical saved-tool proposal");
    assert.match(route, /new Set\(savedTools\.map\(tool => tool\.id\)\)/,
      "a malformed saved-tool row can bypass the private-icon deletion guard");
    assert.match(route, /saved_tool_icon_attached/,
      "a card can now be removed while leaving its private icon orphaned");
    assert.match(route, /savedToolFolders: Array\.isArray\(body\.savedToolFolders\) \? body\.savedToolFolders : current\.savedToolFolders/,
      "an older chrome client now clears tool folders it does not know about");
  });

  it("survives a sidebar reset", () => {
    const store = read("src/lib/server/chrome/userChromeLayout.ts");
    const reset = store.slice(store.indexOf("export function resetUserChromeOrder"));
    assert.match(reset.slice(0, 1400), /savedTools: current\.savedTools/,
      "reset-my-sidebar now deletes the palette — cards are shortcuts made, not an arrangement chosen");
    assert.match(reset.slice(0, 1400), /savedToolFolders: current\.savedToolFolders/,
      "reset-my-sidebar now deletes the palette's folders");
    assert.match(reset.slice(0, 1400), /customCss: current\.customCss/,
      "reset-my-sidebar erases the person's stylesheet again (Ed's 2026-08-30 finding)");
  });

  it("stays out of the public showcase", () => {
    const page = read("src/app/portal/agency/tools/page.tsx");
    assert.match(page, /\{!session\.publicShowcase \? <MyToolsPalette \/> : null\}/,
      "a read-only showcase visitor is being offered a personal palette");
  });
});
