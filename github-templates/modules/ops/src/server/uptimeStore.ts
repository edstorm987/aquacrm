// Uptime sample store — uses the foundation `PluginStorage` port so
// samples persist across deploys. Keys are namespaced under
// `uptime/<targetId>/<ts>`. The cron job (foundation pending —
// `ops.healthcheckCron` per chapter §4) hits `/healthz` for each
// target hourly and appends a sample here.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { UptimeSample } from "../lib/monitoring";

const KEY_PREFIX = "uptime/";
// 24h sample window = 24 hourly samples. Older samples expire on next
// write to keep storage bounded.
const WINDOW_MS = 24 * 60 * 60 * 1000;

export class UptimeStore {
  constructor(private storage: PluginStorage) {}

  async append(targetId: string, sample: UptimeSample): Promise<void> {
    const key = `${KEY_PREFIX}${targetId}/${sample.ts}`;
    await this.storage.set(key, sample);
    await this.expireOlderThan(targetId, sample.ts - WINDOW_MS);
  }

  async list(targetId: string): Promise<UptimeSample[]> {
    const prefix = `${KEY_PREFIX}${targetId}/`;
    const keys = await this.storage.list(prefix);
    const out: UptimeSample[] = [];
    for (const k of keys) {
      const v = await this.storage.get<UptimeSample>(k);
      if (v) out.push(v);
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }

  async last(targetId: string): Promise<UptimeSample | null> {
    const all = await this.list(targetId);
    return all.length > 0 ? (all[all.length - 1] ?? null) : null;
  }

  async uptimePctSince(targetId: string, sinceMs: number): Promise<number | null> {
    const all = (await this.list(targetId)).filter((s) => s.ts >= sinceMs);
    if (all.length === 0) return null;
    const ok = all.filter((s) => s.ok).length;
    return (ok / all.length) * 100;
  }

  async avgLatencySince(targetId: string, sinceMs: number): Promise<number | null> {
    const all = (await this.list(targetId)).filter((s) => s.ts >= sinceMs && typeof s.latencyMs === "number");
    if (all.length === 0) return null;
    const sum = all.reduce((acc, s) => acc + (s.latencyMs ?? 0), 0);
    return sum / all.length;
  }

  private async expireOlderThan(targetId: string, threshold: number): Promise<void> {
    const prefix = `${KEY_PREFIX}${targetId}/`;
    const keys = await this.storage.list(prefix);
    for (const k of keys) {
      const ts = Number(k.slice(prefix.length));
      if (Number.isFinite(ts) && ts < threshold) {
        await this.storage.del(k);
      }
    }
  }
}
