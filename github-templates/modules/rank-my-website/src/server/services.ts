// rank-my-website service.
//
// No persistence in v1 (per-user history is post-ship). The service
// composes the URL safety check + fetcher + analyzer + worst-band
// overall, then hands off to public-funnel on capture.

import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  Band, DiagnosticReport, RunDiagnosticInput,
} from "../lib/domain";
import { checkUrlSafety } from "../lib/domain";
import { runAllChecks, worstBand } from "../lib/analyzer";
import type {
  ActivityLogPort, EventBusPort, FunnelCapturePort,
  HttpFetchPort,
} from "./ports";
import { HttpFetchError } from "./ports";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BODY_BYTES = 3 * 1024 * 1024;
const TOOL_ID = "rank-my-website";

export class RmwInputError extends Error {
  constructor(public reason: string, message?: string) {
    super(message ?? reason);
    this.name = "RmwInputError";
  }
}

export interface RmwDeps {
  agencyId: AgencyId;
  http: HttpFetchPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  funnel?: FunnelCapturePort;
}

export class RmwService {
  private readonly agencyId: AgencyId;
  private readonly http: HttpFetchPort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly funnel?: FunnelCapturePort;

  constructor(deps: RmwDeps) {
    this.agencyId = deps.agencyId;
    this.http = deps.http;
    this.activity = deps.activity;
    this.events = deps.events;
    if (deps.funnel) this.funnel = deps.funnel;
  }

  async runDiagnostic(input: RunDiagnosticInput): Promise<DiagnosticReport> {
    const safety = checkUrlSafety(input.url);
    if (!safety.ok) {
      throw new RmwInputError(safety.reason ?? "invalid_url", `URL rejected: ${safety.reason}`);
    }
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBodyBytes = input.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

    const fetchedAt = now();
    const u = new URL(input.url);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const sitemapUrl = `${u.protocol}//${u.host}/sitemap.xml`;

    let pageRes;
    try {
      pageRes = await this.http.fetchPage(input.url, { timeoutMs, maxBodyBytes });
    } catch (e) {
      const kind = e instanceof HttpFetchError ? e.kind : "network";
      const message = e instanceof Error ? e.message : "fetch_failed";
      this.activity.logActivity({
        agencyId: this.agencyId,
        category: "rank-my-website", action: "rank-my-website.diagnostic.failed",
        message: `Diagnostic fetch failed: ${input.url} (${kind})`,
        metadata: { url: input.url, kind, message },
      });
      this.events.emit({ agencyId: this.agencyId },
        "rank-my-website.diagnostic.failed",
        { url: input.url, kind, message });
      const report: DiagnosticReport = {
        url: input.url, fetchedAt,
        overallBand: "F", checks: [],
        fetchError: { kind, message, ...(e instanceof HttpFetchError && e.status !== undefined ? { status: e.status } : {}) },
      };
      return report;
    }

    // Probe robots.txt + sitemap.xml in parallel — soft-fail to false.
    const [robotsTxtOk, sitemapXmlOk] = await Promise.all([
      this.http.reachable(robotsUrl, { timeoutMs }).catch(() => false),
      this.http.reachable(sitemapUrl, { timeoutMs }).catch(() => false),
    ]);

    const isHttps = pageRes.finalUrl.startsWith("https:");
    const hsts = pageRes.headers["strict-transport-security"] ?? null;

    const checks = runAllChecks(pageRes.body, {
      isHttps, hsts, robotsTxtOk, sitemapXmlOk,
    });
    const overall = worstBand(checks);

    this.activity.logActivity({
      agencyId: this.agencyId,
      category: "rank-my-website", action: "rank-my-website.diagnostic.run",
      message: `Diagnostic run for ${input.url} → overall ${overall}`,
      metadata: {
        url: input.url, overallBand: overall,
        bands: Object.fromEntries(checks.map(c => [c.id, c.band])),
      },
    });
    this.events.emit({ agencyId: this.agencyId },
      "rank-my-website.diagnostic.run",
      { url: input.url, overallBand: overall, checks: checks.map(c => ({ id: c.id, band: c.band })) });

    return { url: input.url, fetchedAt, overallBand: overall, checks };
  }

  // After the report renders, the form posts here with the visitor's
  // email. We hand off to public-funnel's `tool-complete` so the
  // capture lives in ONE place (no duplicate lead store inside this
  // plugin).
  async capture(input: {
    email: string;
    url: string;
    report: DiagnosticReport;
  }): Promise<{ leadUserId: string; created: boolean; session?: string } | { handedOff: false; reason: string }> {
    if (!this.funnel) {
      return { handedOff: false, reason: "public_funnel_plugin_not_installed" };
    }
    const scoreBands: Record<string, Band> = {};
    for (const c of input.report.checks) scoreBands[c.id] = c.band;

    const r = await Promise.resolve(this.funnel.captureToolCompletion({
      email: input.email,
      toolId: TOOL_ID,
      input: { url: input.url },
      output: {
        overallBand: input.report.overallBand,
        scoreBands,
        fetchError: input.report.fetchError,
      },
      sourceMeta: { tool: TOOL_ID, url: input.url, scoreBands, overallBand: input.report.overallBand },
    }));

    this.events.emit({ agencyId: this.agencyId },
      "rank-my-website.capture.handed-off",
      { url: input.url, leadUserId: r.leadUserId, created: r.created });

    return r;
  }
}

// Helper exposed to handlers — turn a service result into a guard
// users (BOS / activity-inbox) can read uniformly.
export function isHandoff<T extends { leadUserId: string }>(
  v: T | { handedOff: false; reason: string },
): v is T {
  return !("handedOff" in v && v.handedOff === false);
}

// Re-exported stable constants.
export { TOOL_ID };
export type { UserId };
