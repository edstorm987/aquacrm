import type { PerformanceAnalytics } from "@/lib/performance/performanceAnalytics";

export type MonthlyPerformanceReportStatus = "draft" | "published";

export interface MonthlyPerformanceReport {
  id: string;
  clientId: string;
  propertyId?: string;
  month: string;
  label: string;
  status: MonthlyPerformanceReportStatus;
  generatedAt: number;
  publishedAt?: number;
  analytics: PerformanceAnalytics;
  highlights: string[];
  nextSteps: string[];
}

export function cleanMonthlyPerformanceReports(value: unknown): MonthlyPerformanceReport[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MonthlyPerformanceReport => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<MonthlyPerformanceReport>;
    return typeof candidate.id === "string"
      && typeof candidate.clientId === "string"
      && typeof candidate.month === "string"
      && (candidate.status === "draft" || candidate.status === "published")
      && Boolean(candidate.analytics);
  }).sort((left, right) => right.month.localeCompare(left.month) || right.generatedAt - left.generatedAt);
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
