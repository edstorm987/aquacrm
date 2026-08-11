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
  UpdateContactPatch,
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
          type: mergeContactType(existing.type, input.type),
          notes: existing.notes ?? input.notes,
          customFields: { ...(input.customFields ?? {}), ...(existing.customFields ?? {}) },
          promotedFromLeadId: existing.promotedFromLeadId ?? input.promotedFromLeadId,
          leadCapturedAt: existing.leadCapturedAt ?? input.leadCapturedAt,
          firstContactedAt: existing.firstContactedAt ?? input.firstContactedAt,
          convertedAt: input.convertedAt ?? existing.convertedAt,
          leadJourneyEvents: input.leadJourneyEvents?.length ? input.leadJourneyEvents : existing.leadJourneyEvents,
          nextMeetingAt: existing.nextMeetingAt ?? input.nextMeetingAt,
          meetingLink: existing.meetingLink ?? input.meetingLink,
          meetingNotes: existing.meetingNotes ?? input.meetingNotes,
          salesPresentations: existing.salesPresentations ?? input.salesPresentations,
          callRecordingUrl: existing.callRecordingUrl ?? input.callRecordingUrl,
          sessionNotes: existing.sessionNotes ?? input.sessionNotes,
          inspirationLinks: existing.inspirationLinks ?? input.inspirationLinks,
          potentialProblems: existing.potentialProblems ?? input.potentialProblems,
          potentialSolutions: existing.potentialSolutions ?? input.potentialSolutions,
          pricePoints: existing.pricePoints ?? input.pricePoints,
          budgetRange: existing.budgetRange ?? input.budgetRange,
          designFeedback: existing.designFeedback ?? input.designFeedback,
          supportNotes: existing.supportNotes ?? input.supportNotes,
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
      leadCapturedAt: input.leadCapturedAt,
      firstContactedAt: input.firstContactedAt,
      convertedAt: input.convertedAt,
      leadJourneyEvents: input.leadJourneyEvents,
      nextMeetingAt: input.nextMeetingAt,
      meetingLink: input.meetingLink,
      meetingNotes: input.meetingNotes,
      salesPresentations: input.salesPresentations,
      callRecordingUrl: input.callRecordingUrl,
      sessionNotes: input.sessionNotes,
      inspirationLinks: input.inspirationLinks,
      potentialProblems: input.potentialProblems,
      potentialSolutions: input.potentialSolutions,
      pricePoints: input.pricePoints,
      budgetRange: input.budgetRange,
      designFeedback: input.designFeedback,
      supportNotes: input.supportNotes,
      notes: input.notes,
      customFields: input.customFields,
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
    if (!lead.email) throw new Error("Add an email address before converting this lead to a customer.");
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
        leadCapturedAt: lead.capturedAt,
        firstContactedAt: lead.firstContactedAt,
        convertedAt: lead.convertedAt,
        leadJourneyEvents: lead.journeyEvents,
        nextMeetingAt: lead.nextMeetingAt,
        meetingLink: lead.meetingLink,
        meetingNotes: lead.meetingNotes,
        salesPresentations: lead.salesPresentations,
        callRecordingUrl: lead.callRecordingUrl,
        sessionNotes: lead.sessionNotes,
        inspirationLinks: lead.inspirationLinks,
        potentialProblems: lead.potentialProblems,
        potentialSolutions: lead.potentialSolutions,
        pricePoints: lead.pricePoints,
        budgetRange: lead.budgetRange,
        designFeedback: lead.designFeedback,
        supportNotes: lead.supportNotes,
        notes: lead.notes,
        customFields: lead.customFields,
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

  async update(id: string, patch: UpdateContactPatch, actor: UserId): Promise<Contact | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated: Contact = {
      ...existing,
      ...patch,
      tags: patch.tags ?? existing.tags,
      updatedAt: now(),
    };
    await this.storage.set(contactKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.updated",
      message: `Updated contact ${updated.email}.`,
      metadata: { contactId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.contact.updated", { contactId: id });
    return updated;
  }

  async stampLastContactedAt(contactId: string, ts: number): Promise<Contact | null> {
    const existing = await this.get(contactId);
    if (!existing) return null;
    const updated: Contact = { ...existing, lastContactedAt: ts, updatedAt: now() };
    await this.storage.set(contactKey(contactId), updated);
    return updated;
  }
}

function mergeContactType(existing: ContactType, incoming: ContactType): ContactType {
  // Pipeline conversion is the only implicit role change. Supplier,
  // employee, account, and other relationships are edited explicitly.
  if (existing === "lead" && incoming === "customer") return "customer";
  return existing;
}
