export interface PerformanceEvent {
  type: string;
  occurredAt: number;
  propertyId?: string;
  url?: string;
  path?: string;
  referrer?: string;
  sessionId?: string;
  formName?: string;
  query?: string;
  impressions?: number;
  clicks?: number;
  position?: number;
  experimentId?: string;
  variant?: string;
  conversionValueCents?: number;
  metric?: string;
}

export interface PerformanceMetricSet {
  views: number;
  visitors: number;
  conversions: number;
  conversionRate: number;
  searchImpressions: number;
  searchClicks: number;
  searchCtr: number;
  averagePosition?: number;
  conversionValueCents: number;
}

export interface PerformanceAnalytics {
  days: number;
  current: PerformanceMetricSet;
  previous: PerformanceMetricSet;
  changes: Record<"views" | "visitors" | "conversions" | "conversionRate" | "searchImpressions" | "searchClicks", number | null>;
  series: Array<{ date: string; views: number; conversions: number; searchClicks: number }>;
  pages: Array<{ path: string; views: number; conversions: number; conversionRate: number }>;
  searchPages: Array<{ path: string; impressions: number; clicks: number; ctr: number; position?: number }>;
  sources: Array<{ source: string; views: number; conversions: number }>;
  queries: Array<{ query: string; impressions: number; clicks: number; ctr: number; position?: number }>;
  forms: Array<{ name: string; submissions: number; valueCents: number }>;
  variants: Array<{ experimentId: string; variant: string; visitors: number; conversions: number; conversionRate: number }>;
}

const DAY = 86_400_000;

export function buildPerformanceAnalytics(
  events: PerformanceEvent[],
  days: number,
  now = Date.now(),
): PerformanceAnalytics {
  const safeDays = [7, 28, 90].includes(days) ? days : 28;
  const start = now - safeDays * DAY;
  return buildAnalyticsWindow(events, start, now, safeDays);
}

export function buildPerformanceAnalyticsForRange(
  events: PerformanceEvent[],
  start: number,
  end: number,
): PerformanceAnalytics {
  const safeStart = Math.min(start, end);
  const safeEnd = Math.max(start, end);
  const days = Math.max(1, Math.ceil((safeEnd - safeStart + 1) / DAY));
  return buildAnalyticsWindow(events, safeStart, safeEnd, days);
}

function buildAnalyticsWindow(
  events: PerformanceEvent[],
  start: number,
  end: number,
  days: number,
): PerformanceAnalytics {
  const previousStart = start - days * DAY;
  const currentEvents = events.filter(event => event.occurredAt >= start && event.occurredAt <= end);
  const previousEvents = events.filter(event => event.occurredAt >= previousStart && event.occurredAt < start);
  const current = metrics(currentEvents);
  const previous = metrics(previousEvents);

  return {
    days,
    current,
    previous,
    changes: {
      views: change(current.views, previous.views),
      visitors: change(current.visitors, previous.visitors),
      conversions: change(current.conversions, previous.conversions),
      conversionRate: change(current.conversionRate, previous.conversionRate),
      searchImpressions: change(current.searchImpressions, previous.searchImpressions),
      searchClicks: change(current.searchClicks, previous.searchClicks),
    },
    series: dailySeries(currentEvents, days, end),
    pages: groupedPages(currentEvents),
    searchPages: groupedSearchPages(currentEvents),
    sources: groupedSources(currentEvents),
    queries: groupedQueries(currentEvents),
    forms: groupedForms(currentEvents),
    variants: groupedVariants(currentEvents),
  };
}

export function performanceMetricValue(events: PerformanceEvent[], metric: string): number {
  const summary = metrics(events);
  if (metric === "pageviews") return summary.views;
  if (metric === "visitors") return summary.visitors;
  if (metric === "conversions") return summary.conversions;
  if (metric === "search-clicks") return summary.searchClicks;
  return 0;
}

function metrics(events: PerformanceEvent[]): PerformanceMetricSet {
  const pageviews = events.filter(event => event.type === "pageview");
  const conversions = events.filter(isConversion);
  const search = events.filter(event => event.type === "search");
  const sessions = new Set(pageviews.map(event => event.sessionId).filter(Boolean));
  const impressions = search.reduce((sum, event) => sum + count(event.impressions), 0);
  const clicks = search.reduce((sum, event) => sum + count(event.clicks), 0);
  const positioned = search.filter(event => typeof event.position === "number" && count(event.impressions) > 0);
  const positionWeight = positioned.reduce((sum, event) => sum + count(event.impressions), 0);
  return {
    views: pageviews.length,
    visitors: sessions.size || pageviews.length,
    conversions: conversions.length,
    conversionRate: rate(conversions.length, pageviews.length),
    searchImpressions: impressions,
    searchClicks: clicks,
    searchCtr: rate(clicks, impressions),
    averagePosition: positionWeight
      ? positioned.reduce((sum, event) => sum + (event.position ?? 0) * count(event.impressions), 0) / positionWeight
      : undefined,
    conversionValueCents: conversions.reduce((sum, event) => sum + count(event.conversionValueCents), 0),
  };
}

function dailySeries(events: PerformanceEvent[], days: number, now: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now - (days - index - 1) * DAY).toISOString().slice(0, 10);
    const rows = events.filter(event => new Date(event.occurredAt).toISOString().slice(0, 10) === date);
    return {
      date,
      views: rows.filter(event => event.type === "pageview").length,
      conversions: rows.filter(isConversion).length,
      searchClicks: rows.filter(event => event.type === "search").reduce((sum, event) => sum + count(event.clicks), 0),
    };
  });
}

function groupedPages(events: PerformanceEvent[]) {
  const rows = new Map<string, { views: number; conversions: number }>();
  for (const event of events) {
    const path = event.path || "/";
    const current = rows.get(path) ?? { views: 0, conversions: 0 };
    if (event.type === "pageview") current.views += 1;
    if (isConversion(event)) current.conversions += 1;
    rows.set(path, current);
  }
  return [...rows.entries()]
    .map(([path, row]) => ({ path, ...row, conversionRate: rate(row.conversions, row.views) }))
    .filter(row => row.views || row.conversions)
    .sort((left, right) => right.views - left.views || right.conversions - left.conversions)
    .slice(0, 12);
}

function groupedSources(events: PerformanceEvent[]) {
  const rows = new Map<string, { views: number; conversions: number }>();
  for (const event of events) {
    if (event.type !== "pageview" && !isConversion(event)) continue;
    const source = sourceName(event.referrer);
    const current = rows.get(source) ?? { views: 0, conversions: 0 };
    if (event.type === "pageview") current.views += 1;
    if (isConversion(event)) current.conversions += 1;
    rows.set(source, current);
  }
  return [...rows.entries()]
    .map(([source, row]) => ({ source, ...row }))
    .sort((left, right) => right.views - left.views || right.conversions - left.conversions)
    .slice(0, 10);
}

function groupedQueries(events: PerformanceEvent[]) {
  const rows = new Map<string, { impressions: number; clicks: number; weightedPosition: number; positionWeight: number }>();
  for (const event of events.filter(item => item.type === "search" && item.query)) {
    const query = event.query as string;
    const current = rows.get(query) ?? { impressions: 0, clicks: 0, weightedPosition: 0, positionWeight: 0 };
    current.impressions += count(event.impressions);
    current.clicks += count(event.clicks);
    if (typeof event.position === "number") {
      const weight = Math.max(1, count(event.impressions));
      current.weightedPosition += event.position * weight;
      current.positionWeight += weight;
    }
    rows.set(query, current);
  }
  return [...rows.entries()]
    .map(([query, row]) => ({
      query,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: rate(row.clicks, row.impressions),
      position: row.positionWeight ? row.weightedPosition / row.positionWeight : undefined,
    }))
    .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions)
    .slice(0, 20);
}

function groupedSearchPages(events: PerformanceEvent[]) {
  const rows = new Map<string, { impressions: number; clicks: number; weightedPosition: number; positionWeight: number }>();
  for (const event of events.filter(item => item.type === "search" && item.path)) {
    const path = event.path as string;
    const current = rows.get(path) ?? { impressions: 0, clicks: 0, weightedPosition: 0, positionWeight: 0 };
    current.impressions += count(event.impressions);
    current.clicks += count(event.clicks);
    if (typeof event.position === "number") {
      const weight = Math.max(1, count(event.impressions));
      current.weightedPosition += event.position * weight;
      current.positionWeight += weight;
    }
    rows.set(path, current);
  }
  return [...rows.entries()]
    .map(([path, row]) => ({
      path,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: rate(row.clicks, row.impressions),
      position: row.positionWeight ? row.weightedPosition / row.positionWeight : undefined,
    }))
    .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions)
    .slice(0, 20);
}

function groupedForms(events: PerformanceEvent[]) {
  const rows = new Map<string, { submissions: number; valueCents: number }>();
  for (const event of events.filter(item => item.type === "form" || item.type === "conversion")) {
    const name = event.formName || event.path || "Conversion";
    const current = rows.get(name) ?? { submissions: 0, valueCents: 0 };
    current.submissions += 1;
    current.valueCents += count(event.conversionValueCents);
    rows.set(name, current);
  }
  return [...rows.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .sort((left, right) => right.submissions - left.submissions)
    .slice(0, 12);
}

function groupedVariants(events: PerformanceEvent[]) {
  const rows = new Map<string, { experimentId: string; variant: string; visitors: Set<string>; exposures: number; conversions: number }>();
  for (const event of events.filter(item => item.experimentId && item.variant)) {
    const key = `${event.experimentId}:${event.variant}`;
    const current = rows.get(key) ?? {
      experimentId: event.experimentId as string,
      variant: event.variant as string,
      visitors: new Set<string>(),
      exposures: 0,
      conversions: 0,
    };
    if (event.type === "interaction" && event.metric === "experiment-view") current.exposures += 1;
    if (event.sessionId) current.visitors.add(event.sessionId);
    if (isConversion(event)) current.conversions += 1;
    rows.set(key, current);
  }
  return [...rows.values()].map(row => {
    const visitors = row.visitors.size || row.exposures;
    return {
      experimentId: row.experimentId,
      variant: row.variant,
      visitors,
      conversions: row.conversions,
      conversionRate: rate(row.conversions, visitors),
    };
  });
}

function isConversion(event: PerformanceEvent): boolean {
  return event.type === "form"
    || event.type === "conversion"
    || (event.type === "interaction" && event.metric === "conversion");
}

function sourceName(value?: string): string {
  if (!value) return "Direct";
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "localhost" || host === "127.0.0.1") return "Internal preview";
    if (/google\./.test(host)) return "Google";
    if (/bing\./.test(host)) return "Bing";
    if (/facebook\.|instagram\.|tiktok\.|linkedin\./.test(host)) return host.split(".")[0].replace(/^\w/, letter => letter.toUpperCase());
    return host;
  } catch {
    return "Direct";
  }
}

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10_000) / 100 : 0;
}

function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
