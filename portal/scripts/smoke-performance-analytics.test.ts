import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildPerformanceAnalytics, buildPerformanceAnalyticsForRange, performanceMetricValue } from "../src/lib/performance/performanceAnalytics";

test("performance analytics joins views, forms, search and experiments", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  const events = [
    { type: "pageview", occurredAt: now - 1_000, path: "/", sessionId: "one", referrer: "https://google.com/" },
    { type: "pageview", occurredAt: now - 2_000, path: "/services", sessionId: "one", referrer: "https://google.com/" },
    { type: "pageview", occurredAt: now - 3_000, path: "/services", sessionId: "two" },
    { type: "form", occurredAt: now - 500, path: "/services", formName: "Contact", sessionId: "two", experimentId: "exp_one", variant: "a" },
    { type: "interaction", occurredAt: now - 4_000, metric: "experiment-view", sessionId: "two", experimentId: "exp_one", variant: "a" },
    { type: "search", occurredAt: now - 5_000, path: "/services", query: "web design derby", impressions: 100, clicks: 8, position: 3.5 },
  ];
  const result = buildPerformanceAnalytics(events, 28, now);
  assert.equal(result.current.views, 3);
  assert.equal(result.current.visitors, 2);
  assert.equal(result.current.conversions, 1);
  assert.equal(result.current.conversionRate, 33.33);
  assert.deepEqual(result.queries[0], { query: "web design derby", impressions: 100, clicks: 8, ctr: 8, position: 3.5 });
  assert.deepEqual(result.searchPages[0], { path: "/services", impressions: 100, clicks: 8, ctr: 8, position: 3.5 });
  assert.equal(result.pages.find(page => page.path === "/services")?.conversions, 1);
  assert.equal(result.variants[0]?.conversionRate, 100);
});

test("calendar reports include only the requested month", () => {
  const june = Date.parse("2026-06-15T12:00:00Z");
  const july = Date.parse("2026-07-15T12:00:00Z");
  const result = buildPerformanceAnalyticsForRange([
    { type: "pageview", occurredAt: june, path: "/june" },
    { type: "pageview", occurredAt: july, path: "/july" },
    { type: "form", occurredAt: july, formName: "Project enquiry" },
  ], Date.parse("2026-07-01T00:00:00Z"), Date.parse("2026-07-31T23:59:59Z"));
  assert.equal(result.current.views, 1);
  assert.equal(result.current.conversions, 1);
  assert.equal(result.pages.some(page => page.path === "/june"), false);
});

test("performance milestones use the same metric definitions", () => {
  const events = [
    { type: "pageview", occurredAt: 1, sessionId: "one" },
    { type: "pageview", occurredAt: 2, sessionId: "one" },
    { type: "conversion", occurredAt: 3 },
    { type: "search", occurredAt: 4, clicks: 12 },
  ];
  assert.equal(performanceMetricValue(events, "pageviews"), 2);
  assert.equal(performanceMetricValue(events, "visitors"), 1);
  assert.equal(performanceMetricValue(events, "conversions"), 1);
  assert.equal(performanceMetricValue(events, "search-clicks"), 12);
});

test("performance workspace exposes agency, customer, experiments and automated tag capture", () => {
  const workspace = readFileSync("src/app/portal/agency/performance/_PerformanceWorkspace.tsx", "utf8");
  const customer = readFileSync("src/app/portal/customer/_CustomerPortalViews.tsx", "utf8");
  const portalDesign = readFileSync("src/lib/portal/clientPortalDesign.ts", "utf8");
  const tag = readFileSync("src/lib/integrations/aquaTagSource.ts", "utf8");
  const api = readFileSync("src/app/api/portal/performance/experiments/route.ts", "utf8");
  const dashboard = readFileSync("src/app/portal/agency/performance/_AquaTagDashboard.tsx", "utf8");
  const reports = readFileSync("src/app/api/portal/performance/reports/route.ts", "utf8");
  assert.match(workspace, /Visibility and conversions/);
  assert.match(workspace, /ExperimentsPanel/);
  assert.match(customer, /pageContent\(data, "results"/);
  assert.match(portalDesign, /Your results/);
  assert.match(tag, /document\.addEventListener\("submit"/);
  assert.match(tag, /data-aqua-conversion/);
  assert.match(api, /createPerformanceExperiment/);
  assert.match(dashboard, /Google Search Console/);
  assert.match(dashboard, /Monthly client reports/);
  assert.match(reports, /monthlyPerformanceReports/);
});
