// Monitoring service — produces a `MonitoringSnapshot` for the
// dashboard page + the GET /metrics API. Strategy:
//
//   1. uptime  — read from UptimeStore. If empty (no cron yet), fall
//      back to the fixture row so the page isn't empty during
//      bootstrap.
//   2. errors  — call Sentry's REST API when configured, else fixture.
//   3. slow    — Vercel Analytics REST when token configured, else
//      observability.ts middleware logs (foundation pending), else
//      fixture.
//   4. costs   — provider stubs; v1 always falls back to fixture.
//
// The fallback pattern is deliberate: a v1 install with no creds
// configured still gets a fully-rendered dashboard with clearly
// labelled `live: false` rows so operators see what they'll see
// once each provider is wired.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import {
  buildFixtureSnapshot,
  fixtureTargets,
  type CostRow,
  type ErrorRateRow,
  type MonitoringSnapshot,
  type SlowRouteRow,
  type UptimeRow,
} from "../lib/monitoring";
import {
  fetchPostmarkSpendCents,
  fetchSentryErrorTotals,
  fetchStripeSpendCents,
  fetchVercelSlowRoutes,
  isSentryQueryable,
  isVercelAnalyticsQueryable,
  readProviderEnv,
} from "./providers";
import { UptimeStore } from "./uptimeStore";

export interface MonitoringServiceDeps {
  storage: PluginStorage;
  // Per-install creds — read off install.config by the caller.
  installConfig?: {
    stripeSecretKey?: string;
    postmarkServerToken?: string;
  };
  now?: () => number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export class MonitoringService {
  private uptimeStore: UptimeStore;
  private now: () => number;

  constructor(private deps: MonitoringServiceDeps) {
    this.uptimeStore = new UptimeStore(deps.storage);
    this.now = deps.now ?? (() => Date.now());
  }

  async snapshot(): Promise<MonitoringSnapshot> {
    const now = this.now();
    const fixture = buildFixtureSnapshot(now);
    const env = readProviderEnv();
    const installConfig = this.deps.installConfig ?? {};

    const [uptime, errorRate, slowRoutes, costs] = await Promise.all([
      this.collectUptime(now, fixture.uptime),
      this.collectErrorRate(env, fixture.errorRate),
      this.collectSlowRoutes(env, fixture.slowRoutes),
      this.collectCosts(installConfig, fixture.costs),
    ]);

    return { generatedAt: now, uptime, errorRate, slowRoutes, costs };
  }

  private async collectUptime(now: number, fixtureRows: UptimeRow[]): Promise<UptimeRow[]> {
    const targets = fixtureTargets();
    const out: UptimeRow[] = [];
    for (const target of targets) {
      const last = await this.uptimeStore.last(target.id);
      const uptime24h = await this.uptimeStore.uptimePctSince(target.id, now - ONE_DAY_MS);
      const avgLatencyMs = await this.uptimeStore.avgLatencySince(target.id, now - ONE_DAY_MS);
      if (last === null && uptime24h === null) {
        // No samples yet — fall back to fixture for this target.
        const fixtureRow = fixtureRows.find((r) => r.target.id === target.id);
        if (fixtureRow) {
          out.push(fixtureRow);
          continue;
        }
      }
      out.push({ target, uptime24h, lastSample: last, avgLatencyMs });
    }
    return out;
  }

  private async collectErrorRate(
    env: ReturnType<typeof readProviderEnv>,
    fixtureRows: ErrorRateRow[],
  ): Promise<ErrorRateRow[]> {
    if (!isSentryQueryable(env)) return fixtureRows;
    const live = await fetchSentryErrorTotals(env, ONE_DAY_MS);
    if (!live) return fixtureRows;
    return fixtureRows.map((row, i) => ({
      ...row,
      perMinute: i === 0 ? live.perMinute : row.perMinute,
      total24h: i === 0 ? live.total : row.total24h,
    }));
  }

  private async collectSlowRoutes(
    env: ReturnType<typeof readProviderEnv>,
    fixtureRows: SlowRouteRow[],
  ): Promise<SlowRouteRow[]> {
    if (!isVercelAnalyticsQueryable(env)) return fixtureRows;
    const live = await fetchVercelSlowRoutes(env);
    if (!live) return fixtureRows;
    return live.map((r) => ({ ...r, source: "vercel-analytics" as const }));
  }

  private async collectCosts(
    installConfig: NonNullable<MonitoringServiceDeps["installConfig"]>,
    fixtureRows: CostRow[],
  ): Promise<CostRow[]> {
    const out = [...fixtureRows];
    const stripe = await fetchStripeSpendCents(installConfig.stripeSecretKey, ONE_HOUR_MS);
    if (stripe) {
      const idx = out.findIndex((r) => r.provider === "stripe");
      if (idx >= 0) out[idx] = { ...out[idx]!, mtdCents: stripe.mtdCents, prevMonthCents: stripe.prevMonthCents, live: true };
    }
    const postmark = await fetchPostmarkSpendCents(installConfig.postmarkServerToken, ONE_HOUR_MS);
    if (postmark) {
      const idx = out.findIndex((r) => r.provider === "postmark");
      if (idx >= 0) out[idx] = { ...out[idx]!, mtdCents: postmark.mtdCents, prevMonthCents: postmark.prevMonthCents, live: true };
    }
    return out;
  }

  async appendUptimeSample(targetId: string, sample: { ok: boolean; latencyMs?: number; status?: number; error?: string }): Promise<void> {
    await this.uptimeStore.append(targetId, { ts: this.now(), ...sample });
  }
}
