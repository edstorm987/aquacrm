// Monitoring domain types — production health snapshot. Keep this
// pure-data so the page (server-rendered) and the smoke (node-only)
// can both consume it without touching React or the Next runtime.

export type DeploymentEnv = "production" | "preview" | "development";

export interface DeploymentTarget {
  // The shared portal is "shared"; per-Live-client portals carry the
  // client slug (e.g. "luv-and-ker", "compass-coaching"). Each ships
  // as its own Vercel project so each gets its own row.
  id: string;
  label: string;
  env: DeploymentEnv;
  url: string;
  // Set when this deployment carries a custom domain (R2's
  // @aqua/plugin-domains attached). Surfaced as a sub-line.
  customDomain?: string;
}

export interface UptimeSample {
  ts: number;
  ok: boolean;
  latencyMs?: number;
  status?: number;
  error?: string;
}

export interface UptimeRow {
  target: DeploymentTarget;
  // Uptime % over the last 24h window (0–100). null when no samples.
  uptime24h: number | null;
  // Most recent sample. null when never sampled.
  lastSample: UptimeSample | null;
  // 90d average latency in ms. null when no samples.
  avgLatencyMs: number | null;
}

export interface ErrorRateRow {
  target: DeploymentTarget;
  // Errors per minute over the last 60min window. null when Sentry
  // not configured for this deployment.
  perMinute: number | null;
  // Total Sentry events in the last 24h. null when Sentry not configured.
  total24h: number | null;
  // Issue-level top-3 by event count. null when not configured.
  topIssues:
    | Array<{ id: string; title: string; count: number; firstSeen: number }>
    | null;
}

export interface SlowRouteRow {
  // Pathname (e.g. "/portal/clients/[clientId]/orders").
  path: string;
  // p95 latency in ms.
  p95Ms: number;
  // Sample count in the window.
  samples: number;
  // Source — Vercel Analytics when available, falls back to local
  // `withApiObservability` logs when Vercel Analytics isn't toggled
  // on. The cell shows the source so operators can tell which.
  source: "vercel-analytics" | "local-middleware" | "fixture";
}

export interface CostRow {
  provider: "stripe" | "postmark" | "vercel" | "sentry";
  label: string;
  // Month-to-date spend in cents. null when provider creds not set.
  mtdCents: number | null;
  // Previous full month for delta context. null when not configured.
  prevMonthCents: number | null;
  // Currency, default USD.
  currency: string;
  // True when the figure was read from a real API call. False when
  // returned from the fixture stub.
  live: boolean;
}

export interface MonitoringSnapshot {
  generatedAt: number;
  uptime: UptimeRow[];
  errorRate: ErrorRateRow[];
  slowRoutes: SlowRouteRow[];
  costs: CostRow[];
}

// ── Fixture data — used when no provider creds configured ────────────

const FIXTURE_TARGETS: DeploymentTarget[] = [
  {
    id: "shared-portal",
    label: "Shared portal (milesymedia.com)",
    env: "production",
    url: "https://milesymedia.com",
    customDomain: "milesymedia.com",
  },
  {
    id: "luv-and-ker",
    label: "Luv & Ker (per-client)",
    env: "production",
    url: "https://luvandker.com",
    customDomain: "luvandker.com",
  },
  {
    id: "compass-coaching",
    label: "Compass Coaching (per-client)",
    env: "production",
    url: "https://compasscoaching.com",
    customDomain: "compasscoaching.com",
  },
];

export function buildFixtureSnapshot(now: number = Date.now()): MonitoringSnapshot {
  return {
    generatedAt: now,
    uptime: FIXTURE_TARGETS.map((target, i) => ({
      target,
      uptime24h: 100 - i * 0.04,
      lastSample: {
        ts: now - 60_000 - i * 9_000,
        ok: true,
        latencyMs: 220 + i * 35,
        status: 200,
      },
      avgLatencyMs: 240 + i * 30,
    })),
    errorRate: FIXTURE_TARGETS.map((target, i) => ({
      target,
      perMinute: i === 0 ? 0.12 : 0.03,
      total24h: i === 0 ? 173 : 41 - i * 4,
      topIssues:
        i === 0
          ? [
              { id: "AQ-431", title: "TypeError: Cannot read 'map' of undefined", count: 47, firstSeen: now - 9 * 3600_000 },
              { id: "AQ-417", title: "Stripe: webhook signature mismatch (test mode)", count: 22, firstSeen: now - 36 * 3600_000 },
              { id: "AQ-402", title: "Postmark: 401 unauthorized (rotating key)", count: 8, firstSeen: now - 6 * 3600_000 },
            ]
          : [],
    })),
    slowRoutes: [
      { path: "/portal/agency/affiliates/leaderboard", p95Ms: 1842, samples: 218, source: "fixture" },
      { path: "/api/portal/ai-builder/generate", p95Ms: 1604, samples: 143, source: "fixture" },
      { path: "/portal/clients/[clientId]/orders", p95Ms: 1320, samples: 901, source: "fixture" },
      { path: "/portal/clients/[clientId]/website-editor/[pageId]", p95Ms: 1188, samples: 372, source: "fixture" },
      { path: "/api/portal/forms/submit", p95Ms: 980, samples: 1450, source: "fixture" },
    ],
    costs: [
      { provider: "vercel", label: "Vercel — Pro plan + bandwidth", mtdCents: 2400, prevMonthCents: 2000, currency: "USD", live: false },
      { provider: "stripe", label: "Stripe — fees on platform charges", mtdCents: 17_842, prevMonthCents: 14_310, currency: "USD", live: false },
      { provider: "postmark", label: "Postmark — outbound email", mtdCents: 1_500, prevMonthCents: 1_500, currency: "USD", live: false },
      { provider: "sentry", label: "Sentry — events ingested", mtdCents: 2_900, prevMonthCents: 2_900, currency: "USD", live: false },
    ],
  };
}

export function fixtureTargets(): DeploymentTarget[] {
  return FIXTURE_TARGETS.map((t) => ({ ...t }));
}

// ── Pure formatters used by the dashboard + smoke ──────────────────

export function formatUptime(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct.toFixed(2)}%`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return `${Math.round(ms)} ms`;
}

export function formatMoney(cents: number | null, currency = "USD"): string {
  if (cents === null) return "—";
  const n = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
  return n;
}

export function deltaPct(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
