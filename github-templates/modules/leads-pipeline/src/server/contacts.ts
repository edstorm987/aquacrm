// ContactService — sibling rolodex (lead/customer/vendor) keyed by
// canonical email. Lead→Contact promotion runs idempotently when a
// PipelineCard moves to a "Won" column.
//
// Storage layout:
//   - `contact:<id>`              — Contact row
//   - `contacts/index`            — id list
//   - `contacts/email/<canon>`    — id pointer (idempotent merge key)

import { canonEmail, makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  Contact,
  ContactFilter,
  ContactType,
  CreateContactInput,
  Lead,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const CONTACT_INDEX_KEY = "contacts/index";
const contactKey = (id: string): string => `contact:${id}`;
const emailPtrKey = (email: string): string => `contacts/email/${email}`;

export class ContactService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: ContactFilter): Promise<Contact[]> {
    const index = (await this.storage.get<string[]>(CONTACT_INDEX_KEY)) ?? [];
    const rows: Contact[] = [];
    for (const id of index) {
      const row = await this.storage.get<Contact>(contactKey(id));
      if (row && row.agencyId === this.agencyId) rows.push(row);
    }
    if (!filter) return rows.sort((a, b) => b.createdAt - a.createdAt);
    const q = filter.query?.toLowerCase().trim();
    return rows
      .filter(c => !filter.type || c.type === filter.type)
      .filter(c => !filter.tag || c.tags.includes(filter.tag))
      .filter(c => !q || `${c.name ?? ""} ${c.email} ${c.company ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Contact | null> {
    const row = await this.storage.get<Contact>(contactKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async getByEmail(email: string): Promise<Contact | null> {
    const id = await this.storage.get<string>(emailPtrKey(canonEmail(email)));
    return id ? this.get(id) : null;
  }

  async upsert(input: CreateContactInput, actor: UserId): Promise<{ contact: Contact; created: boolean }> {
    const email = canonEmail(input.email);
    const existingId = await this.storage.get<string>(emailPtrKey(email));
    if (existingId) {
      const existing = await this.get(existingId);
      if (existing) {
        const merged: Contact = {
          ...existing,
          name: existing.name ?? input.name,
          phone: existing.phone ?? input.phone,
          company: existing.company ?? input.company,
          tags: Array.from(new Set([...existing.tags, ...(input.tags ?? [])])),
          // Promotion is one-way: lead → customer → vendor never downgrades
          // back to "lead". A move that flips lead→customer overwrites.
          type: typeRank(input.type) > typeRank(existing.type) ? input.type : existing.type,
          notes: existing.notes ?? input.notes,
          promotedFromLeadId: existing.promotedFromLeadId ?? input.promotedFromLeadId,
          updatedAt: now(),
        };
        await this.storage.set(contactKey(existing.id), merged);
        return { contact: merged, created: false };
      }
    }
    const id = makeId("ctc");
    const ts = now();
    const contact: Contact = {
      id,
      agencyId: this.agencyId,
      email,
      name: input.name?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      company: input.company?.trim() || undefined,
      tags: input.tags ?? [],
      type: input.type,
      source: input.source,
      promotedFromLeadId: input.promotedFromLeadId,
      notes: input.notes,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(contactKey(id), contact);
    await this.storage.set(emailPtrKey(email), id);
    const index = (await this.storage.get<string[]>(CONTACT_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(CONTACT_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.created",
      message: `Added ${contact.type} contact ${contact.email}.`,
      metadata: { contactId: id, type: contact.type, source: contact.source },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.contact.created", { contactId: id });
    return { contact, created: true };
  }

  // Promote a Lead row into a Contact (type "customer"). Idempotent —
  // re-runs only stamp `promotedFromLeadId` if the contact didn't
  // already have one.
  async promoteLead(lead: Lead, actor: UserId): Promise<Contact> {
    const result = await this.upsert(
      {
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
        company: lead.company,
        tags: lead.tags,
        type: "customer",
        source: lead.source,
        promotedFromLeadId: lead.id,
        notes: lead.notes,
      },
      actor,
    );
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.promoted",
      message: `Promoted lead ${lead.email} to customer contact.`,
      metadata: { leadId: lead.id, contactId: result.contact.id },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.contact.promoted", {
      leadId: lead.id,
      contactId: result.contact.id,
    });
    return result.contact;
  }

  async stampLastContactedAt(contactId: string, ts: number): Promise<Contact | null> {
    const existing = await this.get(contactId);
    if (!existing) return null;
    const updated: Contact = { ...existing, lastContactedAt: ts, updatedAt: now() };
    await this.storage.set(contactKey(contactId), updated);
    return updated;
  }
}

function typeRank(t: ContactType): number {
  // Promotion ladder — higher wins on conflict.
  return { lead: 0, vendor: 1, customer: 2 }[t];
}
