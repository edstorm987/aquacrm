// Contact service. CRUD + bulk import + email uniqueness scoped to
// (agencyId, clientId) + mergeFromUser reconciliation.
//
// Storage:
//   contacts/by-id/<id>           → Contact
//   contacts/by-email/<lowered>   → contactId  (uniqueness lookup)
//   contacts/by-user/<userId>     → contactId  (User-link reverse)
//   contacts/index                → string[] of all contact ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Contact,
  ContactFilter,
  ContactSource,
  ContactStatus,
  CreateContactInput,
  ImportContactRow,
  ImportResult,
  UpdateContactPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort, UserPort } from "./ports";

const CONTACT_INDEX_KEY = "contacts/index";
const contactKey = (id: string): string => `contacts/by-id/${id}`;
const byEmailKey = (email: string): string => `contacts/by-email/${email.toLowerCase()}`;
const byUserKey = (userId: UserId): string => `contacts/by-user/${userId}`;

export class ContactService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private user: UserPort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: ContactFilter): Promise<Contact[]> {
    const ids = (await this.storage.get<string[]>(CONTACT_INDEX_KEY)) ?? [];
    const out: Contact[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Contact>(contactKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toLowerCase().trim();
    return out
      .filter(c => !filter?.status || c.status === filter.status)
      .filter(c => !filter?.tag || c.tags.includes(filter.tag))
      .filter(c => !filter?.segmentId || c.segmentIds.includes(filter.segmentId))
      .filter(c => !q || `${c.email} ${c.name ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Contact | null> {
    const row = await this.storage.get<Contact>(contactKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async getByEmail(email: string): Promise<Contact | null> {
    const id = await this.storage.get<string>(byEmailKey(email));
    return id ? this.get(id) : null;
  }

  async getByUser(userId: UserId): Promise<Contact | null> {
    const id = await this.storage.get<string>(byUserKey(userId));
    return id ? this.get(id) : null;
  }

  async create(input: CreateContactInput, actor: UserId, sourceDefault: ContactSource = "manual"): Promise<Contact> {
    const email = input.email.trim();
    if (!email) throw new Error("Contact email required.");
    const existing = await this.getByEmail(email);
    if (existing) {
      throw new Error(`Contact with email ${email} already exists for this client.`);
    }
    const id = makeId("ctc");
    const ts = now();
    const row: Contact = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      endCustomerUserId: input.endCustomerUserId,
      email,
      name: input.name?.trim(),
      phone: input.phone?.trim(),
      source: input.source ?? sourceDefault,
      status: "active",
      segmentIds: input.segmentIds ?? [],
      tags: input.tags ?? [],
      attributes: input.attributes ?? {},
      firstSeenAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(contactKey(id), row);
    await this.storage.set(byEmailKey(email), id);
    if (input.endCustomerUserId) {
      await this.storage.set(byUserKey(input.endCustomerUserId), id);
    }
    const ix = (await this.storage.get<string[]>(CONTACT_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(CONTACT_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "crm",
      action: "crm.contact.created",
      message: `Added contact ${email}${input.name ? ` (${input.name})` : ""}.`,
      metadata: { contactId: id, source: row.source },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.contact.created", { contactId: id });
    return row;
  }

  async update(id: string, patch: UpdateContactPatch, actor: UserId): Promise<Contact | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    if (patch.email && patch.email.toLowerCase() !== existing.email.toLowerCase()) {
      const dup = await this.getByEmail(patch.email);
      if (dup) throw new Error(`Email ${patch.email} already in use.`);
      await this.storage.del(byEmailKey(existing.email));
      await this.storage.set(byEmailKey(patch.email), id);
    }

    if (patch.endCustomerUserId !== undefined && patch.endCustomerUserId !== existing.endCustomerUserId) {
      if (existing.endCustomerUserId) {
        await this.storage.del(byUserKey(existing.endCustomerUserId));
      }
      if (patch.endCustomerUserId) {
        await this.storage.set(byUserKey(patch.endCustomerUserId), id);
      }
    }

    const next: Contact = {
      ...existing,
      ...patch,
      endCustomerUserId: patch.endCustomerUserId === null ? undefined : patch.endCustomerUserId ?? existing.endCustomerUserId,
      email: patch.email?.trim() ?? existing.email,
      name: patch.name?.trim() ?? existing.name,
      phone: patch.phone?.trim() ?? existing.phone,
      tags: patch.tags ?? existing.tags,
      attributes: patch.attributes ?? existing.attributes,
      segmentIds: patch.segmentIds ?? existing.segmentIds,
      updatedAt: now(),
    };
    await this.storage.set(contactKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "crm",
      action: "crm.contact.updated",
      message: `Updated contact ${next.email}.`,
      metadata: { contactId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.contact.updated", { contactId: id });
    return next;
  }

  // Soft-delete: status flips to "deleted", row preserved for audit.
  async archive(id: string, actor: UserId): Promise<Contact | null> {
    const updated = await this.update(id, { status: "deleted" }, actor);
    if (updated) {
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.contact.archived", { contactId: id });
    }
    return updated;
  }

  // Hard delete — drops the row + all reverse indexes.
  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(contactKey(id));
    await this.storage.del(byEmailKey(existing.email));
    if (existing.endCustomerUserId) {
      await this.storage.del(byUserKey(existing.endCustomerUserId));
    }
    const ix = (await this.storage.get<string[]>(CONTACT_INDEX_KEY)) ?? [];
    await this.storage.set(CONTACT_INDEX_KEY, ix.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "crm",
      action: "crm.contact.deleted",
      message: `Deleted contact ${existing.email}.`,
      metadata: { contactId: id },
    });
    return true;
  }

  // Reconcile a foundation User with an existing Contact (matched by
  // email). Used when an end-customer signs up after first appearing
  // as a manual import — the new User row gets linked to the existing
  // Contact row instead of creating a duplicate.
  async mergeFromUser(userId: UserId, actor: UserId): Promise<Contact | null> {
    const profile = await this.user.getUser(userId);
    if (!profile) return null;
    const existing = await this.getByEmail(profile.email);
    if (!existing) {
      // No matching contact → create one from the User profile.
      return this.create({
        email: profile.email,
        name: profile.name,
        endCustomerUserId: userId,
        source: "signup",
      }, actor, "signup");
    }
    if (existing.endCustomerUserId === userId) return existing;
    // Existing contact, no User link yet — reconcile.
    const next = await this.update(existing.id, {
      endCustomerUserId: userId,
      name: existing.name ?? profile.name,
    }, actor);
    if (next) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "crm",
        action: "crm.contact.merged",
        message: `Merged contact ${profile.email} with foundation User ${userId}.`,
        metadata: { contactId: existing.id, userId },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.contact.merged", {
        contactId: existing.id, userId,
      });
    }
    return next;
  }

  // Bulk import. Caps at 1000 rows per call. Existing emails are
  // patched (name / tags / attributes merged); new rows are inserted.
  async importBulk(rows: ImportContactRow[], actor: UserId): Promise<ImportResult> {
    if (rows.length > 1000) {
      throw new Error(`Bulk import capped at 1000 rows; got ${rows.length}.`);
    }
    const result: ImportResult = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      contactIds: [],
    };
    for (const r of rows) {
      const email = r.email?.trim();
      if (!email) {
        result.skipped += 1;
        continue;
      }
      const existing = await this.getByEmail(email);
      if (existing) {
        const next = await this.update(existing.id, {
          name: r.name ?? existing.name,
          phone: r.phone ?? existing.phone,
          tags: dedupe([...existing.tags, ...(r.tags ?? [])]),
          attributes: { ...existing.attributes, ...(r.attributes ?? {}) },
        }, actor);
        if (next) {
          result.updated += 1;
          result.contactIds.push(next.id);
        } else {
          result.skipped += 1;
        }
      } else {
        try {
          const created = await this.create({
            email,
            name: r.name,
            phone: r.phone,
            tags: r.tags,
            attributes: r.attributes,
            source: "import",
          }, actor, "import");
          result.created += 1;
          result.contactIds.push(created.id);
        } catch {
          result.skipped += 1;
        }
      }
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "crm",
      action: "crm.contact.imported",
      message: `Bulk imported contacts: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped.`,
      metadata: { total: result.total, created: result.created, updated: result.updated, skipped: result.skipped },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "crm.contact.imported", result);
    return result;
  }

  // Internal — bumps lastSeenAt from ActivityService when an event
  // arrives. Doesn't log activity (the activity row itself is the audit).
  async _touchLastSeen(id: string, occurredAt: number): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    if (existing.lastSeenAt && existing.lastSeenAt >= occurredAt) return;
    await this.storage.set(contactKey(id), {
      ...existing,
      lastSeenAt: occurredAt,
      updatedAt: now(),
    });
  }
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
