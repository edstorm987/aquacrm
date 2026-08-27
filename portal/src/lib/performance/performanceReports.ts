import type { PerformanceAnalytics } from "@/lib/performance/performanceAnalytics";

export type MonthlyPerformanceReportStatus = "draft" | "published" | "superseded" | "withdrawn";

export interface MonthlyPerformanceReport {
  id: string;
  clientId: string;
  propertyId?: string;
  month: string;
  label: string;
  status: MonthlyPerformanceReportStatus;
  revision: number;
  generatedAt: number;
  publishedAt?: number;
  publishedBy?: string;
  supersedesReportId?: string;
  supersededAt?: number;
  supersededByReportId?: string;
  withdrawnAt?: number;
  withdrawnBy?: string;
  withdrawalReason?: string;
  analytics: PerformanceAnalytics;
  highlights: string[];
  nextSteps: string[];
}

export function cleanMonthlyPerformanceReports(value: unknown): MonthlyPerformanceReport[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<MonthlyPerformanceReport>;
    const valid = typeof candidate.id === "string"
      && typeof candidate.clientId === "string"
      && typeof candidate.month === "string"
      && typeof candidate.label === "string"
      && isReportStatus(candidate.status)
      && typeof candidate.generatedAt === "number"
      && Number.isFinite(candidate.generatedAt)
      && Boolean(candidate.analytics)
      && Array.isArray(candidate.highlights)
      && Array.isArray(candidate.nextSteps);
    if (!valid) return [];
    return [{
      ...candidate,
      revision: positiveInteger(candidate.revision) || 1,
    } as MonthlyPerformanceReport];
  }).sort((left, right) => right.month.localeCompare(left.month) || right.generatedAt - left.generatedAt);
}

export function createMonthlyPerformanceReportDraft(
  reports: MonthlyPerformanceReport[],
  input: Omit<MonthlyPerformanceReport, "revision" | "status">,
): { report: MonthlyPerformanceReport; reports: MonthlyPerformanceReport[] } {
  if (reports.some(item => item.id === input.id)) throw new Error("Report ID already exists.");
  const revision = reports
    .filter(item => sameSeries(item, input))
    .reduce((highest, item) => Math.max(highest, positiveInteger(item.revision) || 1), 0) + 1;
  const report: MonthlyPerformanceReport = { ...input, revision, status: "draft" };
  return { report, reports: sortReports([report, ...reports]) };
}

export function publishMonthlyPerformanceReport(
  reports: MonthlyPerformanceReport[],
  reportId: string,
  actorUserId: string,
  now = Date.now(),
): { report: MonthlyPerformanceReport; reports: MonthlyPerformanceReport[] } {
  const target = reports.find(item => item.id === reportId);
  if (!target) throw new Error("Report not found.");
  if (target.status !== "draft") throw new Error("Only a draft report can be published.");
  const previous = reports.find(item => item.status === "published" && sameSeries(item, target));
  const report: MonthlyPerformanceReport = {
    ...target,
    status: "published",
    publishedAt: now,
    publishedBy: actorUserId,
    supersedesReportId: previous?.id,
  };
  const next = reports.map(item => {
    if (item.id === target.id) return report;
    if (item.status !== "published" || !sameSeries(item, target)) return item;
    return {
      ...item,
      status: "superseded" as const,
      supersededAt: now,
      supersededByReportId: target.id,
    };
  });
  return { report, reports: sortReports(next) };
}

export function withdrawMonthlyPerformanceReport(
  reports: MonthlyPerformanceReport[],
  reportId: string,
  actorUserId: string,
  reason: string,
  now = Date.now(),
): { report: MonthlyPerformanceReport; reports: MonthlyPerformanceReport[] } {
  const target = reports.find(item => item.id === reportId);
  if (!target) throw new Error("Report not found.");
  if (target.status !== "published") throw new Error("Only a published report can be withdrawn.");
  const withdrawalReason = reason.trim().slice(0, 500);
  if (!withdrawalReason) throw new Error("Add a reason for withdrawing this report.");
  const report: MonthlyPerformanceReport = {
    ...target,
    status: "withdrawn",
    withdrawnAt: now,
    withdrawnBy: actorUserId,
    withdrawalReason,
  };
  return {
    report,
    reports: sortReports(reports.map(item => item.id === target.id ? report : item)),
  };
}

export function deleteMonthlyPerformanceReportDraft(
  reports: MonthlyPerformanceReport[],
  reportId: string,
): { report: MonthlyPerformanceReport; reports: MonthlyPerformanceReport[] } {
  const report = reports.find(item => item.id === reportId);
  if (!report) throw new Error("Report not found.");
  if (report.status !== "draft") throw new Error("Published report history cannot be deleted. Withdraw the live report instead.");
  return { report, reports: reports.filter(item => item.id !== report.id) };
}

function sameSeries(left: Pick<MonthlyPerformanceReport, "clientId" | "propertyId" | "month">, right: Pick<MonthlyPerformanceReport, "clientId" | "propertyId" | "month">): boolean {
  return left.clientId === right.clientId
    && (left.propertyId || undefined) === (right.propertyId || undefined)
    && left.month === right.month;
}

function sortReports(reports: MonthlyPerformanceReport[]): MonthlyPerformanceReport[] {
  return [...reports].sort((left, right) => right.month.localeCompare(left.month) || right.generatedAt - left.generatedAt);
}

function isReportStatus(value: unknown): value is MonthlyPerformanceReportStatus {
  return value === "draft" || value === "published" || value === "superseded" || value === "withdrawn";
}

function positiveInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function reportMonthRange(month: string): { start: number; end: number; label: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid report month.");
  const [year, monthNumber] = month.split("-").map(Number);
  const start = Date.UTC(year, monthNumber - 1, 1);
  const calendarEnd = Date.UTC(year, monthNumber, 1) - 1;
  const end = Math.min(calendarEnd, Date.now());
  if (start > Date.now()) throw new Error("A report cannot be generated for a future month.");
  return {
    start,
    end,
    label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(start)),
  };
}

export function reportHighlights(analytics: PerformanceAnalytics): string[] {
  const highlights = [
    `${analytics.current.visitors.toLocaleString("en-GB")} visitors viewed ${analytics.current.views.toLocaleString("en-GB")} pages.`,
    `${analytics.current.conversions.toLocaleString("en-GB")} tracked enquiries or actions produced a ${analytics.current.conversionRate.toFixed(1)}% conversion rate.`,
  ];
  if (analytics.current.searchImpressions > 0) {
    highlights.push(`Google Search recorded ${analytics.current.searchClicks.toLocaleString("en-GB")} clicks from ${analytics.current.searchImpressions.toLocaleString("en-GB")} impressions.`);
  }
  if (analytics.pages[0]) highlights.push(`${analytics.pages[0].path} was the most viewed page with ${analytics.pages[0].views.toLocaleString("en-GB")} views.`);
  return highlights;
}

export function reportNextSteps(analytics: PerformanceAnalytics): string[] {
  const steps: string[] = [];
  const underperforming = analytics.pages.find(page => page.views >= 10 && page.conversionRate < 1);
  if (underperforming) steps.push(`Review the call to action on ${underperforming.path}; it receives attention but converts below 1%.`);
  if (analytics.current.searchImpressions > 0 && analytics.current.searchCtr < 2) steps.push("Improve search titles and descriptions on high-impression pages to earn more clicks.");
  if (!analytics.forms.length) steps.push("Confirm the primary enquiry forms are tagged so every conversion is visible next month.");
  if (!steps.length) steps.push("Keep the current measurement running and compare the next reporting period before changing direction.");
  return steps.slice(0, 3);
}
