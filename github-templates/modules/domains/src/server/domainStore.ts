// Per-install storage CRUD for domain records.
//
// Storage keys (under the plugin's namespace; the foundation prefixes
// each with `pluginData/<installId>/`):
//
//   domains/<id>            full DomainRecord
//   by-host/<hostname>      domain id pointer (case-insensitive index)
//
// Lookups by id stay O(1); lookups by hostname use the `by-host`
// index. List walks `domains/` prefix. Same shape as agency-hr's
// staffStore + departmentsStore so the foundation's storage adapter
// behaves identically.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  DnsRequirement,
  DomainListFilter,
  DomainRecord,
  DomainStatus,
} from "../lib/domain";
import { normaliseHostname } from "../lib/domain";
import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId } from "../lib/tenancy";

const PREFIX_DOMAIN = "domains/";
const PREFIX_HOST = "by-host/";

function key(id: string): string {
  return `${PREFIX_DOMAIN}${id}`;
}
function hostKey(hostname: string): string {
  return `${PREFIX_HOST}${hostname}`;
}

export interface CreateDomainInput {
  agencyId: AgencyId;
  clientId?: ClientId;
  hostname: string;
  vercelProjectId: string;
  vercelTeamId?: string;
  attachedBy?: string;
}

export class DomainStore {
  constructor(private storage: PluginStorage) {}

  async list(filter: DomainListFilter): Promise<DomainRecord[]> {
    const ids = await this.storage.list(PREFIX_DOMAIN);
    const records = await Promise.all(
      ids.map((k) => this.storage.get<DomainRecord>(k)),
    );
    return records.filter((r): r is DomainRecord => {
      if (!r) return false;
      if (r.agencyId !== filter.agencyId) return false;
      if (filter.clientId !== undefined) {
        return r.clientId === filter.clientId;
      }
      return r.clientId === undefined;
    });
  }

  async getById(id: string): Promise<DomainRecord | null> {
    const r = await this.storage.get<DomainRecord>(key(id));
    return r ?? null;
  }

  async getByHostname(hostname: string): Promise<DomainRecord | null> {
    const normalized = normaliseHostname(hostname);
    const idRecord = await this.storage.get<{ id: string }>(hostKey(normalized));
    if (!idRecord || !idRecord.id) return null;
    return this.getById(idRecord.id);
  }

  async create(input: CreateDomainInput): Promise<DomainRecord> {
    const hostname = normaliseHostname(input.hostname);
    if (!hostname) throw new Error("hostname required");

    const existing = await this.getByHostname(hostname);
    if (existing) {
      // Idempotent: return existing record. Caller may decide to
      // re-attach via Vercel anyway (Vercel's POST is idempotent on
      // 409).
      return existing;
    }

    const id = makeId("dom");
    const ts = now();
    const record: DomainRecord = {
      id,
      agencyId: input.agencyId,
      clientId: input.clientId,
      hostname,
      vercelProjectId: input.vercelProjectId,
      vercelTeamId: input.vercelTeamId,
      status: "pending",
      pending: [],
      createdAt: ts,
      updatedAt: ts,
      attachedBy: input.attachedBy,
    };
    await this.storage.set(key(id), record);
    await this.storage.set(hostKey(hostname), { id });
    return record;
  }

  async updateStatus(
    id: string,
    patch: {
      status?: DomainStatus;
      pending?: DnsRequirement[];
      lastError?: string;
      lastCheckedAt?: number;
    },
  ): Promise<DomainRecord | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated: DomainRecord = {
      ...existing,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.pending !== undefined ? { pending: patch.pending } : {}),
      ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
      ...(patch.lastCheckedAt !== undefined ? { lastCheckedAt: patch.lastCheckedAt } : {}),
      updatedAt: now(),
    };
    await this.storage.set(key(id), updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.storage.del(key(id));
    await this.storage.del(hostKey(existing.hostname));
    return true;
  }
}
