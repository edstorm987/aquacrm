import assert from "node:assert/strict";
import test from "node:test";

import { buildPerformanceAnalyticsForRange } from "../src/lib/performance/performanceAnalytics";
import { cleanMonthlyPerformanceReports, reportHighlights, reportMonthRange, reportNextSteps } from "../src/lib/performance/performanceReports";

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
  assert.deepEqual(cleanMonthlyPerformanceReports([null, { id: "broken" }, valid]), [valid]);
});
