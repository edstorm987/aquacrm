import type {
  PerformanceAnalytics,
  PerformanceMetricSet,
} from "@/lib/performance/performanceAnalytics";
import type {
  MonthlyPerformanceReport,
  MonthlyPerformanceReportStatus,
} from "@/lib/performance/performanceReports";

export interface ReportMutationPayload {
  ok: true;
  report: MonthlyPerformanceReport;
  reports: MonthlyPerformanceReport[];
}

export interface ExpectedReportMutation {
  action: "generate" | "publish" | "withdraw" | "delete";
  clientId: string;
  reportId?: string;
  month: string;
  propertyId?: string;
  withdrawalReason?: string;
}

type JsonRecord = Record<string, unknown>;

const REPORT_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_WITHDRAWAL_REASON_LENGTH = 500;

export function isValidPerformanceReportMonth(
  value: unknown,
  latestMonth = new Date().toISOString().slice(0, 7),
): value is string {
  return typeof value === "string"
    && REPORT_MONTH_PATTERN.test(value)
    && value <= latestMonth;
}

// Trim after the cap as well: the route trims what it receives, so a cut that
// lands on a space would otherwise store one character less than expected.
export function normalizeReportWithdrawalReason(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_WITHDRAWAL_REASON_LENGTH).trim()
    : "";
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonBlankString(value: unknown): value is string | undefined {
  return value === undefined || isNonBlankString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isOptionalNonNegativeNumber(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeNumber(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isReportStatus(value: unknown): value is MonthlyPerformanceReportStatus {
  return value === "draft"
    || value === "published"
    || value === "superseded"
    || value === "withdrawn";
}

function isReportAction(value: unknown): value is ExpectedReportMutation["action"] {
  return value === "generate"
    || value === "publish"
    || value === "withdraw"
    || value === "delete";
}

function isMetricSet(value: unknown): value is PerformanceMetricSet {
  if (!isJsonRecord(value)) return false;
  return isNonNegativeNumber(value.views)
    && isNonNegativeNumber(value.visitors)
    && isNonNegativeNumber(value.conversions)
    && isNonNegativeNumber(value.conversionRate)
    && isNonNegativeNumber(value.searchImpressions)
    && isNonNegativeNumber(value.searchClicks)
    && isNonNegativeNumber(value.searchCtr)
    && isOptionalNonNegativeNumber(value.averagePosition)
    && isNonNegativeNumber(value.conversionValueCents);
}

function isChangeSet(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return [
    value.views,
    value.visitors,
    value.conversions,
    value.conversionRate,
    value.searchImpressions,
    value.searchClicks,
  ].every(item => item === null || isFiniteNumber(item));
}

function isSeriesRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return typeof value.date === "string"
    && /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value.date)
    && isNonNegativeNumber(value.views)
    && isNonNegativeNumber(value.conversions)
    && isNonNegativeNumber(value.searchClicks);
}

function isPageRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.path)
    && isNonNegativeNumber(value.views)
    && isNonNegativeNumber(value.conversions)
    && isNonNegativeNumber(value.conversionRate);
}

function isSearchPageRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.path)
    && isNonNegativeNumber(value.impressions)
    && isNonNegativeNumber(value.clicks)
    && isNonNegativeNumber(value.ctr)
    && isOptionalNonNegativeNumber(value.position);
}

function isSourceRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.source)
    && isNonNegativeNumber(value.views)
    && isNonNegativeNumber(value.conversions);
}

function isQueryRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.query)
    && isNonNegativeNumber(value.impressions)
    && isNonNegativeNumber(value.clicks)
    && isNonNegativeNumber(value.ctr)
    && isOptionalNonNegativeNumber(value.position);
}

function isFormRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.name)
    && isNonNegativeNumber(value.submissions)
    && isNonNegativeNumber(value.valueCents);
}

function isVariantRow(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.experimentId)
    && isNonBlankString(value.variant)
    && isNonNegativeNumber(value.visitors)
    && isNonNegativeNumber(value.conversions)
    && isNonNegativeNumber(value.conversionRate);
}

function isArrayOf(value: unknown, predicate: (item: unknown) => boolean): value is unknown[] {
  return Array.isArray(value) && value.every(predicate);
}

function isPerformanceAnalytics(value: unknown): value is PerformanceAnalytics {
  if (!isJsonRecord(value)) return false;
  return isPositiveInteger(value.days)
    && isMetricSet(value.current)
    && isMetricSet(value.previous)
    && isChangeSet(value.changes)
    && isArrayOf(value.series, isSeriesRow)
    && isArrayOf(value.pages, isPageRow)
    && isArrayOf(value.searchPages, isSearchPageRow)
    && isArrayOf(value.sources, isSourceRow)
    && isArrayOf(value.queries, isQueryRow)
    && isArrayOf(value.forms, isFormRow)
    && isArrayOf(value.variants, isVariantRow);
}

function isMonthlyPerformanceReport(value: unknown): value is MonthlyPerformanceReport {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.id)
    && isNonBlankString(value.clientId)
    && isOptionalNonBlankString(value.propertyId)
    && typeof value.month === "string"
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
    && isNonBlankString(value.label)
    && isReportStatus(value.status)
    && isPositiveInteger(value.revision)
    && isNonNegativeNumber(value.generatedAt)
    && isOptionalNonNegativeNumber(value.publishedAt)
    && isOptionalNonBlankString(value.publishedBy)
    && isOptionalNonBlankString(value.supersedesReportId)
    && isOptionalNonNegativeNumber(value.supersededAt)
    && isOptionalNonBlankString(value.supersededByReportId)
    && isOptionalNonNegativeNumber(value.withdrawnAt)
    && isOptionalNonBlankString(value.withdrawnBy)
    && isOptionalNonBlankString(value.withdrawalReason)
    && isPerformanceAnalytics(value.analytics)
    && isStringArray(value.highlights)
    && isStringArray(value.nextSteps);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => sameJsonValue(item, right[index]));
  }
  if (!isJsonRecord(left) || !isJsonRecord(right)) return false;
  const leftKeys = Object.keys(left).filter(key => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter(key => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]));
}

function sameReport(left: MonthlyPerformanceReport, right: MonthlyPerformanceReport): boolean {
  return left.id === right.id
    && left.clientId === right.clientId
    && left.propertyId === right.propertyId
    && left.month === right.month
    && left.label === right.label
    && left.status === right.status
    && left.revision === right.revision
    && left.generatedAt === right.generatedAt
    && left.publishedAt === right.publishedAt
    && left.publishedBy === right.publishedBy
    && left.supersedesReportId === right.supersedesReportId
    && left.supersededAt === right.supersededAt
    && left.supersededByReportId === right.supersededByReportId
    && left.withdrawnAt === right.withdrawnAt
    && left.withdrawnBy === right.withdrawnBy
    && left.withdrawalReason === right.withdrawalReason
    && sameJsonValue(left.analytics, right.analytics)
    && sameJsonValue(left.highlights, right.highlights)
    && sameJsonValue(left.nextSteps, right.nextSteps);
}

function scopedReports(value: unknown, clientId: string): MonthlyPerformanceReport[] | null {
  if (!Array.isArray(value) || !value.every(isMonthlyPerformanceReport)) return null;
  if (value.some(report => report.clientId !== clientId)) return null;
  return new Set(value.map(report => report.id)).size === value.length ? value : null;
}

function includesAuthoritativeReport(
  reports: MonthlyPerformanceReport[],
  report: MonthlyPerformanceReport,
): boolean {
  const authoritative = reports.find(candidate => candidate.id === report.id);
  return Boolean(authoritative && sameReport(authoritative, report));
}

export function isReportMutationPayload(
  value: unknown,
  expected: ExpectedReportMutation,
): value is ReportMutationPayload {
  if (!isReportAction(expected.action)
    || !isNonBlankString(expected.clientId)
    || !isJsonRecord(value)
    || value.ok !== true
    || !isMonthlyPerformanceReport(value.report)
    || value.report.clientId !== expected.clientId) {
    return false;
  }

  const reports = scopedReports(value.reports, expected.clientId);
  if (!reports) return false;

  if (expected.action === "generate") {
    return isValidPerformanceReportMonth(expected.month)
      && isOptionalNonBlankString(expected.propertyId)
      && value.report.status === "draft"
      && value.report.month === expected.month
      && value.report.propertyId === expected.propertyId
      && includesAuthoritativeReport(reports, value.report);
  }

  if (!isNonBlankString(expected.reportId) || value.report.id !== expected.reportId) return false;
  if (expected.action === "delete") {
    return value.report.status === "draft"
      && reports.every(report => report.id !== expected.reportId);
  }

  const expectedStatus = expected.action === "publish" ? "published" : "withdrawn";
  const expectedWithdrawalReason = normalizeReportWithdrawalReason(expected.withdrawalReason);
  return value.report.status === expectedStatus
    && (expected.action !== "withdraw"
      || (isNonBlankString(expectedWithdrawalReason)
        && value.report.withdrawalReason === expectedWithdrawalReason))
    && includesAuthoritativeReport(reports, value.report);
}
