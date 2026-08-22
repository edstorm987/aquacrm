// Surfaces that used to state something the system did not know.
//
// Finding 2026-08-22 "four surfaces state something untrue". Grouped there, and
// grouped here, because they are one habit rather than four bugs: **a value
// that was never measured rendered as if it had been.**
//
//   1. Marketing printed "Views today: 0" beside "Tag: Waiting".
//   2. Two marketing panels told a real founder they were "in a demo session"
//      when the enquiry read had merely failed.
//   3. Reports clamped a tax RECLAIM to £0.00 with `Math.max(0, …)`.
//   4. Overview pinned every total to `invoices[0]?.currency`, so one stray USD
//      invoice sorting first hid all the GBP money with no indicator.
//
// …plus the Deposits page (finding 1c), which printed bare `(cents/100)
// .toFixed(2)` with no currency at all and a raw `cli_…` id where the client's
// name belongs.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.PORTAL_BACKEND ??= "memory";

// The marketing panels import `next/link`, which reaches for
// `React.createContext` — absent from the react-server build this suite runs
// under. The panels never render a Link in the states under test, so a stub is
// enough to let the module graph load. (Same trick as smoke-dev-team-gates.)
import * as React from "react";
const reactShim = React as unknown as { createContext?: unknown; default?: { createContext?: unknown } };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
reactShim.createContext ??= stubContext;
if (reactShim.default) reactShim.default.createContext ??= stubContext;

import { measuredCount, measuredCountLabel, UNMEASURED } from "../src/lib/performance/telemetryDisplay";
import { taxPosition } from "../src/built-ins/modules/agency-finance/src/lib/taxPosition";
import { formatMoney } from "../src/built-ins/modules/agency-finance/src/lib/currencies";
import { resolveFinanceDefaultCurrency } from "../src/lib/server/finance/financeCurrency";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { upsertInstall } from "../src/server/pluginInstalls";

// DYNAMIC on purpose: `import` declarations hoist above the shim above, so a
// static import of the panels would pull `next/link` in before `createContext`
// exists. Loaded inside the tests instead.
async function marketingPanels() {
  return import("../src/app/portal/agency/marketing/_MarketingCommandSurfaces");
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** Source with comments stripped — a file that explains what it no longer does
 *  by NAMING it would otherwise match its own warning. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Rendered text of a React tree, without react-dom/server (which does not
 * resolve under `--conditions react-server`). Function components are invoked
 * for real; one that needs a client runtime is skipped rather than failing the
 * walk, so the copy under test is still reachable.
 */
async function textOf(node: unknown): Promise<string> {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return (await Promise.all(node.map(textOf))).join(" ");
  if (typeof node === "object" && typeof (node as { then?: unknown }).then === "function") {
    return textOf(await (node as Promise<unknown>));
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (!("type" in element)) return "";
  if (typeof element.type === "function") {
    try {
      return await textOf((element.type as (props: unknown) => unknown)(element.props ?? {}));
    } catch {
      return "";
    }
  }
  return textOf(element.props?.children);
}

// ─── 1. Unmeasured is "—", never 0 ────────────────────────────────────────

describe("a count nobody reported is not a measurement", () => {
  it("measuredCount / measuredCountLabel withhold the number until something reports", () => {
    assert.equal(measuredCount(0, null), null);
    assert.equal(measuredCount(0, undefined), null);
    assert.equal(measuredCountLabel(0, null), UNMEASURED);
    assert.equal(measuredCountLabel(41, null), UNMEASURED, "a stale count with no watermark is still unmeasured");
    // A tag that HAS reported may legitimately have counted zero today.
    assert.equal(measuredCountLabel(0, 1_700_000_000_000), "0");
    assert.equal(measuredCountLabel(1234, 1_700_000_000_000), (1234).toLocaleString());
  });

  it("the marketing website tile no longer prints a raw pageview count", () => {
    const page = code(read("src/app/portal/agency/marketing/page.tsx"));
    assert.ok(
      !page.includes("String(ownWebsiteSummary.pageviews24h)"),
      'marketing page.tsx renders a measured-looking "0" beside "Tag: Waiting" again',
    );
    assert.ok(
      page.includes("measuredCountLabel(ownWebsiteSummary.pageviews24h, ownWebsite.telemetryLastSeenAt)"),
      "the Views today tile must be gated on the telemetry watermark",
    );
  });

  it("the two sibling surfaces with the same tile were fixed too", () => {
    const website = code(read("src/app/portal/agency/development/website/_WebsiteWorkspace.tsx"));
    assert.ok(!website.includes("String(summary.pageviews24h)"));
    assert.ok(website.includes("measuredCountLabel(summary.pageviews24h, summary.lastSeenAt)"));

    const performance = code(read("src/app/portal/agency/performance/_PerformanceWorkspace.tsx"));
    assert.ok(!performance.includes("String(client.pageviews24h)"));
    assert.ok(!performance.includes("String(property.pageviews24h)"));
  });

  it("AND THE THIRD ONE — the client workspace's own monitoring tiles", () => {
    // Found by the regression verifier after this finding was closed: a third
    // sibling was rendering `summary.pageviews24h` raw, three lines under its
    // own "Waiting for first signal" banner. Same panel, same watermark, same
    // gate. Average load already told the truth (it is `undefined` until
    // something reports) and deployments come from the deployment feed rather
    // than the tag, so those two are deliberately not gated.
    const workspace = code(read("src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx"));
    assert.ok(
      !/value=\{summary\.pageviews24h\}/.test(workspace),
      "the client systems view prints a measured-looking 0 under 'Waiting for first signal' again",
    );
    assert.ok(!/value=\{summary\.errors24h\}/.test(workspace));
    assert.ok(workspace.includes("measuredCountLabel(summary.pageviews24h, telemetry?.lastSeenAt)"));
    assert.ok(workspace.includes("measuredCountLabel(summary.errors24h, telemetry?.lastSeenAt)"));
    assert.ok(workspace.includes('measuredCountLabel } from "@/lib/performance/telemetryDisplay"'));
  });

  it("EVERY surface that renders a telemetry count is now gated — counted, not spot-checked", () => {
    // The reason a third one survived two passes: each fix was applied to the
    // files the finding NAMED. This asserts the class instead — no file may
    // render a raw `pageviews24h` / `errors24h` into a value slot.
    const surfaces = [
      "src/app/portal/agency/marketing/page.tsx",
      "src/app/portal/agency/development/website/_WebsiteWorkspace.tsx",
      "src/app/portal/agency/performance/_PerformanceWorkspace.tsx",
      "src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx",
    ];
    for (const file of surfaces) {
      const source = code(read(file));
      assert.equal(
        /(?:String\(|value=\{)\s*\w+(?:\?)?\.(?:pageviews24h|errors24h)\s*[)}]/.test(source),
        false,
        `${file} renders an ungated telemetry count`,
      );
    }
  });
});

// ─── 2. "Not read" is not "a demo session" ────────────────────────────────

describe("an enquiry read that failed is not reported as a demo session", () => {
  // `available: false` means only "the caller did not read them" — a demo
  // session OR a failed live read. This fixture is the FAILED-READ case, which
  // is what a production Supabase outage looks like to a real founder.
  const spine = {
    enquiries: {
      available: false,
      scopedToCompanyId: null,
      unroutedEnquiries: 0,
      total: 0, last7d: 0, last30d: 0,
      attributed: 0, unattributed: 0,
      attributionPercent: null,
      bySource: [], byCampaign: [], byDay: [],
    },
  };

  const attribution = { available: false, campaigns: [], unattributed: 0, gaps: [] };

  it("the audience-evidence panel says the read did not happen, not why it did not", async () => {
    const { MarketingAudienceEvidencePanel } = await marketingPanels();
    const text = await textOf(MarketingAudienceEvidencePanel({ spine } as never));
    assert.ok(text.includes("not read in this session"), `unexpected copy: ${text}`);
    assert.ok(
      !/are not read in a demo session/.test(text),
      "a real founder in a Supabase outage is still being told they are in a demo",
    );
  });

  it("the campaign-attribution panel does the same", async () => {
    const { MarketingCampaignAttributionPanel } = await marketingPanels();
    const text = await textOf(MarketingCampaignAttributionPanel({ attribution } as never));
    assert.ok(text.includes("not read in this session"), `unexpected copy: ${text}`);
    assert.ok(!/are not read in a demo session/.test(text));
  });

  it("no marketing surface still asserts the demo cause as fact", () => {
    const files = [
      "src/app/portal/agency/marketing/page.tsx",
      "src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx",
    ];
    for (const file of files) {
      const source = code(read(file));
      assert.ok(
        !/(are|is) not read in a demo session/.test(source),
        `${file} still states the demo cause for a flag that only means "not read"`,
      );
    }
  });
});

// ─── 3. A reclaim is not £0.00 ────────────────────────────────────────────

describe("the tax balance points in the direction it actually points", () => {
  it("recoverable tax above tax charged is a reclaim, not zero", () => {
    const reclaim = taxPosition(1_000, 4_500);
    assert.equal(reclaim.netCents, -3_500);
    assert.equal(reclaim.displayCents, 3_500, "the reclaim used to be clamped to 0");
    assert.equal(reclaim.direction, "reclaim");
    assert.equal(reclaim.label, "Tax to reclaim");
    assert.equal(reclaim.recordedLabel, "Recorded tax to reclaim");
    assert.notEqual(formatMoney(reclaim.displayCents, "gbp"), "£0.00");
  });

  it("the ordinary direction is unchanged", () => {
    const owed = taxPosition(9_000, 2_000);
    assert.equal(owed.displayCents, 7_000);
    assert.equal(owed.label, "Tax balance");
    assert.equal(taxPosition(500, 500).direction, "level");
  });

  it("ReportsPage no longer clamps", () => {
    const source = code(read("src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx"));
    assert.ok(
      !source.includes("Math.max(0, outputTax - inputTax)"),
      "the clamp is back — a reclaim renders as £0.00 again",
    );
    assert.ok(source.includes("taxPosition(outputTax, inputTax)"));
  });

  it("NOR DOES OVERVIEW — the finding named it and the first fix missed it", () => {
    // The finding file said "fixed". A regression verifier then found the
    // clamp still live on the screen people actually look at:
    // `FounderDashboardPage.tsx:253`, `Math.max(0, outputTaxCents -
    // inputTaxCents)`. Reports and Overview render the same number from the
    // same two inputs; only one of them was changed. Both are pinned now, in
    // the same test file, so "fixed on Reports" can never again be reported as
    // "fixed".
    const source = code(read("src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx"));
    assert.ok(
      !/Math\.max\(0, outputTaxCents - inputTaxCents\)/.test(source),
      "Overview clamps a tax reclaim to £0.00 again",
    );
    assert.ok(source.includes("taxPosition(outputTaxCents, inputTaxCents)"));
    // …and the LABEL moves with the direction, so a refund is not headed
    // "balance". Same helper, so it cannot say something Reports would not.
    assert.ok(source.includes("tax.recordedLabel"));
    assert.ok(source.includes("money(tax.displayCents, currency)"));
  });

  it("no finance surface reintroduces the clamp under another name", () => {
    // Cheap, and it is the check that would have caught the miss: both files
    // at once, by shape rather than by exact text.
    for (const file of ["ReportsPage.tsx", "FounderDashboardPage.tsx"]) {
      const source = code(read("src/built-ins/modules/agency-finance/src/pages", file));
      assert.equal(
        /Math\.max\(\s*0\s*,\s*\w*[Oo]utputTax\w*\s*-\s*\w*[Ii]nputTax\w*\s*\)/.test(source),
        false,
        `${file} clamps the tax position again`,
      );
    }
  });
});

// ─── 4. Totals follow the configured currency ─────────────────────────────

describe("Overview aggregates on the configured default, not on whatever sorted first", () => {
  it("FounderDashboardPage no longer guesses from invoices[0]", () => {
    const source = code(read("src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx"));
    assert.ok(
      !source.includes("invoices[0]?.currency"),
      "one stray USD invoice sorting first can flip the whole dashboard again",
    );
    assert.ok(source.includes("resolveFinanceDefaultCurrency(props.agencyId, props.install.config.defaultCurrency)"));
  });

  it("resolveFinanceDefaultCurrency answers the configured value, whatever the records say", async () => {
    await ensureHydrated();
    const agency = createAgency({ name: "Currency Co", slug: `currency-co-${Date.now()}` });
    upsertInstall({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      enabled: true,
      config: { defaultCurrency: "gbp", ukDefaultCurrencyV1: true },
      features: {},
    });
    assert.equal(resolveFinanceDefaultCurrency(agency.id, "gbp"), "gbp");
    // Reports/Operations/Settings already resolve it this way; Overview does now.
    for (const page of ["ReportsPage", "SettingsPage", "FounderDashboardPage"]) {
      const source = read(`src/built-ins/modules/agency-finance/src/pages/${page}.tsx`);
      assert.ok(source.includes("resolveFinanceDefaultCurrency"), `${page} does not resolve the default currency`);
    }
  });
});

// ─── 5. The Deposits page ─────────────────────────────────────────────────

describe("Deposits states money as money and clients by name", () => {
  it("no bare toFixed(2), and the raw client id is not the client column", () => {
    const source = code(read("src/built-ins/modules/agency-finance/src/pages/LockInPage.tsx"));
    assert.ok(!/\/ 100\)\.toFixed\(2\)/.test(source), "money is being printed with no currency again");
    assert.ok(source.includes("formatMoney("), "Deposits must use the same Intl formatting as every other finance surface");
    assert.ok(source.includes("clientName.get(r.clientId)"), "the client column must resolve a display name");
  });

  it("formatMoney carries the currency the plan was priced in", () => {
    assert.equal(formatMoney(125_00, "gbp"), "£125.00");
    assert.equal(formatMoney(125_00, "usd"), "US$125.00");
    assert.notEqual(formatMoney(125_00, "gbp"), (125_00 / 100).toFixed(2));
  });
});
