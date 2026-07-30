import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildPerformanceAnalytics, performanceMetricValue } from "../src/lib/performanceAnalytics";

test("performance analytics joins views, forms, search and experiments", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  const events = [
    { type: "pageview", occurredAt: now - 1_000, path: "/", sessionId: "one", referrer: "https://google.com/" },
    { type: "pageview", occurredAt: now - 2_000, path: "/services", sessionId: "one", referrer: "https://google.com/" },
    { type: "pageview", occurredAt: now - 3_000, path: "/services", sessionId: "two" },
    { type: "form", occurredAt: now - 500, path: "/services", formName: "Contact", sessionId: "two", experimentId: "exp_one", variant: "a" },
    { type: "interaction", occurredAt: now - 4_000, metric: "experiment-view", sessionId: "two", experimentId: "exp_one", variant: "a" },
    { type: "search", occurredAt: now - 5_000, query: "web design derby", impressions: 100, clicks: 8, position: 3.5 },
  ];
  const result = buildPerformanceAnalytics(events, 28, now);
  assert.equal(result.current.views, 3);
  assert.equal(result.current.visitors, 2);
  assert.equal(result.current.conversions, 1);
  assert.equal(result.current.conversionRate, 33.33);
  assert.deepEqual(result.queries[0], { query: "web design derby", impressions: 100, clicks: 8, ctr: 8, position: 3.5 });
  assert.equal(result.pages.find(page => page.path === "/services")?.conversions, 1);
  assert.equal(result.variants[0]?.conversionRate, 100);
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
  const tag = readFileSync("src/app/milesy-tag.js/route.ts", "utf8");
  const api = readFileSync("src/app/api/portal/performance/experiments/route.ts", "utf8");
  assert.match(workspace, /Visibility and conversions/);
  assert.match(workspace, /ExperimentsPanel/);
  assert.match(customer, /Your results/);
  assert.match(tag, /document\.addEventListener\("submit"/);
  assert.match(tag, /data-milesymedia-conversion/);
  assert.match(api, /createPerformanceExperiment/);
});
