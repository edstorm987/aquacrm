import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  dateInputValue,
  dateFromValue,
  formatUkDate,
  formatUkDateTime,
  isoDateTimeValue,
  localDateTimeInputValue,
  timestampFromValue,
} from "../src/lib/formatDateTime";

test("shared date formatting contains malformed legacy timestamps", () => {
  for (const value of [undefined, null, "", "not-a-date", Number.NaN, Number.POSITIVE_INFINITY, new Date(Number.NaN)]) {
    assert.equal(dateFromValue(value), null);
    assert.equal(timestampFromValue(value), undefined);
    assert.equal(isoDateTimeValue(value), undefined);
    assert.equal(localDateTimeInputValue(value), "");
    assert.equal(dateInputValue(value), "");
    assert.equal(formatUkDate(value, { dateStyle: "medium" }), "Date needs review");
    assert.equal(formatUkDateTime(value), "Date needs review");
  }
});

test("shared date formatting accepts epoch numbers, numeric strings and ISO strings", () => {
  const stamp = Date.UTC(2026, 7, 15, 9, 30);
  assert.equal(timestampFromValue(stamp), stamp);
  assert.equal(timestampFromValue(String(stamp)), stamp);
  assert.equal(timestampFromValue(new Date(stamp).toISOString()), stamp);
  assert.equal(isoDateTimeValue(stamp), "2026-08-15T09:30:00.000Z");
  assert.equal(dateInputValue(stamp), "2026-08-15");
  assert.match(formatUkDate(stamp, { dateStyle: "medium" }), /15 Aug 2026/);
  assert.match(formatUkDateTime(stamp), /15 Aug 2026/);
  assert.match(localDateTimeInputValue(stamp), /^2026-08-15T/);
});

test("persisted-date UI boundaries use the shared safe formatter", () => {
  const files = [
    "../src/app/portal/agency/actions/_ActionsWorkspace.tsx",
    "../src/app/portal/agency/company/_CompanyWorkspace.tsx",
    "../src/app/portal/agency/company/_LegalCompliancePanel.tsx",
    "../src/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace.tsx",
    "../src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx",
    "../src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx",
    "../src/app/portal/agency/notepad/_NotepadWorkspace.tsx",
    "../src/app/portal/agency/performance/_AquaTagDashboard.tsx",
    "../src/app/portal/agency/sop-library/_SopLibrary.tsx",
    "../src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx",
    "../src/app/api/portal/search/route.ts",
  ];
  const unsafePersistedDate = /new Date\([^)]*(?:At|Date|date|time|Time|deadline|updated|created|scheduled|due|expiry|expires|starts|ends)[^)]*\)\.(?:toLocale(?:String|DateString|TimeString)?|toISOString)/;

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, unsafePersistedDate, file);
  }
});

test("Journey meeting summaries cannot send unchecked dates to toISOString", () => {
  const source = readFileSync(new URL("../src/app/portal/agency/leads-pipeline/_UpcomingMeetings.tsx", import.meta.url), "utf8");
  assert.match(source, /timestampFromValue\(item\.meetingAt\)/);
  assert.match(source, /isoDateTimeValue\(item\.meetingAt\)/);
  assert.doesNotMatch(source, /new Date\(item\.meetingAt\)\.toISOString\(\)/);
});

test("built-in workspaces contain malformed imported timestamps", () => {
  const guards: Array<[string, RegExp]> = [
    ["../src/built-ins/modules/agency-marketing/src/pages/TouchpointsPage.tsx", /new Date\(t\.at\)/],
    ["../src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx", /new Date\(item\.at\)/],
    ["../src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx", /new Date\(value\)/],
    ["../src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx", /new Date\(value\)/],
    ["../src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx", /new Date\(value\)/],
    ["../src/built-ins/modules/leads-pipeline/src/api/handlers.ts", /new Date\((?:attempt|note)\.at\)/],
    ["../src/built-ins/modules/website-editor/src/components/editor/PortalVariantGallery.tsx", /new Date\(ts\)/],
    ["../src/built-ins/modules/website-editor/src/components/editor/HistoryToolbar.tsx", /new Date\(ts\)/],
    ["../src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx", /new Date\(pickedSlot\.startMs\)/],
    ["../src/built-ins/modules/website-editor/src/lib/sitemap.ts", /new Date\(ts\)/],
  ];

  for (const [file, unsafeDate] of guards) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, unsafeDate, file);
  }
});

test("built-in plugin date guards preserve ESM exports and contain malformed records", async () => {
  const guards = await Promise.all([
    import("../src/built-ins/modules/agency-finance/src/lib/safeDate"),
    import("../src/built-ins/modules/ecommerce/src/lib/safeDate"),
    import("../src/built-ins/modules/leads-pipeline/src/lib/safeDate"),
    import("../src/built-ins/modules/website-editor/src/lib/safeDate"),
  ]);

  for (const guard of guards) {
    assert.equal(guard.dateInputValue("invalid"), "");
    assert.equal(guard.isoDateTimeValue(Number.NaN), undefined);
    assert.equal(guard.formatUkDate("invalid", { dateStyle: "medium" }), "Date needs review");
  }
});
