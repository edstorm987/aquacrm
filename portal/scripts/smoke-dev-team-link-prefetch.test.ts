import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { devTeamLinkPrefetch } from "../src/lib/chrome/devTeamLinkPrefetch";
import { sharedChromeLinkPrefetch } from "../src/lib/chrome/sharedChromeLinkPrefetch";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("heavy optional Dev Team destinations opt out of automatic prefetch", () => {
  assert.equal(devTeamLinkPrefetch("/portal/dev-team/editor"), false);
  assert.equal(devTeamLinkPrefetch("/portal/dev-team/findings"), false);
  assert.equal(devTeamLinkPrefetch("/portal/dev-team/findings?view=auditor"), false);
  assert.equal(devTeamLinkPrefetch("/portal/dev-team/findings#open"), false);
});

test("ordinary navigation keeps the Next.js default prefetch policy", () => {
  assert.equal(devTeamLinkPrefetch("/portal/dev-team"), undefined);
  assert.equal(devTeamLinkPrefetch("/portal/dev-team/roadmap"), undefined);
  assert.equal(devTeamLinkPrefetch("/portal/agency"), undefined);
  assert.equal(devTeamLinkPrefetch("https://example.com/portal/dev-team/editor"), undefined);
});

test("shared chrome suppresses hidden localhost compiles without changing production", () => {
  assert.equal(sharedChromeLinkPrefetch("development"), false);
  assert.equal(sharedChromeLinkPrefetch("production"), undefined);
  assert.equal(sharedChromeLinkPrefetch("test"), undefined);
});

test("sidebar, topbar, Settings footer and pinned navigation share the development policy", () => {
  const sidebar = read("src/components/chrome/SidebarNavLink.tsx");
  const topbar = read("src/components/chrome/Topbar.tsx");
  const footer = read("src/components/chrome/SidebarFooter.tsx");
  const pinned = read("src/components/chrome/PinnedTabs.tsx");

  assert.match(sidebar, /prefetch=\{sharedChromeLinkPrefetch\(\) \?\? devTeamLinkPrefetch\(href\)\}/);
  assert.equal(topbar.match(/prefetch=\{sharedChromeLinkPrefetch\(\)\}/g)?.length, 3);
  assert.match(footer, /prefetch=\{sharedChromeLinkPrefetch\(\)\}/);
  assert.equal(pinned.match(/prefetch=\{sharedChromeLinkPrefetch\(\)\}/g)?.length, 2);
});

test("every mounted Dev Team landing-page source applies the policy", () => {
  const sidebar = read("src/components/chrome/SidebarNavLink.tsx");
  const home = read("src/app/portal/dev-team/page.tsx");
  const cards = read("src/app/portal/dev-team/_ui.tsx");

  assert.match(sidebar, /prefetch=\{sharedChromeLinkPrefetch\(\) \?\? devTeamLinkPrefetch\(href\)\}/);
  assert.match(home, /prefetch=\{devTeamLinkPrefetch\(href\)\}/);
  assert.match(home, /href="\/portal\/dev-team\/findings\?view=auditor" prefetch=\{false\}/);
  assert.match(cards, /prefetch=\{devTeamLinkPrefetch\(href\)\}/);
});
