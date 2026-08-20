import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * Marketing P6 — the second consolidation: ten views collapse to five, then the
 * funnel builder is restored as a first-class sixth tab.
 *
 *   Pulse · Demand · Funnels · Customers · Channels · Automations
 *
 * The 10 → 5 cut buried the funnel builder two levels deep inside Channels, so
 * from the founder seat it vanished. It is now its own top-level Funnels tab
 * (right after Demand), while the Channels → Funnels channel path still resolves
 * for old links. Client services is demoted to a header link. The rule from the
 * first cut holds: **no retired `?view=` value may die.** Ed has links, bookmarks
 * and docs pointing at the old tabs, and a dead link is worse than an extra tab.
 *
 * These tests fail against the pre-P6 behaviour: `?view=demand` did not exist,
 * `?view=sources` rendered its own view, and the bar carried ten tabs.
 */

const MARKETING_DIR = new URL("../src/app/portal/agency/marketing/", import.meta.url);
const PAGE = readFileSync(new URL("page.tsx", MARKETING_DIR), "utf8");

async function views() {
  return import("../src/app/portal/agency/marketing/_marketingViews");
}

/**
 * Every `?view=` value that ever shipped, and the exact place it must land now.
 * One row per retired view — this table IS the non-negotiable.
 */
const OLD_VIEW_LANDINGS: ReadonlyArray<{
  old: string;
  view: string;
  channel?: string;
  section?: string | null;
  why: string;
}> = [
  // ── retired by the second cut ──
  { old: "overview", view: "pulse", section: "pulse", why: "the dashboard's spine and counts moved on to Pulse" },
  { old: "radar", view: "pulse", section: "radar", why: "radar is a block inside Pulse" },
  { old: "campaigns", view: "demand", section: "campaigns", why: "campaigns is a block inside Demand" },
  { old: "sources", view: "demand", section: "sources", why: "lead sources is a block inside Demand" },
  { old: "funnels", view: "funnels", section: null, why: "the funnel builder is restored as its own top-level tab" },
  { old: "customer-profiles", view: "customers", why: "the view was renamed Customers" },
  // ── retired by the first cut, must STILL work ──
  { old: "social", view: "channels", channel: "social", why: "first-cut channel tab" },
  { old: "website", view: "channels", channel: "website", why: "first-cut channel tab" },
  { old: "google-ads", view: "channels", channel: "google-ads", why: "first-cut channel tab" },
  { old: "google-business", view: "channels", channel: "google-business", why: "first-cut channel tab" },
  { old: "reputation", view: "channels", channel: "reputation", why: "first-cut channel tab" },
  // ── kept, but pinned so a rename cannot silently orphan them ──
  { old: "pulse", view: "pulse", section: "pulse", why: "kept" },
  { old: "channels", view: "channels", channel: "social", why: "kept, defaulting to the first channel" },
  { old: "automations", view: "automations", section: null, why: "kept" },
  { old: "client-services", view: "client-services", section: null, why: "demoted to a header link, still addressable" },
];

for (const row of OLD_VIEW_LANDINGS) {
  test(`?view=${row.old} still lands somewhere sensible (${row.why})`, async () => {
    const { resolveMarketingView } = await views();
    const resolved = resolveMarketingView(row.old, undefined, undefined);
    assert.equal(resolved.view, row.view, `?view=${row.old} must open ${row.view}`);
    if (row.channel) assert.equal(resolved.channel, row.channel, `?view=${row.old} must select the ${row.channel} channel`);
    if (row.section !== undefined) assert.equal(resolved.section, row.section, `?view=${row.old} must open on the ${row.section} block`);
  });
}

test("no retired view is indistinguishable from a dead link", async () => {
  const { resolveMarketingView } = await views();
  // Junk resolves to the default view on its default block — so landing exactly
  // there is what a dead link looks like. Only `overview` and `pulse` may,
  // because that landing IS their content.
  const deadLink = resolveMarketingView("nonsense-not-a-view", undefined, undefined);
  for (const row of OLD_VIEW_LANDINGS) {
    if (row.old === "overview" || row.old === "pulse") continue;
    assert.notDeepEqual(
      resolveMarketingView(row.old, undefined, undefined),
      deadLink,
      `?view=${row.old} resolves exactly where junk does — it is a dead link`,
    );
  }
});

test("the retired block is rendered first, so the bookmark opens on what it asked for", async () => {
  const { resolveMarketingView, orderedMarketingSections } = await views();
  for (const [old, expected] of [["sources", "sources"], ["campaigns", "campaigns"], ["radar", "radar"], ["overview", "pulse"]] as const) {
    const { view, section } = resolveMarketingView(old, undefined, undefined);
    assert.equal(orderedMarketingSections(view, section)[0], expected, `?view=${old} must render the ${expected} block first`);
  }
  // and the other blocks are still there, just below it
  const demand = orderedMarketingSections("demand", "sources");
  assert.deepEqual([...demand].sort(), ["campaigns", "funnel", "sources"], "Demand keeps all three blocks whichever one is asked for");
});

test("junk still degrades to the default view, and a stray channel cannot hijack one", async () => {
  const { resolveMarketingView } = await views();
  assert.equal(resolveMarketingView(undefined, undefined, undefined).view, "pulse", "no ?view= opens Pulse");
  assert.equal(resolveMarketingView("nonsense", undefined, undefined).view, "pulse");
  assert.equal(resolveMarketingView("demand", "social", undefined).view, "demand", "a stray channel param does not drag you into Channels");
  assert.equal(resolveMarketingView("channels", "not-a-channel", undefined).channel, "social");
  assert.equal(resolveMarketingView("demand", undefined, "radar").section, "funnel", "a section from another view degrades to this view's first block");
});

test("resolving a retired link and re-linking it lands in the same place", async () => {
  const { resolveMarketingView, marketingHref, marketingSectionHref } = await views();
  for (const row of OLD_VIEW_LANDINGS) {
    const first = resolveMarketingView(row.old, undefined, undefined);
    const href = first.section
      ? marketingSectionHref(first.view, first.section, "all")
      : marketingHref(first.view, "all");
    const query = new URLSearchParams(href.split("?")[1]?.split("#")[0] ?? "");
    const again = resolveMarketingView(query.get("view") ?? undefined, first.channel, query.get("section") ?? undefined);
    assert.deepEqual(again, first, `the canonical link for ?view=${row.old} must resolve back to the same place`);
  }
});

// ── The bar itself ───────────────────────────────────────────────────────────

test("the tab bar carries exactly the six views, funnels right after demand", async () => {
  const { MARKETING_TAB_VIEWS } = await views();
  assert.deepEqual([...MARKETING_TAB_VIEWS], ["pulse", "demand", "funnels", "customers", "channels", "automations"]);
  // The bar in the page must BE that list — no drift, in either direction.
  const bar = PAGE.slice(PAGE.indexOf("function MarketingWorkspaceNavigation"));
  const rendered = [...bar.slice(0, bar.indexOf("</nav>")).matchAll(/<MarketingTab href=\{marketingHref\("([a-z-]+)"/g)].map(match => match[1]);
  assert.deepEqual(rendered, [...MARKETING_TAB_VIEWS], "the rendered bar and MARKETING_TAB_VIEWS have drifted apart");
  assert.ok(rendered.includes("funnels"), "the funnel builder has a first-class Funnels tab");
  for (const gone of ["radar", "campaigns", "customer-profiles", "sources", "client-services", "overview"]) {
    assert.ok(!rendered.includes(gone), `${gone} is no longer a top-level tab`);
  }
});

test("client services is a header link, and there is one KPI bank link", async () => {
  const header = PAGE.slice(PAGE.indexOf("Internal workspace"), PAGE.indexOf("</header>", PAGE.indexOf("Internal workspace")));
  assert.match(header, /marketingHref\("client-services", "all"\)/, "client services is reachable from the header");
  assert.match(header, /MARKETING_KPI_BANK_HREF/, "the KPI bank link sits in the header");
  assert.equal(
    (PAGE.match(/MARKETING_KPI_BANK_HREF/g) ?? []).length, 2,
    "one KPI bank constant, used once — not a marketing-scoped explorer per view",
  );
  assert.match(PAGE, /const MARKETING_KPI_BANK_HREF = "\/portal\/agency\/radar\?view=kpis/, "it points at the KPI bank");
});

test("the funnel builder moved into Channels and the funnel board into Demand", async () => {
  const { MARKETING_CHANNELS, MARKETING_VIEW_SECTIONS } = await views();
  assert.ok(MARKETING_CHANNELS.includes("funnels"), "funnels is a channel now");
  assert.ok((MARKETING_VIEW_SECTIONS.demand ?? []).includes("funnel"), "the live funnel is a Demand block");
  const channelsBranch = PAGE.slice(PAGE.indexOf('view === "channels" ?'), PAGE.indexOf("const CHANNEL_TABS"));
  const funnelsChannel = channelsBranch.slice(channelsBranch.indexOf('channel === "funnels" ?'), channelsBranch.indexOf('channel === "google-business" ?'));
  assert.match(funnelsChannel, /<FunnelsWorkspace/, "the builder renders inside Channels");
  const demandBlocks = PAGE.slice(PAGE.indexOf("const sectionBlocks"), PAGE.indexOf("  return (\n    <div className=\"mx-auto flex w-full max-w-7xl"));
  assert.match(demandBlocks, /funnel: model \? <MarketingFunnelBoard/, "the board renders inside Demand");
  assert.ok(!/<MarketingFunnelBoard/.test(channelsBranch), "the board is not duplicated into Channels");
});

test("Channels still costs no radar build, and Demand pays for one", async () => {
  // The gate that keeps a channel tab cheap. Widening it to every view would be
  // an easy, invisible regression.
  assert.match(PAGE, /const modelViews = view === "pulse" \|\| view === "demand";/);
  assert.match(PAGE, /const spineViews = view === "customers";/);
});

// ── Nothing anywhere links at a view that no longer resolves ─────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

test("every /portal/agency/marketing?view= link in the codebase still resolves", async () => {
  const { resolveMarketingView, RETIRED_MARKETING_VIEWS, isMarketingView } = await views();
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const found = new Map<string, string>();
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/portal\/agency\/marketing\?view=([a-z-]+)/g)) {
      if (!found.has(match[1])) found.set(match[1], file.slice(root.length));
    }
  }
  assert.ok(found.size >= 5, `expected to find marketing view links to check, found ${found.size}`);
  for (const [value, file] of found) {
    const known = isMarketingView(value) || Object.prototype.hasOwnProperty.call(RETIRED_MARKETING_VIEWS, value);
    assert.ok(known, `${file} links to ?view=${value}, which no longer resolves — it would land on the default view`);
    assert.ok(resolveMarketingView(value, undefined, undefined).view, `?view=${value} (from ${file}) must resolve`);
  }
});
