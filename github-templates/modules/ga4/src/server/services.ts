// GA4 service.
//
// Storage layout (per-install — install is per-agency):
//   config                          → Ga4Config
//   cache/touchpoints/<days>        → CacheEntry

import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CacheEntry,
  DailyRow,
  Ga4Config,
  ProvisionalReason,
  TestConnectionResult,
  TouchpointsReport,
  UpdateGa4ConfigInput,
} from "../lib/domain";
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_DAYS,
  MIN_FETCH_GAP_MS,
  parseServiceAccountJson,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  Ga4Port,
  StoragePort,
  VaultPort,
} from "./ports";
import { Ga4ApiError } from "./ports";

const CONFIG_KEY = "config";
const cacheKey = (days: number): string => `cache/touchpoints/${days}`;

export interface Ga4Deps {
  agencyId: AgencyId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  ga4: Ga4Port;
  vault?: VaultPort;
}

export class Ga4Service {
  private readonly agencyId: AgencyId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly ga4: Ga4Port;
  private readonly vault?: VaultPort;

  constructor(deps: Ga4Deps) {
    this.agencyId = deps.agencyId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.ga4 = deps.ga4;
    if (deps.vault) this.vault = deps.vault;
  }

  // ── Config ──────────────────────────────────────────────────

  async getConfig(): Promise<Ga4Config> {
    const row = await this.storage.get<Ga4Config>(CONFIG_KEY);
    if (row) return row;
    return {
      agencyId: this.agencyId,
      defaultDays: DEFAULT_DAYS,
      cacheTtlMs: DEFAULT_CACHE_TTL_MS,
      serviceAccountPresent: await this.checkVault(),
      updatedAt: 0,
    };
  }

  private async checkVault(): Promise<boolean> {
    if (!this.vault) return false;
    const v = await Promise.resolve(this.vault.getServiceAccountJson({ agencyId: this.agencyId }));
    return typeof v === "string" && v.length > 0;
  }

  async updateConfig(input: UpdateGa4ConfigInput, actor: UserId): Promise<Ga4Config> {
    const existing = await this.getConfig();
    const next: Ga4Config = {
      ...existing,
      propertyId: input.propertyId !== undefined ? input.propertyId.replace(/^properties\//, "") : existing.propertyId,
      defaultDays: input.defaultDays ?? existing.defaultDays,
      cacheTtlMs: input.cacheTtlMs ?? existing.cacheTtlMs,
      serviceAccountPresent: await this.checkVault(),
      updatedAt: now(),
    };
    await this.storage.set(CONFIG_KEY, next);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "ga4", action: "ga4.config.updated",
      message: `GA4 config updated (property ${next.propertyId ?? "(unset)"})`,
      metadata: { propertyId: next.propertyId, defaultDays: next.defaultDays },
    });
    this.events.emit({ agencyId: this.agencyId },
      "ga4.config.updated",
      { propertyId: next.propertyId });
    return next;
  }

  // Operator pastes the SA JSON into the settings form; the form
  // POSTs to a handler that calls this. The plugin doesn't store the
  // raw JSON itself — it forwards to the vault.
  async setServiceAccountJson(jsonString: string, actor: UserId): Promise<{ ok: boolean; error?: string }> {
    const parsed = parseServiceAccountJson(jsonString);
    if (!parsed) return { ok: false, error: "service_account_json_invalid" };
    if (!this.vault?.setServiceAccountJson) {
      return { ok: false, error: "vault_not_writable" };
    }
    await Promise.resolve(this.vault.setServiceAccountJson({ agencyId: this.agencyId }, jsonString));
    const cfg = await this.getConfig();
    await this.storage.set(CONFIG_KEY, { ...cfg, serviceAccountPresent: true, updatedAt: now() });
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "ga4", action: "ga4.config.updated",
      message: `GA4 service-account JSON stored (client_email ${parsed.client_email})`,
      metadata: { client_email: parsed.client_email },
    });
    return { ok: true };
  }

  // ── Touchpoints ────────────────────────────────────────────

  async getTouchpoints(daysOpt: number | undefined): Promise<TouchpointsReport> {
    const cfg = await this.getConfig();
    const days = daysOpt ?? cfg.defaultDays;

    if (!cfg.propertyId) {
      return this.placeholder(days, "not_configured", "GA4 property not configured.");
    }
    const saJson = this.vault
      ? await Promise.resolve(this.vault.getServiceAccountJson({ agencyId: this.agencyId }))
      : null;
    const sa = typeof saJson === "string" ? parseServiceAccountJson(saJson) : null;
    if (!sa) {
      return this.placeholder(days, "missing_service_account", "GA4 service account not configured.");
    }

    // Cache lookup.
    const cached = await this.storage.get<CacheEntry>(cacheKey(days));
    const ttl = Math.max(MIN_FETCH_GAP_MS, cfg.cacheTtlMs);
    if (cached && now() - cached.fetchedAt < ttl) {
      this.events.emit({ agencyId: this.agencyId },
        "ga4.report.cached_hit",
        { days, fetchedAt: cached.fetchedAt });
      return { ...cached.report, fromCache: true };
    }

    let result: { rows: DailyRow[]; total: { sessions: number; conversions: number } };
    try {
      result = await this.ga4.runReport({
        propertyId: cfg.propertyId,
        serviceAccount: sa,
        days,
      });
    } catch (e) {
      const kind = e instanceof Ga4ApiError ? e.kind : "other";
      const message = e instanceof Error ? e.message : "unknown_error";
      this.activity.logActivity({
        agencyId: this.agencyId,
        category: "ga4", action: "ga4.report.fetch_error",
        message: `GA4 fetch failed (${kind}): ${message}`,
        metadata: { days, kind },
      });
      this.events.emit({ agencyId: this.agencyId },
        "ga4.report.fetch_error",
        { days, kind, message });
      const cfgUpdated: Ga4Config = { ...cfg, lastError: message, updatedAt: now() };
      await this.storage.set(CONFIG_KEY, cfgUpdated);
      // Return any prior cached report rather than an empty placeholder
      // when available — better than nothing for the founder dashboard.
      if (cached) {
        return { ...cached.report, fromCache: true, error: message };
      }
      return this.placeholder(days, "fetch_error", message);
    }

    const t = now();
    const report: TouchpointsReport = {
      agencyId: this.agencyId,
      propertyId: cfg.propertyId,
      days,
      rows: result.rows,
      total: result.total,
      fetchedAt: t,
      fromCache: false,
    };
    await this.storage.set(cacheKey(days), { fetchedAt: t, report });
    await this.storage.set(CONFIG_KEY, { ...cfg, lastFetchedAt: t, lastError: undefined, updatedAt: t });
    this.activity.logActivity({
      agencyId: this.agencyId,
      category: "ga4", action: "ga4.report.fetched",
      message: `GA4 ${days}d touchpoints fetched: ${report.total.sessions} sessions / ${report.total.conversions} conversions`,
      metadata: { days, total: report.total },
    });
    this.events.emit({ agencyId: this.agencyId },
      "ga4.report.fetched",
      { days, total: report.total });
    return report;
  }

  private placeholder(days: number, _reason: ProvisionalReason, message: string): TouchpointsReport {
    return {
      agencyId: this.agencyId,
      propertyId: "",
      days,
      rows: [],
      total: { sessions: 0, conversions: 0 },
      fetchedAt: now(),
      fromCache: false,
      provisional: true,
      error: message,
    };
  }

  // ── Test connection ────────────────────────────────────────

  async testConnection(actor: UserId): Promise<TestConnectionResult> {
    const cfg = await this.getConfig();
    if (!cfg.propertyId) return { ok: false, message: "GA4 property not configured." };
    const saJson = this.vault
      ? await Promise.resolve(this.vault.getServiceAccountJson({ agencyId: this.agencyId }))
      : null;
    const sa = typeof saJson === "string" ? parseServiceAccountJson(saJson) : null;
    if (!sa) return { ok: false, message: "GA4 service account not configured." };
    let result: { rows: DailyRow[] };
    try {
      result = await this.ga4.runReport({ propertyId: cfg.propertyId, serviceAccount: sa, days: 1 });
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      this.events.emit({ agencyId: this.agencyId },
        "ga4.connection.tested",
        { ok: false, message });
      return { ok: false, message };
    }
    const t = now();
    await this.storage.set(CONFIG_KEY, { ...cfg, lastTestedAt: t, lastError: undefined, updatedAt: t });
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "ga4", action: "ga4.connection.tested",
      message: `GA4 connection test ok (${result.rows.length} rows for today)`,
      metadata: { rows: result.rows.length },
    });
    this.events.emit({ agencyId: this.agencyId },
      "ga4.connection.tested",
      { ok: true, rowsReturned: result.rows.length });
    return { ok: true, rowsReturned: result.rows.length, message: "ok" };
  }
}
