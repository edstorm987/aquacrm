// Orchestrator for the domain attach/verify/remove lifecycle.
//
// Wraps DomainStore + the Vercel REST client + the foundation's
// activity log + event bus. Handlers in src/api/handlers.ts call this;
// onInstall + healthcheck in the manifest also reach in here for setup
// state.
//
// Token resolution: env (`VERCEL_TOKEN`) is the v1 source. Returning
// a clear "not-configured" error when the token is missing keeps the
// manual-DNS runbook viable — operators can still record the hostname
// in the portal, copy DNS instructions from the chapter, and verify
// later when the env is set. Per-install token override (rotatable
// per agency/client) is foundation-pending — when foundation lands
// per-install secret storage we add a `tokenOverride` field on the
// install config.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  AttachDomainInput,
  DomainListFilter,
  DomainRecord,
  DomainStatus,
} from "../lib/domain";
import { normaliseHostname } from "../lib/domain";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import { DomainStore } from "./domainStore";
import {
  type AttachDomainResult,
  type VercelClientConfig,
  attachDomain as vercelAttach,
  verifyDomain as vercelVerify,
  removeDomain as vercelRemove,
  readEnvToken,
  readEnvTeamId,
  isConfigured,
} from "./vercelClient";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
} from "./ports";

export interface DomainServiceContext {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  pluginInstalls: PluginInstallStorePort;
}

export interface AttachServiceResult {
  ok: boolean;
  configured: boolean;
  domain?: DomainRecord;
  pending: AttachDomainResult["pending"];
  error?: string;
}

export interface VerifyServiceResult {
  ok: boolean;
  configured: boolean;
  domain?: DomainRecord;
  pending: AttachDomainResult["pending"];
  error?: string;
}

export class DomainService {
  private store: DomainStore;

  constructor(private ctx: DomainServiceContext) {
    this.store = new DomainStore(ctx.storage);
  }

  isConfigured(): boolean {
    return isConfigured();
  }

  list(): Promise<DomainRecord[]> {
    const filter: DomainListFilter = {
      agencyId: this.ctx.agencyId,
      ...(this.ctx.clientId !== undefined ? { clientId: this.ctx.clientId } : {}),
    };
    return this.store.list(filter);
  }

  getById(id: string): Promise<DomainRecord | null> {
    return this.store.getById(id);
  }

  async attach(input: AttachDomainInput, actor?: UserId): Promise<AttachServiceResult> {
    const hostname = normaliseHostname(input.hostname);
    if (!hostname) {
      return { ok: false, configured: this.isConfigured(), pending: [], error: "missing-hostname" };
    }
    if (!input.vercelProjectId) {
      return { ok: false, configured: this.isConfigured(), pending: [], error: "missing-vercel-project-id" };
    }

    // Persist a record up front — even when Vercel call fails, the
    // operator can see the intent + retry verify later. Status starts
    // "pending"; updates ride through Vercel's response.
    const record = await this.store.create({
      agencyId: this.ctx.agencyId,
      clientId: this.ctx.clientId,
      hostname,
      vercelProjectId: input.vercelProjectId,
      vercelTeamId: input.vercelTeamId ?? readEnvTeamId(),
      attachedBy: actor,
    });

    this.ctx.events.emit(
      { agencyId: this.ctx.agencyId, clientId: this.ctx.clientId },
      "domain.attach.requested",
      { domainId: record.id, hostname, vercelProjectId: record.vercelProjectId },
    );

    const token = readEnvToken();
    if (!token) {
      // Persist the not-configured fact + return a clear error. The
      // record stays in "pending" so a later verify (after env is set)
      // can transition it.
      await this.store.updateStatus(record.id, {
        status: "pending",
        lastError: "vercel-token-not-configured",
        lastCheckedAt: now(),
      });
      this.logActivity(
        actor,
        "domain.attach.skipped",
        `Captured ${hostname} for project ${record.vercelProjectId}; VERCEL_TOKEN unset, no API call made.`,
      );
      return {
        ok: false,
        configured: false,
        domain: (await this.store.getById(record.id)) ?? record,
        pending: [],
        error: "vercel-token-not-configured",
      };
    }

    const cfg: VercelClientConfig = {
      token,
      projectId: record.vercelProjectId,
      ...(record.vercelTeamId ? { teamId: record.vercelTeamId } : {}),
    };
    const result = await vercelAttach(cfg, hostname);
    const status: DomainStatus = result.ok ? (result.verified ? "verified" : "pending") : "error";
    const updated = (await this.store.updateStatus(record.id, {
      status,
      pending: result.pending,
      lastError: result.error,
      lastCheckedAt: now(),
    })) ?? record;

    if (result.ok) {
      this.ctx.events.emit(
        { agencyId: this.ctx.agencyId, clientId: this.ctx.clientId },
        result.verified ? "domain.verified" : "domain.attached",
        { domainId: updated.id, hostname, verified: result.verified, pending: result.pending },
      );
      this.logActivity(
        actor,
        "domain.attach",
        `Attached ${hostname} to Vercel project ${record.vercelProjectId}${result.verified ? " (verified)" : " (DNS pending)"}.`,
      );
    } else {
      this.ctx.events.emit(
        { agencyId: this.ctx.agencyId, clientId: this.ctx.clientId },
        "domain.attach.failed",
        { domainId: updated.id, hostname, error: result.error },
      );
      this.logActivity(
        actor,
        "domain.attach.failed",
        `Failed to attach ${hostname}: ${result.error ?? "unknown"}.`,
      );
    }

    return {
      ok: result.ok,
      configured: true,
      domain: updated,
      pending: result.pending,
      error: result.error,
    };
  }

  async verify(id: string, actor?: UserId): Promise<VerifyServiceResult> {
    const record = await this.store.getById(id);
    if (!record) {
      return { ok: false, configured: this.isConfigured(), pending: [], error: "not-found" };
    }
    const token = readEnvToken();
    if (!token) {
      await this.store.updateStatus(id, {
        lastError: "vercel-token-not-configured",
        lastCheckedAt: now(),
      });
      return {
        ok: false,
        configured: false,
        domain: (await this.store.getById(id)) ?? record,
        pending: record.pending,
        error: "vercel-token-not-configured",
      };
    }
    const cfg: VercelClientConfig = {
      token,
      projectId: record.vercelProjectId,
      ...(record.vercelTeamId ? { teamId: record.vercelTeamId } : {}),
    };
    const result = await vercelVerify(cfg, record.hostname);
    const status: DomainStatus = result.ok ? (result.verified ? "verified" : "pending") : "error";
    const updated = (await this.store.updateStatus(id, {
      status,
      pending: result.pending,
      lastError: result.error,
      lastCheckedAt: now(),
    })) ?? record;
    if (result.ok && result.verified) {
      this.ctx.events.emit(
        { agencyId: this.ctx.agencyId, clientId: this.ctx.clientId },
        "domain.verified",
        { domainId: id, hostname: record.hostname },
      );
      this.logActivity(actor, "domain.verify", `Verified ${record.hostname}.`);
    } else if (!result.ok) {
      this.ctx.events.emit(
        { agencyId: this.ctx.agencyId, clientId: this.ctx.clientId },
        "domain.verify.failed",
        { domainId: id, hostname: record.hostname, error: result.error },
      );
    }
    return {
      ok: result.ok,
      configured: true,
      domain: updated,
      pending: result.pending,
      error: result.error,
    };
  }

  async remove(id: string, actor?: UserId): Promise<{ ok: boolean; error?: string }> {
    const record = await this.store.getById(id);
    if (!record) return { ok: false, error: "not-found" };
    const token = readEnvToken();
    // If env is unset, drop the local record but skip the Vercel call —
    // the runbook covers the manual delete-from-Vercel-UI path.
    if (token) {
      const cfg: VercelClientConfig = {
        token,
        projectId: record.vercelProjectId,
        ...(record.vercelTeamId ? { teamId: record.vercelTeamId } : {}),
      };
      const result = await vercelRemove(cfg, record.hostname);
      if (!result.ok) {
        // Don't drop the record on remote failure — operator should
        // resolve via the runbook and retry.
        this.logActivity(
          actor,
          "domain.remove.failed",
          `Vercel rejected remove of ${record.hostname}: ${result.error ?? "unknown"}.`,
        );
        return result;
      }
    }
    await this.store.delete(id);
    this.ctx.events.emit(
      { agencyId: this.ctx.agencyId, clientId: this.ctx.clientId },
      "domain.removed",
      { domainId: id, hostname: record.hostname },
    );
    this.logActivity(actor, "domain.remove", `Removed ${record.hostname}.`);
    return { ok: true };
  }

  private logActivity(actor: UserId | undefined, action: string, message: string): void {
    void this.ctx.activity.logActivity({
      agencyId: this.ctx.agencyId,
      ...(this.ctx.clientId !== undefined ? { clientId: this.ctx.clientId } : {}),
      ...(actor !== undefined ? { actorUserId: actor } : {}),
      category: "domains",
      action,
      message,
    });
  }
}
