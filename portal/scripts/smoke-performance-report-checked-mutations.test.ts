import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import {
  CheckedMutationError,
  checkedJsonMutation,
} from "../src/lib/client/checkedMutation";
import {
  isReportMutationPayload,
  isValidPerformanceReportMonth,
  normalizeReportWithdrawalReason,
  type ExpectedReportMutation,
  type ReportMutationPayload,
} from "../src/lib/client/performanceReportMutationPayload";
import { buildPerformanceAnalyticsForRange } from "../src/lib/performance/performanceAnalytics";
import type { MonthlyPerformanceReport } from "../src/lib/performance/performanceReports";
import { withSession } from "./dev-console-request-scope";

function report(overrides: Partial<MonthlyPerformanceReport> = {}): MonthlyPerformanceReport {
  return {
    id: "report_one",
    clientId: "client_one",
    month: "2026-08",
    label: "August 2026",
    status: "draft",
    revision: 1,
    generatedAt: 1_725_000_000_000,
    analytics: buildPerformanceAnalyticsForRange([
      { type: "pageview", occurredAt: 1_725_000_000_001, path: "/", sessionId: "visitor_one" },
      { type: "form", occurredAt: 1_725_000_000_002, path: "/contact", formName: "Contact" },
    ], 1_725_000_000_000, 1_725_086_399_999),
    highlights: ["One useful result."],
    nextSteps: ["Keep measuring."],
    ...overrides,
  };
}

function expected(overrides: Partial<ExpectedReportMutation> = {}): ExpectedReportMutation {
  return {
    action: "generate",
    clientId: "client_one",
    month: "2026-08",
    ...overrides,
  };
}

function response(body: unknown, status = 200): typeof fetch {
  return async () => Response.json(body, { status });
}

function between(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0, `missing start marker: ${start}`);
  assert.ok(endAt > startAt, `missing end marker: ${end}`);
  return source.slice(startAt, endAt);
}

describe("monthly Performance report mutation receipts", () => {
  it("validates report months and normalizes withdrawal reasons at the client boundary", () => {
    assert.equal(isValidPerformanceReportMonth("2026-08", "2026-08"), true);
    assert.equal(isValidPerformanceReportMonth("", "2026-08"), false);
    assert.equal(isValidPerformanceReportMonth("2026-13", "2026-08"), false);
    assert.equal(isValidPerformanceReportMonth("2026-09", "2026-08"), false);

    const requestedReason = `  ${"x".repeat(501)}  `;
    const normalizedReason = normalizeReportWithdrawalReason(requestedReason);
    assert.equal(normalizedReason.length, 500);
    assert.equal(normalizedReason, "x".repeat(500));
    assert.equal(normalizeReportWithdrawalReason("   "), "");

    const withdrawn = report({
      status: "withdrawn",
      withdrawnAt: 3,
      withdrawnBy: "owner",
      withdrawalReason: normalizedReason,
    });
    assert.equal(isReportMutationPayload(
      { ok: true, report: withdrawn, reports: [withdrawn] },
      expected({ action: "withdraw", reportId: withdrawn.id, withdrawalReason: requestedReason }),
    ), true);

    const overlongReceipt = { ...withdrawn, withdrawalReason: "x".repeat(501) };
    assert.equal(isReportMutationPayload(
      { ok: true, report: overlongReceipt, reports: [overlongReceipt] },
      expected({ action: "withdraw", reportId: withdrawn.id, withdrawalReason: requestedReason }),
    ), false);
  });

  it("binds generate to the requested client, month, property, draft status and authoritative inclusion", () => {
    const generated = report({ propertyId: "property_one" });
    assert.equal(isReportMutationPayload(
      { ok: true, report: generated, reports: [generated] },
      expected({ propertyId: "property_one" }),
    ), true);

    const allProperties = report({ id: "report_all" });
    assert.equal(isReportMutationPayload(
      { ok: true, report: allProperties, reports: [allProperties] },
      expected(),
    ), true);
    assert.equal(isReportMutationPayload(
      { ok: true, report: generated, reports: [generated] },
      expected({ month: "2026-07", propertyId: "property_one" }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: generated, reports: [generated] },
      expected({ propertyId: "property_two" }),
    ), false);
  });

  it("binds publish and withdraw to the exact report identity, expected status and authoritative inclusion", () => {
    const published = report({ status: "published", publishedAt: 2, publishedBy: "owner" });
    const withdrawn = report({
      id: "report_two",
      status: "withdrawn",
      publishedAt: 2,
      publishedBy: "owner",
      withdrawnAt: 3,
      withdrawnBy: "owner",
      withdrawalReason: "Wrong range",
    });

    assert.equal(isReportMutationPayload(
      { ok: true, report: published, reports: [published] },
      expected({ action: "publish", reportId: published.id }),
    ), true);
    assert.equal(isReportMutationPayload(
      { ok: true, report: withdrawn, reports: [withdrawn] },
      expected({ action: "withdraw", reportId: withdrawn.id, withdrawalReason: "Wrong range" }),
    ), true);
    assert.equal(isReportMutationPayload(
      { ok: true, report: published, reports: [published] },
      expected({ action: "publish", reportId: "another_report" }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: withdrawn, reports: [withdrawn] },
      expected({ action: "withdraw", reportId: "another_report", withdrawalReason: "Wrong range" }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: report(), reports: [report()] },
      expected({ action: "publish", reportId: "report_one" }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: published, reports: [published] },
      expected({ action: "withdraw", reportId: "report_one", withdrawalReason: "Wrong range" }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: withdrawn, reports: [withdrawn] },
      expected({ action: "withdraw", reportId: withdrawn.id, withdrawalReason: "A different reason" }),
    ), false);
  });

  it("binds delete to the exact draft identity and authoritative exclusion", () => {
    const deleted = report();
    const retained = report({ id: "report_two", status: "published" });
    assert.equal(isReportMutationPayload(
      { ok: true, report: deleted, reports: [retained] },
      expected({ action: "delete", reportId: deleted.id }),
    ), true);
    assert.equal(isReportMutationPayload(
      { ok: true, report: deleted, reports: [retained] },
      expected({ action: "delete", reportId: "another_report" }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: { ...deleted, status: "published" }, reports: [retained] },
      expected({ action: "delete", reportId: deleted.id }),
    ), false);
    assert.equal(isReportMutationPayload(
      { ok: true, report: deleted, reports: [deleted, retained] },
      expected({ action: "delete", reportId: deleted.id }),
    ), false);
  });

  it("rejects malformed reports, wrong-client receipts and malformed or non-authoritative collections", () => {
    const generated = report();
    const otherClient = report({ id: "report_two", clientId: "client_two" });
    const changedReceipt = report({ highlights: ["Changed after the receipt was made."] });

    for (const payload of [
      null,
      [],
      { ok: false, report: generated, reports: [generated] },
      { ok: true, reports: [generated] },
      { ok: true, report: "report_one", reports: [generated] },
      { ok: true, report: { ...generated, revision: 0 }, reports: [generated] },
      { ok: true, report: { ...generated, analytics: { ...generated.analytics, current: null } }, reports: [generated] },
      { ok: true, report: generated },
      { ok: true, report: generated, reports: "report_one" },
      { ok: true, report: generated, reports: [{ id: "broken" }] },
      { ok: true, report: generated, reports: [generated, generated] },
      { ok: true, report: generated, reports: [] },
      { ok: true, report: generated, reports: [changedReceipt] },
      { ok: true, report: generated, reports: [generated, otherClient] },
    ]) {
      assert.equal(isReportMutationPayload(payload, expected()), false);
    }

    assert.equal(isReportMutationPayload(
      { ok: true, report: otherClient, reports: [otherClient] },
      expected(),
    ), false);
  });
});

describe("checked monthly report mutation boundary", () => {
  it("returns a fully validated success receipt", async () => {
    const generated = report();
    const payload = { ok: true as const, report: generated, reports: [generated] };
    const result = await checkedJsonMutation<ReportMutationPayload>(
      "/api/portal/performance/reports",
      { method: "POST" },
      {
        fallback: "The report draft could not be generated.",
        fetcher: response(payload),
        validate: value => isReportMutationPayload(value, expected()),
      },
    );
    assert.equal(isReportMutationPayload(result, expected()), true);
    assert.equal(result.report.id, payload.report.id);
  });

  it("rejects transport, unreadable and malformed responses", async () => {
    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be updated.",
        fetcher: async () => { throw new TypeError("private socket detail"); },
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "transport"
        && error.message === "The report could not be updated. Check your connection and try again.",
    );

    const unreadable = new Response("ignored", { status: 200 });
    unreadable.text = async () => { throw new Error("private stream detail"); };
    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be updated.",
        fetcher: async () => unreadable,
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "response"
        && /could not be read/i.test(error.message),
    );

    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be updated.",
        fetcher: async () => new Response("<html>gateway</html>", { status: 200 }),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "response"
        && /unreadable response/i.test(error.message),
    );
  });

  it("rejects 4xx, opaque 5xx, ok:false and structurally invalid 200 outcomes", async () => {
    const refusal = { ok: false, error: "That report changed. Reload and retry." };
    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be published.",
        fetcher: response(refusal, 409),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "http"
        && error.status === 409
        && error.message === refusal.error
        && JSON.stringify(error.payload) === JSON.stringify(refusal),
    );

    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be published.",
        fetcher: response({ error: "Private provider and database detail." }, 503),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "http"
        && error.status === 503
        && error.message === "The report could not be published. (HTTP 503)."
        && error.payload === undefined,
    );

    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be published.",
        fetcher: response({ ok: false, error: "Only a draft report can be published." }),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "domain"
        && error.message === "Only a draft report can be published.",
    );

    await assert.rejects(
      checkedJsonMutation("/reports", { method: "POST" }, {
        fallback: "The report could not be published.",
        fetcher: response({ ok: true, report: report(), reports: [] }),
        validate: value => isReportMutationPayload(value, expected({ action: "publish", reportId: "report_one" })),
      }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "domain"
        && error.message === "The report could not be published.",
    );
  });
});

describe("monthly Performance report route boundary", () => {
  it("rejects an absent month, bounds withdrawal text and redacts unexpected failures", () => {
    const source = readFileSync("src/app/api/portal/performance/reports/route.ts", "utf8");
    const handler = between(source, "async function handleReportMutation(", "\n\nfunction combinedEvents");
    const errorResponse = source.slice(source.indexOf("function reportMutationErrorResponse("));

    const missingMonthAt = handler.indexOf('body.action === "generate" && !reportMonth');
    const transactionAt = handler.indexOf("withClientMetadataLedgerTransaction");
    assert.ok(missingMonthAt >= 0 && transactionAt > missingMonthAt, "a missing generate month must be refused before persistence");
    assert.match(handler, /body\.withdrawalReason\.trim\(\)\.slice\(0, 500\)/);
    assert.doesNotMatch(handler, /body\.month\s*\|\|/);
    assert.doesNotMatch(source, /function previousMonth\(/);

    assert.match(source, /REPORT_MUTATION_DOMAIN_STATUSES/);
    assert.match(source, /\["Choose a valid report month\.", 400\]/);
    assert.match(source, /\["Report not found\.", 404\]/);
    assert.match(source, /\["Only a draft report can be published\.", 409\]/);
    assert.match(errorResponse, /error instanceof AuthError/);
    assert.match(errorResponse, /REPORT_MUTATION_DOMAIN_STATUSES\.get\(message\)/);
    assert.match(errorResponse, /GENERIC_REPORT_MUTATION_ERROR \}, \{ status: 500 \}/);
  });
});

describe("mounted monthly Performance report actions", () => {
  it("keeps checked receipts sequenced through the parent authority and exposes action-specific busy states", () => {
    const source = readFileSync("src/app/portal/agency/performance/_AquaTagDashboard.tsx", "utf8");
    const action = between(source, "  async function action(", "\n\n  function deleteDraft");
    const reportRow = source.slice(source.indexOf("function ReportRow("), source.indexOf("function StatusMetric("));

    assert.match(source, /from "@\/lib\/client\/performanceReportMutationPayload"/);
    assert.doesNotMatch(source, /function isReportMutationPayload\(/);
    assert.doesNotMatch(source, /useState\(client\.reports\)/);
    assert.doesNotMatch(source, /setReports\(/);
    assert.match(source, /beginReportMutation: \(\) => number/);
    assert.match(source, /onReportsChange: \(reports: MonthlyPerformanceReport\[\], sequence: number\) => void/);
    assert.match(source, /client\.reports\.map\(report =>/);
    assert.match(action, /if \(busyRef\.current\) return;/);
    assert.match(action, /normalizeReportWithdrawalReason\(withdrawalReason\)/);
    assert.match(action, /actionName === "generate" && !isValidPerformanceReportMonth\(month, currentMonth\)/);
    assert.match(action, /checkedJsonMutation<ReportMutationPayload>/);
    assert.match(action, /validate: value => isReportMutationPayload\(value,/);
    assert.match(action, /catch \(error\)/);
    assert.match(action, /finally \{[\s\S]*busyRef\.current = false;[\s\S]*setBusy\(undefined\);/);

    const monthValidationAt = action.indexOf('actionName === "generate" && !isValidPerformanceReportMonth');
    const normalizationAt = action.indexOf("normalizeReportWithdrawalReason(withdrawalReason)");
    const sequenceAt = action.indexOf("beginReportMutation()");
    const checkedAt = action.indexOf("checkedJsonMutation<ReportMutationPayload>");
    const validationAt = action.indexOf("validate: value => isReportMutationPayload");
    const authoritativeAt = action.indexOf("payload.reports");
    const parentApplyAt = action.indexOf("onReportsChange(next, sequence)");
    assert.ok(monthValidationAt >= 0 && normalizationAt >= 0 && sequenceAt > monthValidationAt && sequenceAt > normalizationAt);
    assert.ok(checkedAt > sequenceAt && validationAt > checkedAt);
    assert.ok(authoritativeAt > validationAt, "the authoritative report collection must only be read after validation");
    assert.ok(parentApplyAt > authoritativeAt, "only the sequenced parent authority may apply a checked receipt");

    assert.match(source, /role=\{feedback\.tone === "error" \? "alert" : "status"\}/);
    assert.match(source, /disabled=\{Boolean\(busy\) \|\| !reportMonthValid\}/);
    assert.match(source, /aria-invalid=\{!reportMonthValid\}/);
    assert.match(source, /busy=\{Boolean\(busy\)\}/);
    assert.match(source, /busyAction=\{busy\?\.reportId === report\.id/);
    assert.ok(
      (reportRow.match(/disabled=\{busy\}/g) ?? []).length >= 3,
      "publish, delete and withdraw controls must share the global report busy gate",
    );
    for (const label of ["Generating...", "Publishing...", "Withdrawing...", "Deleting..."]) {
      assert.match(source, new RegExp(label.replace(".", "\\.")));
    }
    assert.ok(
      (source.match(/aria-busy=\{/g) ?? []).length >= 5,
      "the generate control, row and each row mutation must expose progress semantics",
    );
    assert.ok(
      (source.match(/disabled:cursor-not-allowed disabled:opacity-50/g) ?? []).length >= 5,
      "every report mutation control must have visible disabled styling",
    );
  });
});

// The route-level cases below mount real server modules, so the same
// `server-only` stub and memory backend the sibling Performance tests use.
process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "performance-report-mutation-test-secret";
process.env.NODE_ENV = "test";
{
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    paths: [],
    children: [],
  } as never;
}

describe("monthly Performance report route error classification", () => {
  it("answers request refusals 400, missing records 404, state refusals 409 and unexpected failures generically", async () => {
    const [storage, tenants, users, auth, route, nextServer] = await Promise.all([
      import("../src/server/storage"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/lib/server/auth/auth"),
      import("../src/app/api/portal/performance/reports/route"),
      import("next/server"),
    ]);
    await storage.reset();
    const agency = tenants.createAgency({ name: "Report refusals" });
    const client = tenants.createClient(agency.id, { name: "Report client" });
    const owner = users.createUser({
      agencyId: agency.id,
      email: `owner-${agency.id}@reports.test`,
      name: "Report owner",
      password: "test-password",
      role: "agency-owner",
    });
    const token = auth.issueSession({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    });
    await storage.flushPendingWrites();
    // The element-access gate reads request cookies, so the handler runs inside
    // a real request scope exactly as the milestone route test does.
    const post = (body: unknown) => withSession(token, () => route.POST(new nextServer.NextRequest("http://localhost/api/portal/performance/reports", {
      method: "POST",
      headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })));
    const refusal = async (body: unknown, status: number, error: string) => {
      const response = await post(body);
      assert.equal(response.status, status, `${error}: expected ${status}, got ${response.status}`);
      assert.deepEqual(await response.json(), { ok: false, error });
    };
    const previousMonth = (() => { const value = new Date(); value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() - 1); return value.toISOString().slice(0, 7); })();

    await refusal("not json", 400, "Choose a client and report action.");
    await refusal({ action: "generate", clientId: 42, month: previousMonth }, 400, "Choose a client and report action.");
    await refusal({ action: "generate", clientId: client.id }, 400, "Choose a valid report month.");
    await refusal({ action: "generate", clientId: client.id, month: "2026-13" }, 400, "Choose a valid report month.");
    await refusal({ action: "generate", clientId: client.id, month: "2999-01" }, 400, "A report cannot be generated for a future month.");
    await refusal({ action: "generate", clientId: client.id, month: previousMonth, propertyId: 7 }, 400, "Choose a valid property.");
    await refusal({ action: "generate", clientId: client.id, month: previousMonth, propertyId: "prop_missing" }, 404, "Property not found.");
    await refusal({ action: "publish", clientId: client.id }, 400, "Choose a report.");
    await refusal({ action: "publish", clientId: client.id, reportId: "rpt_missing" }, 404, "Report not found.");
    await refusal({ action: "generate", clientId: "cli_missing", month: previousMonth }, 404, "Client not found.");

    const generated = await (await post({ action: "generate", clientId: client.id, month: previousMonth })).json();
    assert.equal(generated.ok, true);
    assert.equal(isReportMutationPayload(generated, { action: "generate", clientId: client.id, month: previousMonth }), true, "a real generate receipt must pass the browser validator");
    const reportId = generated.report.id as string;
    await refusal({ action: "withdraw", clientId: client.id, reportId, withdrawalReason: "Not live yet" }, 409, "Only a published report can be withdrawn.");
    const published = await (await post({ action: "publish", clientId: client.id, reportId })).json();
    assert.equal(published.report.status, "published");
    assert.equal(isReportMutationPayload(published, { action: "publish", clientId: client.id, reportId, month: previousMonth }), true, "a real publish receipt must pass the browser validator");
    await refusal({ action: "publish", clientId: client.id, reportId }, 409, "Only a draft report can be published.");
    await refusal({ action: "withdraw", clientId: client.id, reportId }, 400, "Add a reason for withdrawing this report.");
    await refusal({ action: "withdraw", clientId: client.id, reportId, withdrawalReason: "   " }, 400, "Add a reason for withdrawing this report.");
    await refusal({ action: "delete", clientId: client.id, reportId }, 409, "Published report history cannot be deleted. Withdraw the live report instead.");
    // A reason cut at the cap on a space is stored trimmed, and the validator expects exactly that.
    const longReason = `${"W".repeat(499)} tail`.slice(0, 500);
    assert.notEqual(longReason, longReason.trim(), "fixture must end with a space at the cap");
    const withdrawnResponse = await (await post({ action: "withdraw", clientId: client.id, reportId, withdrawalReason: longReason })).json();
    assert.equal(withdrawnResponse.report.withdrawalReason, longReason.trim());
    assert.equal(isReportMutationPayload(withdrawnResponse, { action: "withdraw", clientId: client.id, reportId, month: previousMonth, withdrawalReason: longReason }), true, "a real withdraw receipt must pass the browser validator");
    const remaining = withdrawnResponse.reports as Array<{ id: string; status: string }>;
    assert.deepEqual(remaining.map(report => [report.id, report.status]), [[reportId, "withdrawn"]]);
  });

  it("captures unexpected report failures server-side before answering the generic 500", () => {
    const source = readFileSync("src/app/api/portal/performance/reports/route.ts", "utf8");
    const errorResponse = source.slice(source.indexOf("function reportMutationErrorResponse("));
    assert.match(source, /import \{ captureError, type ObservabilityBreadcrumb \} from "@\/lib\/server\/observability"/);
    assert.match(errorResponse, /captureError\(error, breadcrumb\);[\s\S]{0,120}?GENERIC_REPORT_MUTATION_ERROR \}, \{ status: 500 \}/);
    assert.match(source, /body\.action !== "generate" && \(typeof body\.reportId !== "string" \|\| !body\.reportId\.trim\(\)\)/);
    assert.match(source, /body\.propertyId !== undefined && typeof body\.propertyId !== "string"/);
    assert.match(source, /body\.withdrawalReason\.trim\(\)\.slice\(0, 500\)\.trim\(\)/, "the route must trim after the cap like the browser normaliser");
    assert.equal(normalizeReportWithdrawalReason(`${"x ".repeat(250)}`.slice(0, 500)), `${"x ".repeat(250)}`.slice(0, 500).trim());
  });
});
