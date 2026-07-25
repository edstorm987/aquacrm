// Sender-identity service. CRUD on SenderIdentity rows + verify-domain
// flow (v1 stubs the verify call — production wires Postmark's
// /senders/{id}/verifyDomain endpoint or the equivalent for whichever
// provider is active).

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateIdentityInput,
  SenderIdentity,
  UpdateIdentityPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const IDENT_INDEX_KEY = "identities/index";
const identKey = (id: string): string => `identities/by-id/${id}`;

export class IdentityService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<SenderIdentity[]> {
    const ids = (await this.storage.get<string[]>(IDENT_INDEX_KEY)) ?? [];
    const out: SenderIdentity[] = [];
    for (const id of ids) {
      const row = await this.storage.get<SenderIdentity>(identKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  async get(id: string): Promise<SenderIdentity | null> {
    const row = await this.storage.get<SenderIdentity>(identKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async getDefault(): Promise<SenderIdentity | null> {
    const all = await this.list();
    return all.find(i => i.isDefault && i.status === "active") ?? null;
  }

  async create(input: CreateIdentityInput, actor: UserId): Promise<SenderIdentity> {
    if (!input.name.trim()) throw new Error("Identity name required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error("Identity email must be valid.");
    }
    const id = makeId("sid");
    const ts = now();
    // If isDefault, clear the previous default.
    if (input.isDefault) {
      const existing = await this.list();
      for (const i of existing) {
        if (i.isDefault) {
          await this.storage.set(identKey(i.id), { ...i, isDefault: false, updatedAt: ts });
        }
      }
    }
    const row: SenderIdentity = {
      id,
      agencyId: this.agencyId,
      clientId: input.clientId,
      name: input.name.trim(),
      email: input.email.trim(),
      isDefault: input.isDefault ?? false,
      status: "pending",                 // verify domain to mark active
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(identKey(id), row);
    const ix = (await this.storage.get<string[]>(IDENT_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(IDENT_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: input.clientId,
      actorUserId: actor,
      category: "email",
      action: "email.identity.created",
      message: `Created sender identity ${row.name} <${row.email}>.`,
      metadata: { identityId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "email.identity.created", { identityId: id });
    return row;
  }

  async update(id: string, patch: UpdateIdentityPatch, actor: UserId): Promise<SenderIdentity | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (patch.isDefault === true && !existing.isDefault) {
      const all = await this.list();
      for (const i of all) {
        if (i.id !== id && i.isDefault) {
          await this.storage.set(identKey(i.id), { ...i, isDefault: false, updatedAt: now() });
        }
      }
    }
    const next: SenderIdentity = {
      ...existing,
      ...patch,
      name: patch.name?.trim() ?? existing.name,
      email: patch.email?.trim() ?? existing.email,
      updatedAt: now(),
    };
    await this.storage.set(identKey(id), next);
    return next;
  }

  // Verify-domain stub. Production wires the active driver's
  // verify endpoint. For v1 we mark verified immediately (the
  // chapter calls this out as a TODO).
  async verifyDomain(id: string, actor: UserId): Promise<SenderIdentity | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: SenderIdentity = {
      ...existing,
      status: "active",
      verifiedAt: now(),
      updatedAt: now(),
    };
    await this.storage.set(identKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "email",
      action: "email.identity.verified",
      message: `Verified domain for ${existing.email}.`,
      metadata: { identityId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "email.identity.verified", { identityId: id });
    return next;
  }
}
