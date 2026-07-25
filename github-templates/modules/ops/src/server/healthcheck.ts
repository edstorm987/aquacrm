// Healthcheck poller — used by the cron (foundation pending) to ping
// each deployment target's `/healthz` endpoint and append a sample to
// UptimeStore. Pure-Node fetch; aborts after `timeoutMs`. Caller is
// expected to handle scheduling (Vercel cron block in vercel.json or
// an external scheduler — see runbook §8).

import { fixtureTargets, type DeploymentTarget } from "../lib/monitoring";
import type { MonitoringService } from "./monitoringService";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface HealthcheckOptions {
  timeoutMs?: number;
  // Override targets for tests / per-install topology.
  targets?: DeploymentTarget[];
}

export interface HealthcheckResult {
  targetId: string;
  ok: boolean;
  latencyMs?: number;
  status?: number;
  error?: string;
}

export async function runHealthcheckPass(
  service: MonitoringService,
  opts: HealthcheckOptions = {},
): Promise<HealthcheckResult[]> {
  const targets = opts.targets ?? fixtureTargets();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const out: HealthcheckResult[] = [];
  for (const target of targets) {
    const result = await pingOne(target, timeoutMs);
    const sample: { ok: boolean; latencyMs?: number; status?: number; error?: string } = { ok: result.ok };
    if (result.latencyMs !== undefined) sample.latencyMs = result.latencyMs;
    if (result.status !== undefined) sample.status = result.status;
    if (result.error !== undefined) sample.error = result.error;
    await service.appendUptimeSample(target.id, sample);
    out.push(result);
  }
  return out;
}

async function pingOne(target: DeploymentTarget, timeoutMs: number): Promise<HealthcheckResult> {
  const url = `${target.url.replace(/\/+$/, "")}/healthz`;
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const latencyMs = Date.now() - start;
    const result: HealthcheckResult = {
      targetId: target.id,
      ok: res.ok,
      latencyMs,
      status: res.status,
    };
    if (!res.ok) result.error = `HTTP ${res.status}`;
    return result;
  } catch (err) {
    return {
      targetId: target.id,
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "fetch-failed",
    };
  } finally {
    clearTimeout(t);
  }
}
