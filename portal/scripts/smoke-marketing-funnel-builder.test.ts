import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The funnel builder, restored to a first-class Marketing destination.
 *
 * The 10 → 5 marketing consolidation did not delete the funnel builder
 * (`FunnelsWorkspace`) — it buried it two levels deep: Marketing → Channels tab
 * → the "funnels" channel. From the founder seat that read as "the funnel
 * builder disappeared". These tests pin it back as its own top-level **Funnels**
 * tab (right after Demand) while keeping every old path resolving.
 *
 * Each new-behaviour test below FAILS against the buried state: there was no
 * `funnels` entry in `MARKETING_TAB_VIEWS`, no `<MarketingTab … "funnels" …>` in
 * the nav, `resolveMarketingView("funnels")` returned Channels, and there was no
 * `view === "funnels"` render branch.
 */

const MARKETING_DIR = new URL("../src/app/portal/agency/marketing/", import.meta.url);
const PAGE = readFileSync(new URL("page.tsx", MARKETING_DIR), "utf8");

async function views() {
  return import("../src/app/portal/agency/marketing/_marketingViews");
}

// ── (a) Funnels is a top-level Marketing tab in the nav ──────────────────────

test("funnels is a top-level tab, ordered right after Demand", async () => {
  const { MARKETING_TAB_VIEWS } = await views();
  const list = [...MARKETING_TAB_VIEWS];
  assert.ok(list.includes("funnels"), "funnels must be a top-level tab, not buried in Channels");
  assert.equal(list[list.indexOf("demand") + 1], "funnels", "funnels sits immediately after demand");
});

test("the nav bar actually renders a Funnels tab pointing at ?view=funnels", async () => {
  const bar = PAGE.slice(
    PAGE.indexOf("function MarketingWorkspaceNavigation"),
    PAGE.indexOf("</nav>", PAGE.indexOf("function MarketingWorkspaceNavigation")),
  );
  const rendered = [...bar.matchAll(/<MarketingTab href=\{marketingHref\("([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(rendered.includes("funnels"), "the rendered nav has no Funnels tab");
  assert.equal(rendered[rendered.indexOf("demand") + 1], "funnels", "the rendered Funnels tab sits after Demand");
});

test("?view=funnels is canonical — it resolves to the Funnels tab, not Channels", async () => {
  const { resolveMarketingView, isMarketingView } = await views();
  assert.ok(isMarketingView("funnels"), "funnels is a legal top-level view");
  const resolved = resolveMarketingView("funnels", undefined, undefined);
  assert.equal(resolved.view, "funnels", "?view=funnels must open the Funnels tab (its canonical home)");
});

// ── (b) The view === "funnels" branch renders the BUILDER, not the board ─────

test('the view === "funnels" branch renders FunnelsWorkspace (the builder)', async () => {
  assert.ok(PAGE.includes("import { FunnelsWorkspace }"), "the builder component is imported");
  const start = PAGE.indexOf('view === "funnels" ?');
  assert.ok(start > -1, 'there is a top-level view === "funnels" render branch');
  // Bound the branch at the next view arm so we inspect only what Funnels renders.
  const branch = PAGE.slice(start, PAGE.indexOf('view === "customers" ?', start));
  assert.match(branch, /<FunnelsWorkspace/, "the Funnels tab renders the builder");
  assert.match(branch, /projects=\{FIRST_PARTY_DEVELOPMENT_PROJECTS/, "the builder gets the same project props it gets in Channels");
  assert.match(branch, /asset\.kind === "funnel"/, "the builder is fed the funnel assets");
  assert.ok(!/<MarketingFunnelBoard/.test(branch), "the Funnels tab is the builder, not the performance board");
});

// ── (c) The other tabs still render, unchanged ───────────────────────────────

test("the other five views still render as tabs", async () => {
  const bar = PAGE.slice(
    PAGE.indexOf("function MarketingWorkspaceNavigation"),
    PAGE.indexOf("</nav>", PAGE.indexOf("function MarketingWorkspaceNavigation")),
  );
  const rendered = [...bar.matchAll(/<MarketingTab href=\{marketingHref\("([a-z-]+)"/g)].map(match => match[1]);
  for (const view of ["pulse", "demand", "customers", "channels", "automations"]) {
    assert.ok(rendered.includes(view), `the ${view} tab must still render`);
  }
  const { MARKETING_TAB_VIEWS } = await views();
  assert.deepEqual(rendered, [...MARKETING_TAB_VIEWS], "the rendered bar matches the tab list exactly");
});

test("the four non-funnel views still resolve to themselves", async () => {
  const { resolveMarketingView } = await views();
  for (const view of ["pulse", "demand", "customers", "channels"] as const) {
    assert.equal(resolveMarketingView(view, undefined, undefined).view, view, `?view=${view} still opens ${view}`);
  }
});

// ── (d) No previously-legal ?view= value 404s (retirement map intact) ────────

test("every retired ?view= value still resolves — none 404s", async () => {
  const { resolveMarketingView, RETIRED_MARKETING_VIEWS } = await views();
  // The consolidation's non-negotiable: retired values keep resolving.
  for (const retired of Object.keys(RETIRED_MARKETING_VIEWS)) {
    const target = RETIRED_MARKETING_VIEWS[retired];
    const resolved = resolveMarketingView(retired, undefined, undefined);
    assert.equal(resolved.view, target.view, `?view=${retired} must land on ${target.view}`);
    if (target.channel) assert.equal(resolved.channel, target.channel, `?view=${retired} keeps its ${target.channel} channel`);
  }
  // funnels was retired-into-Channels before; it must NOT silently fall to the
  // default view now that it is its own tab — that would be a dead link.
  assert.notEqual(resolveMarketingView("funnels", undefined, undefined).view, "pulse", "?view=funnels must not degrade to the default view");
});

test("the Channels → Funnels channel path still resolves and still renders the builder", async () => {
  const { resolveMarketingView } = await views();
  const resolved = resolveMarketingView("channels", "funnels", undefined);
  assert.equal(resolved.view, "channels", "?view=channels&channel=funnels still opens Channels");
  assert.equal(resolved.channel, "funnels", "…on the funnels channel");
  // And the Channels branch still hosts the builder, so the old path is not a husk.
  const channelsBranch = PAGE.slice(PAGE.indexOf('view === "channels" ?'), PAGE.indexOf("const CHANNEL_TABS"));
  const funnelsChannel = channelsBranch.slice(
    channelsBranch.indexOf('channel === "funnels" ?'),
    channelsBranch.indexOf('channel === "google-business" ?'),
  );
  assert.match(funnelsChannel, /<FunnelsWorkspace/, "Channels → Funnels still renders the builder");
});
