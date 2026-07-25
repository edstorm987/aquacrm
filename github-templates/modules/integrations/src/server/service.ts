// Integrations services — IntegrationService + WebhookLogService.
//
// Storage layout (per install scope — agency, or agency+client):
//   integrations/index            → string[] of integration ids
//   integrations/by-id/<id>       → Integration
//   integrations/webhooks/log     → WebhookLogEntry[] (ring-buffer; bounded MAX_LOG_ENTRIES)
//
// scopePolicy: "either". When constructed at agency scope, clientId
// is undefined and only matches agency-scope rows. At client scope,
// clientId is set and matches per-client rows. The two install scopes
// are isolated: an agency-scope IntegrationService never sees a
// client-scope integration even though both share the same agencyId,
// because the inScope check additionally compares clientId.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateIntegrationInput,
  Integration,
  IntegrationFilter,
  IntegrationKind,
  IntegrationStatus,
  UpdateIntegrationPatch,
  VerifyResult,
  WebhookLogEntry,
} from "../lib/domain";
import {
  INTEGRATION_KINDS,
  KIND_CONFIG_SHAPES,
  MAX_LOG_ENTRIES,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "integrations/index";
const integrationKey = (id: string): string => `integrations/by-id/${id}`;
const WEBHOOK_LOG_KEY = "integrations/webhooks/log";

export class IntegrationNotFoundError extends Error {
  constructor(message = "integrations: not found") { super(message); this.name = "IntegrationNotFoundError"; }
}

export interface IntegrationsServiceDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

abstract class BaseService {
  protected agencyId: AgencyId;
  protected clientId?: ClientId;
  protected storage: StoragePort;
  protected activity: ActivityLogPort;
  protected events: EventBusPort;

  constructor(deps: IntegrationsServiceDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
  }

  protected scopeMatches(row: { agencyId: AgencyId; clientId?: ClientId }): boolean {
    if (row.agencyId !== this.agencyId) return false;
    return row.clientId === this.clientId;
  }

  protected scopeForEvent(): { agencyId: AgencyId; clientId?: ClientId } {
    return { agencyId: this.agencyId, clientId: this.clientId };
  }
}

export class IntegrationService extends BaseService {
  async create(actor: UserId, input: CreateIntegrationInput): Promise<Integration> {
    if (!input.label.trim()) throw new Error("integrations: label required");
    if (!INTEGRATION_KINDS.includes(input.kind)) throw new Error("integrations: invalid kind");
    const t = now();
    // Status starts at "intended"; if a credentialsRef was supplied
    // at create-time we promote to "configured" so the operator
    // doesn't have to do a follow-up update just to flip the chip.
    const status: IntegrationStatus = input.credentialsRef ? "configured" : "intended";
    const r: Integration = {
      id: makeId("int"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      kind: input.kind,
      label: input.label.trim(),
      status,
      config: input.config ?? {},
      credentialsRef: input.credentialsRef,
      createdBy: actor,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(integrationKey(r.id), r);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(r.id)) await this.storage.set(INDEX_KEY, [...ids, r.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "integrations.integration.created",
      message: `Integration ${r.label} (${r.kind}) created — status ${status}`,
      metadata: { integrationId: r.id, kind: r.kind, status },
    });
    this.events.emit(this.scopeForEvent(), "integrations.integration.created", { id: r.id, kind: r.kind });
    if (status === "configured") {
      this.events.emit(this.scopeForEvent(), "integrations.integration.configured", { id: r.id });
    }
    return r;
  }

  async update(actor: UserId, id: string, patch: UpdateIntegrationPatch): Promise<Integration> {
    const cur = await this.storage.get<Integration>(integrationKey(id));
    if (!cur || !this.scopeMatches(cur)) throw new IntegrationNotFoundError();
    const t = now();
    let credentialsRef = cur.credentialsRef;
    if (patch.credentialsRef === null) credentialsRef = undefined;
    else if (patch.credentialsRef !== undefined) credentialsRef = patch.credentialsRef;
    const next: Integration = {
      ...cur,
      label: patch.label?.trim() || cur.label,
      config: patch.config ? { ...cur.config, ...patch.config } : cur.config,
      credentialsRef,
      updatedAt: t,
    };
    // Auto-promote intended→configured on the unset→set credentialsRef
    // transition. Auto-demote configured→intended when cleared. Don't
    // touch verified/failed — those reflect a verify run and should
    // only be replaced by another verify call.
    if (next.status === "intended" && credentialsRef) next.status = "configured";
    else if (next.status === "configured" && !credentialsRef) next.status = "intended";
    await this.storage.set(integrationKey(id), next);
    if (cur.status !== next.status && next.status === "configured") {
      this.events.emit(this.scopeForEvent(), "integrations.integration.configured", { id });
    }
    this.events.emit(this.scopeForEvent(), "integrations.integration.updated", { id });
    return next;
  }

  // Manual verify. Caller passes a VerifyResult — the plugin doesn't
  // attempt the network call itself in v1 (T6 wires real verifiers
  // per kind). Stamps lastVerifiedAt + transitions status; clears
  // lastError on success or sets it on failure.
  async verify(actor: UserId, id: string, result: VerifyResult): Promise<Integration> {
    const cur = await this.storage.get<Integration>(integrationKey(id));
    if (!cur || !this.scopeMatches(cur)) throw new IntegrationNotFoundError();
    const t = now();
    const next: Integration = {
      ...cur,
      status: result.ok ? "verified" : "failed",
      lastVerifiedAt: t,
      lastError: result.ok ? undefined : (result.message ?? "verify failed"),
      updatedAt: t,
    };
    await this.storage.set(integrationKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings",
      action: result.ok ? "integrations.integration.verified" : "integrations.integration.failed",
      message: result.ok
        ? `Integration ${cur.label} verified`
        : `Integration ${cur.label} failed verify: ${result.message ?? ""}`,
      metadata: { integrationId: id },
    });
    this.events.emit(this.scopeForEvent(),
      result.ok ? "integrations.integration.verified" : "integrations.integration.failed",
      { id, message: result.message });
    return next;
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.storage.get<Integration>(integrationKey(id));
    if (!cur || !this.scopeMatches(cur)) throw new IntegrationNotFoundError();
    await this.storage.del(integrationKey(id));
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const next = ids.filter(x => x !== id);
    if (next.length !== ids.length) await this.storage.set(INDEX_KEY, next);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "integrations.integration.deleted",
      message: `Integration ${cur.label} deleted`,
      metadata: { integrationId: id },
    });
    this.events.emit(this.scopeForEvent(), "integrations.integration.deleted", { id });
  }

  async get(id: string): Promise<Integration | null> {
    const cur = await this.storage.get<Integration>(integrationKey(id));
    return cur && this.scopeMatches(cur) ? cur : null;
  }

  async list(filter: IntegrationFilter = {}): Promise<Integration[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Integration[] = [];
    for (const id of ids) {
      const r = await this.storage.get<Integration>(integrationKey(id));
      if (!r || !this.scopeMatches(r)) continue;
      if (filter.kind && r.kind !== filter.kind) continue;
      if (filter.status && r.status !== filter.status) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  static configShapeFor(kind: IntegrationKind) {
    return KIND_CONFIG_SHAPES[kind];
  }
}

// ---------- WebhookLogService ----------
//
// Bounded ring-buffer of recent webhook entries. Real receivers wire
// in T6; v1 exists so the operator has somewhere to record outbound
// pings + future incoming bodies once the receiver lands.
export class WebhookLogService extends BaseService {
  private async loadAll(): Promise<WebhookLogEntry[]> {
    return (await this.storage.get<WebhookLogEntry[]>(WEBHOOK_LOG_KEY)) ?? [];
  }
  private async saveAll(rows: WebhookLogEntry[]): Promise<void> {
    await this.storage.set(WEBHOOK_LOG_KEY, rows);
  }

  async append(entry: Omit<WebhookLogEntry, "id" | "ts" | "agencyId" | "clientId">): Promise<WebhookLogEntry> {
    const rows = await this.loadAll();
    const row: WebhookLogEntry = {
      id: makeId("wh"),
      agencyId: this.agencyId, clientId: this.clientId,
      ts: now(),
      ...entry,
    };
    rows.push(row);
    // Drop oldest when over cap. Filter to current scope only when
    // measuring count so a chatty agency-scope log doesn't evict
    // client-scope entries (and vice versa).
    const inScope = rows.filter(r => r.agencyId === this.agencyId && r.clientId === this.clientId);
    while (inScope.length > MAX_LOG_ENTRIES) {
      const dropId = inScope.shift()!.id;
      const idx = rows.findIndex(r => r.id === dropId);
      if (idx >= 0) rows.splice(idx, 1);
    }
    await this.saveAll(rows);
    this.events.emit(this.scopeForEvent(),
      row.direction === "incoming" ? "integrations.webhook.incoming" : "integrations.webhook.outgoing",
      { id: row.id, integrationId: row.integrationId, ok: row.ok });
    return row;
  }

  async list(filter: { integrationId?: string; direction?: "incoming" | "outgoing" } = {}): Promise<WebhookLogEntry[]> {
    const rows = await this.loadAll();
    return rows
      .filter(r => r.agencyId === this.agencyId && r.clientId === this.clientId)
      .filter(r => !filter.integrationId || r.integrationId === filter.integrationId)
      .filter(r => !filter.direction    || r.direction    === filter.direction)
      .sort((a, b) => b.ts - a.ts);
  }

  // Outgoing test ping. Doesn't actually fetch — records intent for
  // auditing. Real outbound HTTP wires in T6.
  async ping(actor: UserId, integrationId: string, opts: { url?: string } = {}): Promise<WebhookLogEntry> {
    const row = await this.append({
      integrationId, direction: "outgoing", ok: true,
      url: opts.url, method: "POST",
      bodyPreview: "{\"type\":\"ping\",\"source\":\"@aqua/plugin-integrations\"}",
    });
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "integrations.webhook.outgoing",
      message: `Outgoing ping for integration ${integrationId}`,
      metadata: { logId: row.id, integrationId },
    });
    return row;
  }
}
