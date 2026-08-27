import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPerformanceAnalyticsForRange } from "../src/lib/performance/performanceAnalytics";
import {
  cleanMonthlyPerformanceReports,
  createMonthlyPerformanceReportDraft,
  deleteMonthlyPerformanceReportDraft,
  publishMonthlyPerformanceReport,
  reportHighlights,
  reportMonthRange,
  reportNextSteps,
  withdrawMonthlyPerformanceReport,
} from "../src/lib/performance/performanceReports";

test("monthly report helpers produce factual client copy", () => {
  const range = reportMonthRange("2026-07");
  assert.equal(range.label, "July 2026");
  const analytics = buildPerformanceAnalyticsForRange([
    { type: "pageview", occurredAt: range.start + 1_000, path: "/", sessionId: "one" },
    { type: "pageview", occurredAt: range.start + 2_000, path: "/contact", sessionId: "one" },
    { type: "form", occurredAt: range.start + 3_000, path: "/contact", formName: "Contact" },
    { type: "search", occurredAt: range.start + 4_000, path: "/", query: "example", impressions: 50, clicks: 5, position: 4 },
  ], range.start, range.end);
  assert.match(reportHighlights(analytics).join(" "), /2 pages/);
  assert.match(reportHighlights(analytics).join(" "), /Google Search/);
  assert.ok(reportNextSteps(analytics).length > 0);
});

test("only complete report records survive cleaning", () => {
  const analytics = buildPerformanceAnalyticsForRange([], 1, 2);
  const valid = { id: "rpt_one", clientId: "client_one", month: "2026-07", label: "July 2026", status: "published", generatedAt: 1, analytics, highlights: [], nextSteps: [] };
  assert.deepEqual(cleanMonthlyPerformanceReports([null, { id: "broken" }, valid]), [{ ...valid, revision: 1 }]);
});

test("published report snapshots survive regeneration, supersession and withdrawal", () => {
  const firstAnalytics = buildPerformanceAnalyticsForRange([{ type: "pageview", occurredAt: 1, path: "/first" }], 1, 2);
  const secondAnalytics = buildPerformanceAnalyticsForRange([{ type: "pageview", occurredAt: 2, path: "/second" }], 1, 3);
  const firstDraft = createMonthlyPerformanceReportDraft([], {
    id: "rpt_first",
    clientId: "client_one",
    month: "2026-07",
    label: "July 2026",
    generatedAt: 10,
    analytics: firstAnalytics,
    highlights: ["first"],
    nextSteps: [],
  });
  const firstPublished = publishMonthlyPerformanceReport(firstDraft.reports, firstDraft.report.id, "owner", 20);
  const secondDraft = createMonthlyPerformanceReportDraft(firstPublished.reports, {
    id: "rpt_second",
    clientId: "client_one",
    month: "2026-07",
    label: "July 2026",
    generatedAt: 30,
    analytics: secondAnalytics,
    highlights: ["second"],
    nextSteps: [],
  });

  assert.equal(secondDraft.report.revision, 2);
  assert.equal(secondDraft.reports.find(report => report.id === "rpt_first")?.status, "published");
  assert.deepEqual(secondDraft.reports.find(report => report.id === "rpt_first")?.analytics, firstAnalytics);

  const secondPublished = publishMonthlyPerformanceReport(secondDraft.reports, "rpt_second", "manager", 40);
  const retainedFirst = secondPublished.reports.find(report => report.id === "rpt_first");
  assert.equal(retainedFirst?.status, "superseded");
  assert.equal(retainedFirst?.supersededByReportId, "rpt_second");
  assert.deepEqual(retainedFirst?.analytics, firstAnalytics);
  assert.equal(secondPublished.report.supersedesReportId, "rpt_first");
  assert.throws(() => deleteMonthlyPerformanceReportDraft(secondPublished.reports, "rpt_first"), /history cannot be deleted/);

  const withdrawn = withdrawMonthlyPerformanceReport(secondPublished.reports, "rpt_second", "owner", "Incorrect source range", 50);
  assert.equal(withdrawn.report.status, "withdrawn");
  assert.equal(withdrawn.report.withdrawalReason, "Incorrect source range");
  assert.equal(withdrawn.reports.length, 2);

  const thirdDraft = createMonthlyPerformanceReportDraft(withdrawn.reports, {
    id: "rpt_third",
    clientId: "client_one",
    month: "2026-07",
    label: "July 2026",
    generatedAt: 60,
    analytics: secondAnalytics,
    highlights: [],
    nextSteps: [],
  });
  assert.equal(thirdDraft.report.revision, 3);
  assert.equal(deleteMonthlyPerformanceReportDraft(thirdDraft.reports, "rpt_third").reports.length, 2);
});

test("report API coordinates the whole metadata ledger and exposes audited withdrawal", () => {
  const route = readFileSync("src/app/api/portal/performance/reports/route.ts", "utf8");
  assert.match(route, /withClientMetadataLedgerTransaction/);
  assert.match(route, /ledger: "performance-reports"/);
  assert.match(route, /withdrawalReason/);
  assert.match(route, /supersedesReportId/);
  assert.match(route, /isReportAction/);
  assert.doesNotMatch(route, /reports\.find\(item => item\.month.*\?\.id/);
});
