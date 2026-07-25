// DomainAttachService — intent + status state machine. Production
// DNS verification is a TODO for T6; this service is the *control
// plane* that records intent and surfaces the records the client
// needs to set on their registrar.
//
// Storage layout (per-install, client-scoped):
//   attaches/index            → string[] of attach ids
//   attaches/by-id/<id>       → DomainAttach
//   attaches/by-host/<host>   → string (attach id, lowercase hostname)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateDomainAttachInput,
  DomainAttach,
  DomainStatus,
  NsRecord,
  UpdateDomainAttachPatch,
} from "../lib/domain";
import {
  defaultNsRecords,
  isValidHostname,
  normaliseHostname,
  STATUS_TRANSITIONS,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "attaches/index";
const attachKey = (id: string): string => `attaches/by-id/${id}`;
const hostKey = (host: string): string => `attaches/by-host/${host}`;

export class DomainAttachConflictError extends Error {
  constructor(message: string) { super(message); this.name = "DomainAttachConflictError"; }
}
export class DomainAttachNotFoundError extends Error {
  constructor(message = "agency-domains: not found") { super(message); this.name = "DomainAttachNotFoundError"; }
}
export class InvalidStatusTransitionError extends Error {
  constructor(public from: DomainStatus, public to: DomainStatus) {
    super(`agency-domains: cannot transition ${from} → ${to}`);
    this.name = "InvalidStatusTransitionError";
  }
}

export class DomainAttachService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(d: DomainAttach): boolean {
    return d.agencyId === this.agencyId && d.clientId === this.clientId;
  }

  async list(): Promise<DomainAttach[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: DomainAttach[] = [];
    for (const id of ids) {
      const d = await this.storage.get<DomainAttach>(attachKey(id));
      if (d && this.inScope(d)) out.push(d);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<DomainAttach | null> {
    const d = await this.storage.get<DomainAttach>(attachKey(id));
    return d && this.inScope(d) ? d : null;
  }

  async getByHost(hostname: string): Promise<DomainAttach | null> {
    const id = await this.storage.get<string>(hostKey(normaliseHostname(hostname)));
    if (!id) return null;
    return this.get(id);
  }

  async create(actor: UserId, input: CreateDomainAttachInput): Promise<DomainAttach> {
    const host = normaliseHostname(input.hostname);
    if (!isValidHostname(host)) throw new Error("agency-domains: invalid hostname");

    // Conflict — only one attach per hostname per (agency, client).
    const existing = await this.storage.get<string>(hostKey(host));
    if (existing) {
      throw new DomainAttachConflictError(`hostname already attached: ${host}`);
    }

    const t = now();
    const attach: DomainAttach = {
      id: makeId("dom"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      hostname: host,
      status: "pending",
      nsRecords: input.nsRecords ?? defaultNsRecords(host),
      createdBy: actor,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(attachKey(attach.id), attach);
    await this.storage.set(hostKey(host), attach.id);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(attach.id)) await this.storage.set(INDEX_KEY, [...ids, attach.id]);

    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "agency-domains.attach.created",
      message: `Custom-domain attach intent recorded: ${host}`,
      metadata: { attachId: attach.id, hostname: host },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "agency-domains.attach.created", { id: attach.id, hostname: host });
    return attach;
  }

  async update(actor: UserId, id: string, patch: UpdateDomainAttachPatch): Promise<DomainAttach> {
    const cur = await this.get(id);
    if (!cur) throw new DomainAttachNotFoundError();
    let nextHost = cur.hostname;
    if (patch.hostname) {
      nextHost = normaliseHostname(patch.hostname);
      if (!isValidHostname(nextHost)) throw new Error("agency-domains: invalid hostname");
      if (nextHost !== cur.hostname) {
        const dupe = await this.storage.get<string>(hostKey(nextHost));
        if (dupe && dupe !== cur.id) throw new DomainAttachConflictError(`hostname already attached: ${nextHost}`);
        await this.storage.del(hostKey(cur.hostname));
        await this.storage.set(hostKey(nextHost), cur.id);
      }
    }
    const next: DomainAttach = {
      ...cur,
      hostname: nextHost,
      nsRecords: patch.nsRecords ?? cur.nsRecords,
      updatedAt: now(),
    };
    await this.storage.set(attachKey(id), next);
    return next;
  }

  // Status transition — guarded by STATUS_TRANSITIONS. Active sets
  // `verifiedAt`; failed records `lastError` (when supplied).
  async transition(actor: UserId, id: string, to: DomainStatus, lastError?: string): Promise<DomainAttach> {
    const cur = await this.get(id);
    if (!cur) throw new DomainAttachNotFoundError();
    const allowed = STATUS_TRANSITIONS[cur.status];
    if (!allowed.includes(to)) throw new InvalidStatusTransitionError(cur.status, to);
    const t = now();
    const next: DomainAttach = {
      ...cur,
      status: to,
      verifiedAt: to === "active" ? t : cur.verifiedAt,
      lastError: to === "failed" ? (lastError ?? cur.lastError) : (to === "active" ? undefined : cur.lastError),
      updatedAt: t,
    };
    await this.storage.set(attachKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: `agency-domains.attach.${to}`,
      message: `Custom-domain ${cur.hostname}: ${cur.status} → ${to}${lastError ? ` (${lastError})` : ""}`,
      metadata: { attachId: id, hostname: cur.hostname, prev: cur.status, lastError },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "agency-domains.attach.transitioned", { id, prev: cur.status, status: to });
    return next;
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new DomainAttachNotFoundError();
    await this.storage.del(attachKey(id));
    await this.storage.del(hostKey(cur.hostname));
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    await this.storage.set(INDEX_KEY, ids.filter(x => x !== id));
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "agency-domains.attach.deleted",
      message: `Custom-domain attach removed: ${cur.hostname}`,
      metadata: { attachId: id, hostname: cur.hostname },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "agency-domains.attach.deleted", { id });
  }

  // TODO(T6): implement real DNS verification — query nameservers,
  // confirm TXT record matches, run TLS challenge. v1 stub returns
  // current status unchanged so the UI reflects the operator's
  // manual flips.
  async verify(_id: string): Promise<{ stub: true; message: string }> {
    return {
      stub: true,
      message: "T6: real DNS verification not yet wired. Operator flips status manually for v1.",
    };
  }
}

// Re-export the NsRecord shape so handlers can pass-through.
export type { NsRecord };
