// ContactService — sibling rolodex (lead/customer/vendor) keyed by
// canonical email. Lead→Contact promotion runs idempotently when a
// PipelineCard moves to a "Won" column.
//
// Storage layout:
//   - `contact:<id>`              — Contact row
//   - `contacts/index`            — id list
//   - `contacts/email/<canon>`    — id pointer (idempotent merge key)
//
// ── No PII in activity messages (right-to-be-forgotten) ────────────────────
// Every message below names the contact by **id**, never by email/name/phone.
// This install is agency-scoped, so its activity entries carry no `clientId`;
// `clientErasure` sweeps `state.activity` by `clientId` only, so an email in a
// message would survive a client erasure forever. The metadata carries
// `contactId`, which is what a reader (or the UI) resolves a label from.

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
import { cleanMeetingAssetUrlForStorage, safeMeetingAssetUrl } from "../lib/meetingAssetUrl";
import type { ActivityLogPort, EventBusPort, PersonIdentityPort } from "./ports";
import {
  appendServerMeetingAttempt,
  type MeetingMutationInput,
} from "./meetingMutation";

const CONTACT_INDEX_KEY = "contacts/index";
const contactKey = (id: string): string => `contact:${id}`;
const emailPtrKey = (email: string): string => `contacts/email/${email}`;
const leadKey = (id: string): string => `lead:${id}`;

async function withContactIdentityLock<T>(
  agencyId: AgencyId,
  storage: PluginStorage,
  work: () => Promise<T>,
): Promise<T> {
  if (typeof storage.runExclusive !== "function") {
    throw new Error("leads_pipeline_mutation_requires_exclusive_storage");
  }
  return storage.runExclusive(`acquisition-state:${agencyId}`, work);
}

export class ContactService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private personIdentity?: PersonIdentityPort,
  ) {}

  assertLeadPromotable(lead: Lead): void {
    if (lead.agencyId !== this.agencyId) throw new Error("lead_not_found");
    if (!lead.email) throw new Error("Add an email address before converting this lead to a customer.");
  }

  private async withCanonicalPerson(contact: Contact, currentPersonId?: string): Promise<Contact> {
    if (!this.personIdentity) return contact;
    const resolved = await this.personIdentity.resolve({
      agencyId: this.agencyId,
      currentPersonId: currentPersonId ?? contact.personId,
      email: contact.email,
      phone: contact.phone,
      name: contact.name,
      company: contact.company,
      source: contact.source,
      contactId: contact.id,
    });
    if (!resolved.personId) throw new Error("contact_person_identity_missing");
    if (currentPersonId && resolved.personId !== currentPersonId) {
      throw new Error("contact_person_identity_conflict");
    }
    return contact.personId === resolved.personId
      ? contact
      : { ...contact, personId: resolved.personId };
  }

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


  async getByPersonId(personId: string): Promise<Contact | null> {
    const canonical = personId.trim();
    if (!canonical) return null;
    return (await this.list()).find(contact => contact.personId === canonical) ?? null;
  }

  async upsert(input: CreateContactInput, actor: UserId): Promise<{ contact: Contact; created: boolean }> {
    return withContactIdentityLock(this.agencyId, this.storage, () =>
      this.upsertUnlocked(input, actor));
  }

  private async upsertUnlocked(
    input: CreateContactInput,
    actor: UserId,
    requiredPersonId?: string,
  ): Promise<{ contact: Contact; created: boolean }> {
    const email = canonEmail(input.email);
    const inputMeetingLink = Object.prototype.hasOwnProperty.call(input, "meetingLink")
      ? cleanMeetingAssetUrlForStorage(input.meetingLink, "Meeting link")
      : undefined;
    const inputCallRecordingUrl = Object.prototype.hasOwnProperty.call(input, "callRecordingUrl")
      ? cleanMeetingAssetUrlForStorage(input.callRecordingUrl, "Call recording URL")
      : undefined;
    const existingId = await this.storage.get<string>(emailPtrKey(email));
    if (existingId) {
      const existing = await this.get(existingId);
      if (existing) {
        if (requiredPersonId && existing.personId && existing.personId !== requiredPersonId) {
          throw new Error("contact_person_identity_conflict");
        }
        const merged = await this.withCanonicalPerson({
          ...existing,
          name: existing.name ?? input.name,
          phone: existing.phone ?? input.phone,
          company: existing.company ?? input.company,
          tags: Array.from(new Set([...existing.tags, ...(input.tags ?? [])])),
          type: mergeContactType(existing.type, input.type),
          notes: existing.notes ?? input.notes,
          customFields: { ...(existing.customFields ?? {}), ...(input.customFields ?? {}) },
          promotedFromLeadId: existing.promotedFromLeadId ?? input.promotedFromLeadId,
          leadCapturedAt: existing.leadCapturedAt ?? input.leadCapturedAt,
          firstContactedAt: existing.firstContactedAt ?? input.firstContactedAt,
          convertedAt: input.convertedAt ?? existing.convertedAt,
          leadJourneyEvents: input.leadJourneyEvents?.length ? input.leadJourneyEvents : existing.leadJourneyEvents,
          nextMeetingAt: existing.nextMeetingAt ?? input.nextMeetingAt,
          meetingLink: safeMeetingAssetUrl(existing.meetingLink) ?? inputMeetingLink,
          meetingNotes: existing.meetingNotes ?? input.meetingNotes,
          meetingMode: existing.meetingMode ?? input.meetingMode,
          meetingLocation: existing.meetingLocation ?? input.meetingLocation,
          meetingStatus: existing.meetingStatus ?? input.meetingStatus,
          meetingConfirmedAt: existing.meetingConfirmedAt ?? input.meetingConfirmedAt,
          meetingReminderAt: existing.meetingReminderAt ?? input.meetingReminderAt,
          meetingReminderSentAt: existing.meetingReminderSentAt ?? input.meetingReminderSentAt,
          meetingAttempts: existing.meetingAttempts ?? input.meetingAttempts,
          salesPresentations: existing.salesPresentations ?? input.salesPresentations,
          callRecordingUrl: safeMeetingAssetUrl(existing.callRecordingUrl) ?? inputCallRecordingUrl,
          sessionNotes: existing.sessionNotes ?? input.sessionNotes,
          inspirationLinks: existing.inspirationLinks ?? input.inspirationLinks,
          potentialProblems: existing.potentialProblems ?? input.potentialProblems,
          potentialSolutions: existing.potentialSolutions ?? input.potentialSolutions,
          pricePoints: existing.pricePoints ?? input.pricePoints,
          budgetRange: existing.budgetRange ?? input.budgetRange,
          designFeedback: existing.designFeedback ?? input.designFeedback,
          supportNotes: existing.supportNotes ?? input.supportNotes,
          updatedAt: now(),
        }, requiredPersonId ?? existing.personId);
        await this.storage.set(contactKey(existing.id), merged);
        return { contact: merged, created: false };
      }
    }
    const id = makeId("ctc");
    const ts = now();
    const contact = await this.withCanonicalPerson({
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
      meetingLink: inputMeetingLink,
      meetingNotes: input.meetingNotes,
      meetingMode: input.meetingMode,
      meetingLocation: input.meetingLocation,
      meetingStatus: input.meetingStatus,
      meetingConfirmedAt: input.meetingConfirmedAt,
      meetingReminderAt: input.meetingReminderAt,
      meetingReminderSentAt: input.meetingReminderSentAt,
      meetingAttempts: input.meetingAttempts,
      salesPresentations: input.salesPresentations,
      callRecordingUrl: inputCallRecordingUrl,
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
    }, requiredPersonId);
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
      message: `Added ${contact.type} contact ${id}.`,
      metadata: { contactId: id, type: contact.type, source: contact.source },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.contact.created", { contactId: id });
    return { contact, created: true };
  }

  // Promote a Lead row into a Contact (type "customer"). Idempotent —
  // re-runs only stamp `promotedFromLeadId` if the contact didn't
  // already have one.
  async promoteLead(lead: Lead, actor: UserId): Promise<Contact> {
    this.assertLeadPromotable(lead);
    return withContactIdentityLock(this.agencyId, this.storage, () =>
      this.promoteLeadUnlocked(lead, actor));
  }

  private async promoteLeadUnlocked(lead: Lead, actor: UserId): Promise<Contact> {
    let personId = lead.personId;
    if (this.personIdentity) {
      const resolved = await this.personIdentity.resolve({
        agencyId: this.agencyId,
        currentPersonId: lead.personId,
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        company: lead.company,
        source: lead.source,
        leadId: lead.id,
      });
      personId = resolved.personId;
      if (!personId) throw new Error("lead_person_identity_missing");
      if (lead.personId !== personId) {
        await this.storage.set(leadKey(lead.id), { ...lead, personId });
      }
    }

    const existing = await this.getByEmail(lead.email);
    if (existing?.personId && personId && existing.personId !== personId) {
      throw new Error("contact_person_identity_conflict");
    }
    if (
      existing
      && existing.type === "customer"
      && existing.promotedFromLeadId === lead.id
      && existing.convertedAt === lead.convertedAt
      && (!personId || existing.personId === personId)
    ) {
      if (personId && this.personIdentity) {
        const attached = await this.personIdentity.attachFacets({
          agencyId: this.agencyId,
          personId,
          leadId: lead.id,
          contactId: existing.id,
          ...(lead.convertedClientId ? { clientId: lead.convertedClientId } : {}),
        });
        if (!attached) throw new Error("contact_person_identity_missing");
      }
      return existing;
    }

    const result = await this.upsertUnlocked(
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
        meetingLink: safeMeetingAssetUrl(lead.meetingLink),
        meetingNotes: lead.meetingNotes,
        meetingMode: lead.meetingMode,
        meetingLocation: lead.meetingLocation,
        meetingStatus: lead.meetingStatus,
        meetingConfirmedAt: lead.meetingConfirmedAt,
        meetingReminderAt: lead.meetingReminderAt,
        meetingReminderSentAt: lead.meetingReminderSentAt,
        meetingAttempts: lead.meetingAttempts,
        salesPresentations: lead.salesPresentations,
        callRecordingUrl: safeMeetingAssetUrl(lead.callRecordingUrl),
        sessionNotes: lead.sessionNotes,
        inspirationLinks: lead.inspirationLinks,
        potentialProblems: lead.potentialProblems,
        potentialSolutions: lead.potentialSolutions,
        pricePoints: lead.pricePoints,
        budgetRange: lead.budgetRange,
        designFeedback: lead.designFeedback,
        supportNotes: lead.supportNotes,
        notes: lead.notes,
        customFields: {
          ...(lead.customFields ?? {}),
          ...(lead.relationshipCategory ? { leadRelationshipCategory: lead.relationshipCategory } : {}),
        },
      },
      actor,
      personId,
    );
    let contact = result.contact;
    if (personId && contact.personId !== personId) {
      contact = { ...contact, personId };
      await this.storage.set(contactKey(contact.id), contact);
    }
    if (personId && this.personIdentity) {
      const attached = await this.personIdentity.attachFacets({
        agencyId: this.agencyId,
        personId,
        leadId: lead.id,
        contactId: contact.id,
        ...(lead.convertedClientId ? { clientId: lead.convertedClientId } : {}),
      });
      if (!attached) throw new Error("contact_person_identity_missing");
    }
    await this.activity.logActivity({
      idempotencyKey: `lead-contact-promotion:${this.agencyId}:${lead.id}:${contact.id}`,
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.promoted",
      message: `Promoted lead ${lead.id} to customer contact ${contact.id}.`,
      metadata: { leadId: lead.id, contactId: contact.id, ...(personId ? { personId } : {}) },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.contact.promoted", {
      leadId: lead.id,
      contactId: contact.id,
    });
    return contact;
  }

  async recordClientConversion(
    contactId: string,
    clientId: string,
    actor: UserId,
  ): Promise<Contact | null> {
    return withContactIdentityLock(this.agencyId, this.storage, async () => {
      const existing = await this.get(contactId);
      if (!existing) return null;
      let personId = existing.personId;
      if (this.personIdentity) {
        const resolved = await this.personIdentity.resolve({
          agencyId: this.agencyId,
          currentPersonId: personId,
          email: existing.email,
          phone: existing.phone,
          name: existing.name,
          company: existing.company,
          source: existing.source,
          contactId: existing.id,
        });
        personId = resolved.personId;
        if (!personId) throw new Error("contact_person_identity_missing");
      }
      const updated: Contact = {
        ...existing,
        ...(personId ? { personId } : {}),
        clientId,
        type: "customer",
        tags: Array.from(new Set([...existing.tags, "converted"])),
        lastContactedAt: existing.lastContactedAt ?? now(),
        updatedAt: now(),
      };
      if (personId && this.personIdentity) {
        const attached = await this.personIdentity.attachFacets({
          agencyId: this.agencyId,
          personId,
          contactId: updated.id,
          clientId,
        });
        if (!attached) throw new Error("contact_person_identity_missing");
      }
      const changed = JSON.stringify({ ...updated, updatedAt: 0 })
        !== JSON.stringify({ ...existing, updatedAt: 0 });
      if (changed) {
        await this.storage.set(contactKey(updated.id), updated);
        await this.activity.logActivity({
          idempotencyKey: `contact-client-conversion:${this.agencyId}:${updated.id}:${clientId}`,
          agencyId: this.agencyId,
          actorUserId: actor,
          category: "leads",
          action: "leads.contact.updated",
          message: `Updated contact ${updated.id}.`,
          metadata: { contactId: updated.id, fields: ["type", "clientId", "personId"] },
        });
        this.events.emit(
          { agencyId: this.agencyId },
          "leads.contact.updated",
          { contactId: updated.id, clientId },
        );
      }
      return changed ? updated : existing;
    });
  }

  async update(id: string, patch: UpdateContactPatch, actor: UserId): Promise<Contact | null> {
    return withContactIdentityLock(this.agencyId, this.storage, () =>
      this.updateUnlocked(id, patch, actor));
  }

  /**
   * Meeting attempts are append-only at this boundary. Build the new history
   * from the latest Contact row while holding the durable agency lock so two
   * operators cannot overwrite each other's interaction evidence.
   */
  async updateMeeting(
    id: string,
    input: MeetingMutationInput,
    actor: UserId,
  ): Promise<Contact | null> {
    return withContactIdentityLock(this.agencyId, this.storage, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      const mutationAt = now();
      const patch: UpdateContactPatch = {
        ...input.patch,
        meetingConfirmedAt: input.meetingConfirmed
          ? existing.meetingConfirmedAt ?? mutationAt
          : undefined,
        meetingReminderSentAt: input.attempt?.outcome === "reminder-sent"
          ? mutationAt
          : existing.meetingReminderSentAt,
        lastContactedAt: input.attempt
          ? Math.max(existing.lastContactedAt ?? 0, mutationAt)
          : existing.lastContactedAt,
      };
      if (input.attempt) {
        patch.meetingAttempts = appendServerMeetingAttempt(
          existing.meetingAttempts,
          input.attempt,
          actor,
          mutationAt,
        );
      }
      return this.updateUnlocked(id, patch, actor);
    });
  }

  private async updateUnlocked(id: string, patch: UpdateContactPatch, actor: UserId): Promise<Contact | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const meetingLink = Object.prototype.hasOwnProperty.call(patch, "meetingLink")
      ? cleanMeetingAssetUrlForStorage(patch.meetingLink, "Meeting link")
      : safeMeetingAssetUrl(existing.meetingLink);
    const callRecordingUrl = Object.prototype.hasOwnProperty.call(patch, "callRecordingUrl")
      ? cleanMeetingAssetUrlForStorage(patch.callRecordingUrl, "Call recording URL")
      : safeMeetingAssetUrl(existing.callRecordingUrl);
    const updated = await this.withCanonicalPerson({
      ...existing,
      ...patch,
      // Neither field is publicly editable. JSON extras survive TypeScript at
      // runtime, so restore both trusted values after spreading the patch.
      email: existing.email,
      personId: existing.personId,
      tags: patch.tags ?? existing.tags,
      meetingLink,
      callRecordingUrl,
      updatedAt: now(),
    }, existing.personId);
    await this.storage.set(contactKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.updated",
      message: `Updated contact ${id}.`,
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

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(contactKey(id));
    await this.storage.del(emailPtrKey(existing.email));
    const index = (await this.storage.get<string[]>(CONTACT_INDEX_KEY)) ?? [];
    await this.storage.set(CONTACT_INDEX_KEY, index.filter(value => value !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.archived",
      message: `Archived contact ${id}.`,
      metadata: { contactId: id, type: existing.type },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.contact.updated", { contactId: id, archived: true });
    return true;
  }
}

function mergeContactType(existing: ContactType, incoming: ContactType): ContactType {
  // Pipeline conversion is the only implicit role change. Supplier,
  // employee, account, and other relationships are edited explicitly.
  if (existing === "lead" && incoming === "customer") return "customer";
  return existing;
}
