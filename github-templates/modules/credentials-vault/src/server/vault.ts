// CredentialsVaultService — encryption + ACL + audit + rate limit.
//
// Storage layout (per-install):
//   vault/index                  → string[] of credential ids
//   vault/by-id/<id>             → Credential (password field is
//                                  the EncryptedField blob)
//   vault/views/<actorUserId>    → number[] (recent view timestamps;
//                                  bounded to RATE_WINDOW_MS)
//
// scopePolicy: "either" — at agency scope, container.agencyId is set;
// at client scope, container.agencyId AND clientId are set. The
// service inScope check is `c.agencyId === this.agencyId`. Per-client
// installs additionally constrain reads to `c.clientId === this.clientId`.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Credential,
  CreateCredentialInput,
  CredentialFilter,
  CredentialSummary,
  UpdateCredentialPatch,
} from "../lib/domain";
import { CREDENTIAL_TYPES, summarise } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { decrypt, encrypt, type CryptoKey } from "./crypto";

const INDEX_KEY = "vault/index";
const credKey = (id: string): string => `vault/by-id/${id}`;
const viewsKey = (actor: UserId): string => `vault/views/${actor}`;

// Rate limit: at most N reveals per actor per window. v1 conservative.
export const RATE_LIMIT_REVEALS = 10;
export const RATE_WINDOW_MS = 60_000;

export class VaultRateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super(`vault: rate limit exceeded; retry after ${retryAfterMs}ms`);
    this.name = "VaultRateLimitError";
  }
}

export class VaultAccessError extends Error {
  constructor(message = "vault: forbidden") {
    super(message);
    this.name = "VaultAccessError";
  }
}

export interface VaultDeps {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  crypto: CryptoKey;
  // True when caller is an admin (agency-owner / agency-manager).
  // Admins see all credentials; non-admins only see ones in their
  // sharedWith list. Defaults to false in tests; resolved per-request
  // by the API handler from the caller's role.
  isAdmin?: (actor: UserId) => boolean;
}

function uniq<T>(xs: T[] | undefined): T[] {
  if (!xs) return [];
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export class VaultService {
  private readonly agencyId: AgencyId;
  private readonly clientId?: ClientId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly crypto: CryptoKey;
  private readonly isAdmin: (actor: UserId) => boolean;

  constructor(deps: VaultDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.crypto = deps.crypto;
    this.isAdmin = deps.isAdmin ?? (() => true);
  }

  private inScope(c: Credential): boolean {
    if (c.agencyId !== this.agencyId) return false;
    if (this.clientId !== undefined && c.clientId !== this.clientId) return false;
    return true;
  }

  private canRead(c: Credential, actor: UserId): boolean {
    if (this.isAdmin(actor)) return true;
    return c.sharedWith.includes(actor);
  }

  private async loadAll(): Promise<Credential[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Credential[] = [];
    for (const id of ids) {
      const c = await this.storage.get<Credential>(credKey(id));
      if (c) out.push(c);
    }
    return out;
  }

  private async writeIndex(ids: string[]): Promise<void> {
    await this.storage.set(INDEX_KEY, ids);
  }

  async list(actor: UserId, filter: CredentialFilter = {}): Promise<CredentialSummary[]> {
    const all = await this.loadAll();
    const out: CredentialSummary[] = [];
    for (const c of all) {
      if (!this.inScope(c)) continue;
      if (!this.canRead(c, actor)) continue;
      if (!filter.includeArchived && c.archived) continue;
      if (filter.type && c.type !== filter.type) continue;
      if (filter.clientId === null && c.clientId) continue;
      if (typeof filter.clientId === "string" && c.clientId !== filter.clientId) continue;
      if (filter.query) {
        const q = filter.query.toLowerCase();
        const hay = `${c.label} ${c.username ?? ""} ${c.url ?? ""} ${c.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(summarise(c));
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(actor: UserId, id: string): Promise<CredentialSummary | null> {
    const c = await this.storage.get<Credential>(credKey(id));
    if (!c || !this.inScope(c)) return null;
    if (!this.canRead(c, actor)) throw new VaultAccessError();
    return summarise(c);
  }

  async create(actor: UserId, input: CreateCredentialInput): Promise<CredentialSummary> {
    if (!CREDENTIAL_TYPES.includes(input.type)) throw new Error("vault: invalid type");
    if (!input.label.trim()) throw new Error("vault: label required");
    const t = now();
    const cred: Credential = {
      id: makeId("cred"),
      agencyId: this.agencyId,
      clientId: this.clientId ?? input.clientId,
      label: input.label.trim(),
      type: input.type,
      url: input.url,
      username: input.username,
      password: input.password ? encrypt(input.password, this.crypto) : undefined,
      notes: input.notes,
      tags: uniq(input.tags),
      sharedWith: uniq(input.sharedWith),
      archived: false,
      createdBy: actor,
      createdAt: t,
      updatedAt: t,
      lastRotated: input.password ? t : undefined,
    };
    await this.storage.set(credKey(cred.id), cred);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(cred.id)) await this.writeIndex([...ids, cred.id]);

    this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: cred.clientId,
      actorUserId: actor,
      category: "settings",
      action: "credential.created",
      message: `Credential "${cred.label}" created (${cred.type})`,
      metadata: { credentialId: cred.id, type: cred.type },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: cred.clientId },
      "credentials.credential.created", { id: cred.id });
    return summarise(cred);
  }

  async update(actor: UserId, id: string, patch: UpdateCredentialPatch): Promise<CredentialSummary> {
    const c = await this.storage.get<Credential>(credKey(id));
    if (!c || !this.inScope(c)) throw new Error("vault: not found");
    if (!this.canRead(c, actor)) throw new VaultAccessError();
    const t = now();
    const next: Credential = {
      ...c,
      label: patch.label?.trim() || c.label,
      url: patch.url ?? c.url,
      username: patch.username ?? c.username,
      notes: patch.notes ?? c.notes,
      tags: patch.tags ? uniq(patch.tags) : c.tags,
      sharedWith: patch.sharedWith ? uniq(patch.sharedWith) : c.sharedWith,
      updatedAt: t,
    };
    if (patch.password !== undefined) {
      next.password = patch.password === "" ? undefined : encrypt(patch.password, this.crypto);
      next.lastRotated = patch.password === "" ? c.lastRotated : t;
    } else if (patch.rotateNow) {
      next.lastRotated = t;
    }
    await this.storage.set(credKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: next.clientId,
      actorUserId: actor,
      category: "settings",
      action: "credential.updated",
      message: `Credential "${next.label}" updated`,
      metadata: { credentialId: next.id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: next.clientId },
      "credentials.credential.updated", { id: next.id });
    return summarise(next);
  }

  async archive(actor: UserId, id: string): Promise<void> {
    const c = await this.storage.get<Credential>(credKey(id));
    if (!c || !this.inScope(c)) throw new Error("vault: not found");
    if (!this.isAdmin(actor)) throw new VaultAccessError("vault: archive requires admin");
    const next: Credential = { ...c, archived: true, updatedAt: now() };
    await this.storage.set(credKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: c.clientId,
      actorUserId: actor,
      category: "settings",
      action: "credential.archived",
      message: `Credential "${c.label}" archived`,
      metadata: { credentialId: c.id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: c.clientId },
      "credentials.credential.archived", { id: c.id });
  }

  // Reveal the plaintext password. Rate-limited per actor; logs a
  // viewed event each successful call. Throws VaultRateLimitError or
  // VaultAccessError as appropriate.
  async viewPassword(actor: UserId, id: string): Promise<{ password: string }> {
    const c = await this.storage.get<Credential>(credKey(id));
    if (!c || !this.inScope(c)) throw new Error("vault: not found");
    if (!this.canRead(c, actor)) throw new VaultAccessError();
    if (!c.password) throw new Error("vault: no secret stored");

    const t = now();
    const recent = ((await this.storage.get<number[]>(viewsKey(actor))) ?? [])
      .filter(ts => t - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_REVEALS) {
      const oldest = recent[0] ?? t;
      const retryAfter = RATE_WINDOW_MS - (t - oldest);
      this.events.emit({ agencyId: this.agencyId, clientId: c.clientId },
        "credentials.credential.rate_limited",
        { id: c.id, actor, retryAfterMs: retryAfter });
      throw new VaultRateLimitError(retryAfter);
    }
    recent.push(t);
    await this.storage.set(viewsKey(actor), recent);

    const plaintext = decrypt(c.password, this.crypto);
    this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: c.clientId,
      actorUserId: actor,
      category: "settings",
      action: "credential.viewed",
      message: `Credential "${c.label}" revealed`,
      metadata: { credentialId: c.id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: c.clientId },
      "credentials.credential.viewed", { id: c.id, actor });
    return { password: plaintext };
  }
}
