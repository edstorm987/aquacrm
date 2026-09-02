// LeadService — Lead CRUD + CSV import + audience filter resolution.
//
// Storage layout mirrors the agency-hr StaffService pattern:
//   - `lead:<id>`        — Lead row
//   - `leads/index`      — id list for cheap listing
//   - `leads/email/<canonical>` — id pointer for O(1) idempotent
//                                 lookup by canonical email (powers
//                                 idempotent CSV re-import)

import { canonEmail, makeId } from "../lib/ids";
import { now } from "../lib/time";
import { isoDateTimeValue } from "../lib/safeDate";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  AudienceFilter,
  CreateLeadInput,
  CustomFieldValue,
  CsvImportResult,
  Lead,
  LeadFilter,
  LeadJourneyEvent,
  LeadRelationshipCategory,
  UpdateLeadPatch,
} from "../lib/domain";
import { inferLeadRelationshipCategory, isLeadRelationshipCategory, projectLeadCard } from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PipelinePort,
} from "./ports";
import { parseCsv } from "./csv";

const LEAD_INDEX_KEY = "leads/index";
const leadKey = (id: string): string => `lead:${id}`;
const emailPtrKey = (email: string): string => `leads/email/${email}`;
const phonePtrKey = (phone: string): string => `leads/phone/${phone}`;

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLAUSIBLE_PHONE = /^\+?\d{7,15}$/;

const identityQueues = new Map<AgencyId, Promise<void>>();

async function withLeadIdentityLock<T>(
  agencyId: AgencyId,
  storage: PluginStorage,
  work: () => Promise<T>,
): Promise<T> {
  const previous = identityQueues.get(agencyId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  identityQueues.set(agencyId, queued);
  await previous;
  try {
    // The local queue prevents duplicate work in one server. The mounted host
    // boundary then refreshes and flushes the complete lead row/pointer/index
    // mutation under the same durable lease in every process.
    if (typeof storage.runExclusive !== "function") {
      throw new Error("leads_pipeline_mutation_requires_exclusive_storage");
    }
    return await storage.runExclusive(`leads-state:${agencyId}`, work);
  } finally {
    release();
    if (identityQueues.get(agencyId) === queued) identityQueues.delete(agencyId);
  }
}

export class LeadIdentityConflictError extends Error {
  readonly field: "email" | "phone";

  constructor(field: "email" | "phone") {
    super(`Another lead already uses this ${field}. Review that record instead of merging people silently.`);
    this.name = "LeadIdentityConflictError";
    this.field = field;
  }
}

function canonPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

// Activity messages name a lead by **id**, never by email/phone/name. This
// install is agency-scoped, so its entries carry no `clientId`; `clientErasure`
// sweeps `state.activity` by `clientId` only, so PII in a message would survive
// a client erasure forever. Every entry's metadata carries `leadId`, which is
// what a reader (or the UI) resolves a display label from.
function leadLabel(lead: Pick<Lead, "id">): string {
  return lead.id;
}

function enquiryIdFrom(value: Pick<Lead, "customFields"> | CreateLeadInput): string | undefined {
  const enquiryId = value.customFields?.enquiryId;
  return typeof enquiryId === "string" && enquiryId.trim() ? enquiryId.trim().slice(0, 160) : undefined;
}

function isEnquiryCapture(value: Pick<Lead, "source" | "tags" | "customFields"> | CreateLeadInput): boolean {
  return Boolean(enquiryIdFrom(value))
    || value.tags?.includes("website-enquiry") === true
    || value.source.startsWith("website:")
    || ["public-contact", "website-contact", "milesymedia-website"].includes(value.source);
}

function journeyEvent(type: LeadJourneyEvent["type"], at: number, fields: Omit<LeadJourneyEvent, "id" | "type" | "at"> = {}): LeadJourneyEvent {
  return { id: makeId("journey"), type, at, ...fields };
}

export function normalizeLeadJourney(lead: Lead): Lead {
  const events = Array.isArray(lead.journeyEvents) ? [...lead.journeyEvents] : [];
  if (!events.some(event => event.type === "lead-captured" || event.type === "enquiry-received")) {
    events.push({
      id: `journey_captured_${lead.id}`,
      type: isEnquiryCapture(lead) ? "enquiry-received" : "lead-captured",
      at: lead.capturedAt,
      source: lead.source,
      enquiryId: enquiryIdFrom(lead),
    });
  }
  const firstContactedAt = lead.firstContactedAt
    ?? events.filter(event => event.type === "contact-recorded").map(event => event.at).sort((a, b) => a - b)[0]
    ?? lead.lastContactedAt;
  if (lead.lastContactedAt && !events.some(event => event.type === "contact-recorded")) {
    events.push({
      id: `journey_contact_${lead.id}_${lead.lastContactedAt}`,
      type: "contact-recorded",
      at: lead.lastContactedAt,
      outcome: "recorded",
      note: "Contact recorded before detailed timing history was enabled.",
    });
  }
  const enquiryIds = Array.from(new Set([
    ...(lead.enquiryIds ?? []),
    ...(enquiryIdFrom(lead) ? [enquiryIdFrom(lead)!] : []),
  ]));
  const lastEnquiryAt = lead.lastEnquiryAt
    ?? events.filter(event => event.type === "enquiry-received").map(event => event.at).sort((a, b) => b - a)[0];
  const lastEnquiryRespondedAt = lead.lastEnquiryRespondedAt
    ?? (lastEnquiryAt
      ? events.filter(event => event.type === "contact-recorded" && event.at >= lastEnquiryAt).map(event => event.at).sort((a, b) => a - b)[0]
      : undefined);
  const lastStage = events.filter(event => event.type === "stage-changed").sort((a, b) => b.at - a.at)[0];
  return {
    ...lead,
    relationshipCategory: inferLeadRelationshipCategory(lead),
    firstContactedAt,
    lastEnquiryAt,
    lastEnquiryRespondedAt,
    enquiryIds,
    enquiryCount: lead.enquiryCount ?? Math.max(enquiryIds.length, lastEnquiryAt ? 1 : 0),
    currentStageId: lead.currentStageId ?? lastStage?.toStage ?? "new",
    stageEnteredAt: lead.stageEnteredAt ?? lastStage?.at ?? lead.capturedAt,
    journeyEvents: events.sort((a, b) => a.at - b.at),
  };
}

export class LeadService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private pipeline?: PipelinePort,
  ) {}

  async list(filter?: LeadFilter): Promise<Lead[]> {
    const index = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    const all: Lead[] = [];
    for (const id of index) {
      const row = await this.storage.get<Lead>(leadKey(id));
      if (row && row.agencyId === this.agencyId) all.push(normalizeLeadJourney(row));
    }
    // Applied BEFORE the `!filter` shortcut on purpose: `resolveAudience` and
    // every count call `list()` with no argument, and those are exactly the
    // callers that must not see an archived lead. Default-exclude, always.
    const mode = filter?.archived ?? "exclude";
    const rows = mode === "include"
      ? all
      : all.filter(l => (mode === "only" ? Boolean(l.archivedAt) : !l.archivedAt));
    if (!filter) return rows.sort((a, b) => b.capturedAt - a.capturedAt);
    const q = filter.query?.toLowerCase().trim();
    const cutoff = filter.notContactedSinceMs;
    const cutoffStamp = cutoff != null ? now() - cutoff : null;
    return rows
      .filter(l => !filter.tag || l.tags.includes(filter.tag))
      .filter(l => !filter.source || l.source === filter.source)
      .filter(l => !filter.relationshipCategory || l.relationshipCategory === filter.relationshipCategory)
      .filter(l => !q || `${l.name ?? ""} ${l.email} ${l.company ?? ""}`.toLowerCase().includes(q))
      .filter(l => cutoffStamp == null || (l.lastContactedAt ?? 0) <= cutoffStamp)
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }

  async get(id: string): Promise<Lead | null> {
    const row = await this.storage.get<Lead>(leadKey(id));
    return row && row.agencyId === this.agencyId ? normalizeLeadJourney(row) : null;
  }

  async getByEmail(email: string): Promise<Lead | null> {
    const id = await this.storage.get<string>(emailPtrKey(canonEmail(email)));
    return id ? this.get(id) : null;
  }

  async getByPhone(phone: string): Promise<Lead | null> {
    const canonical = canonPhone(phone);
    if (!canonical) return null;
    const id = await this.storage.get<string>(phonePtrKey(canonical));
    return id ? this.get(id) : null;
  }

  // Create-or-update on canonical email. Returns `{lead, created}` so
  // CSV import can tell whether a row was new or merged.
  async upsert(input: CreateLeadInput, actor: UserId): Promise<{ lead: Lead; created: boolean }> {
    return withLeadIdentityLock(this.agencyId, this.storage, () => this.upsertUnlocked(input, actor));
  }

  private async upsertUnlocked(input: CreateLeadInput, actor: UserId): Promise<{ lead: Lead; created: boolean }> {
    if (input.relationshipCategory !== undefined && !isLeadRelationshipCategory(input.relationshipCategory)) {
      throw new Error("Choose a valid lead relationship category.");
    }
    const email = canonEmail(input.email);
    const phone = canonPhone(input.phone ?? "");
    if (email && !PLAUSIBLE_EMAIL.test(email)) {
      throw new Error(`Implausible email: ${input.email}`);
    }
    if (!email && !PLAUSIBLE_PHONE.test(phone)) {
      throw new Error("A valid email address or phone number is required.");
    }
    const existingId = (email ? await this.storage.get<string>(emailPtrKey(email)) : undefined)
      ?? (phone ? await this.storage.get<string>(phonePtrKey(phone)) : undefined);
    if (existingId) {
      let existing = await this.get(existingId);
      if (existing) {
        // The same person came back. Their lead is archived, and the pointers
        // still point at it — so revive it rather than writing an update into a
        // record nobody can see. The alternative (leave it archived, quietly
        // absorb the enquiry) is how a real enquiry disappears.
        if (existing.archivedAt) {
          existing = await this.reviveUnlocked(existing, actor, now());
          await this.activity.logActivity({
            agencyId: this.agencyId,
            actorUserId: actor,
            category: "leads",
            action: "leads.lead.restored",
            message: `Restored archived lead ${leadLabel(existing)} — they came back through ${input.source}.`,
            metadata: { leadId: existing.id, source: input.source },
          });
          this.events.emit({ agencyId: this.agencyId }, "leads.lead.restored", { leadId: existing.id });
        }
        const incomingEnquiryId = enquiryIdFrom(input);
        const isNewEnquiry = Boolean(incomingEnquiryId && !(existing.enquiryIds ?? []).includes(incomingEnquiryId));
        const patched = await this.updateUnlocked(existing.id, {
          // Only fill blanks — never clobber existing notes/tags from a re-import.
          email: existing.email || email,
          name: existing.name ?? input.name,
          phone: existing.phone ?? input.phone,
          company: existing.company ?? input.company,
          companyId: existing.companyId ?? input.companyId,
          companyIds: Array.from(new Set([
            ...(existing.companyIds ?? (existing.companyId ? [existing.companyId] : [])),
            ...(input.companyIds ?? (input.companyId ? [input.companyId] : [])),
          ])),
          brandSlugs: Array.from(new Set([...(existing.brandSlugs ?? []), ...(input.brandSlugs ?? [])])),
          serviceLines: Array.from(new Set([...(existing.serviceLines ?? []), ...(input.serviceLines ?? [])])),
          relationshipCategory: existing.relationshipCategory ?? input.relationshipCategory ?? inferLeadRelationshipCategory(input),
          tags: input.tags && input.tags.length > 0
            ? Array.from(new Set([...existing.tags, ...input.tags]))
            : existing.tags,
          notes: existing.notes ?? input.notes,
          customFields: isNewEnquiry
            ? { ...(existing.customFields ?? {}), ...(input.customFields ?? {}) }
            : { ...(input.customFields ?? {}), ...(existing.customFields ?? {}) },
          meetingLink: existing.meetingLink,
          salesPresentations: existing.salesPresentations,
          callRecordingUrl: existing.callRecordingUrl,
          sessionNotes: existing.sessionNotes,
          inspirationLinks: existing.inspirationLinks,
          potentialProblems: existing.potentialProblems,
          potentialSolutions: existing.potentialSolutions,
          pricePoints: existing.pricePoints,
          budgetRange: existing.budgetRange,
          designFeedback: existing.designFeedback,
          supportNotes: existing.supportNotes,
        }, actor);
        const merged = patched ?? existing;
        const tracked = isNewEnquiry
          ? await this.recordEnquiryCaptureUnlocked(merged.id, {
              at: input.capturedAt ?? now(),
              source: input.source,
              enquiryId: incomingEnquiryId,
            }, actor)
          : merged;
        return { lead: tracked ?? merged, created: false };
      }
    }
    const id = makeId("lead");
    const ts = now();
    const capturedAt = input.capturedAt ?? ts;
    const enquiryId = enquiryIdFrom(input);
    const enquiryCapture = isEnquiryCapture(input);
    const lead: Lead = {
      id,
      agencyId: this.agencyId,
      email,
      companyId: input.companyId,
      companyIds: input.companyIds ?? (input.companyId ? [input.companyId] : []),
      brandSlugs: input.brandSlugs ?? [],
      serviceLines: input.serviceLines ?? [],
      name: input.name?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      company: input.company?.trim() || undefined,
      tags: input.tags ?? [],
      source: input.source,
      relationshipCategory: input.relationshipCategory ?? inferLeadRelationshipCategory(input),
      capturedAt,
      lastEnquiryAt: enquiryCapture ? capturedAt : undefined,
      enquiryIds: enquiryId ? [enquiryId] : [],
      enquiryCount: enquiryCapture ? 1 : 0,
      currentStageId: "new",
      stageEnteredAt: capturedAt,
      journeyEvents: [
        journeyEvent(enquiryCapture ? "enquiry-received" : "lead-captured", capturedAt, {
          actorUserId: actor,
          source: input.source,
          enquiryId,
        }),
        journeyEvent("stage-changed", capturedAt, { actorUserId: actor, toStage: "new" }),
      ],
      notes: input.notes,
      customFields: input.customFields,
      sentCount: 0,
    };
    await this.storage.set(leadKey(id), lead);
    if (email) await this.storage.set(emailPtrKey(email), id);
    if (phone) await this.storage.set(phonePtrKey(phone), id);
    const index = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(LEAD_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.created",
      message: `Captured lead ${leadLabel(lead)} from ${lead.source}.`,
      metadata: { leadId: id, source: lead.source },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.created", { leadId: id });

    // Try to add a card to the leads pipeline (foundation-pending — port
    // is optional; null result means "skip silently, lead row is fine").
    if (this.pipeline) {
      const card = await this.pipeline.addLeadCard({
        agencyId: this.agencyId,
        leadId: id,
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        company: lead.company,
        source: lead.source,
      });
      if (card) {
        await this.updateUnlocked(id, { pipelineCardId: card.cardId }, actor);
      }
    }

    return { lead, created: true };
  }

  async update(id: string, patch: UpdateLeadPatch, actor: UserId): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () => this.updateUnlocked(id, patch, actor));
  }

  private async updateUnlocked(id: string, patch: UpdateLeadPatch, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (patch.relationshipCategory !== undefined && !isLeadRelationshipCategory(patch.relationshipCategory)) {
      throw new Error("Choose a valid lead relationship category.");
    }
    const email = patch.email === undefined ? existing.email : canonEmail(patch.email);
    const phone = patch.phone === undefined ? existing.phone : patch.phone.trim() || undefined;
    if (email && !PLAUSIBLE_EMAIL.test(email)) throw new Error(`Implausible email: ${patch.email}`);
    if (!email && !PLAUSIBLE_PHONE.test(canonPhone(phone ?? ""))) {
      throw new Error("A valid email address or phone number is required.");
    }
    const emailOwnerId = email ? await this.storage.get<string>(emailPtrKey(email)) : undefined;
    if (emailOwnerId && emailOwnerId !== id && await this.get(emailOwnerId)) {
      throw new LeadIdentityConflictError("email");
    }
    const canonicalPhone = canonPhone(phone ?? "");
    const phoneOwnerId = canonicalPhone
      ? await this.storage.get<string>(phonePtrKey(canonicalPhone))
      : undefined;
    if (phoneOwnerId && phoneOwnerId !== id && await this.get(phoneOwnerId)) {
      throw new LeadIdentityConflictError("phone");
    }
    const updated: Lead = {
      ...existing,
      ...patch,
      email,
      phone,
      tags: patch.tags ?? existing.tags,
    };
    await this.storage.set(leadKey(id), updated);
    if (existing.email && existing.email !== updated.email) {
      const oldEmailOwner = await this.storage.get<string>(emailPtrKey(existing.email));
      if (oldEmailOwner === id) await this.storage.del(emailPtrKey(existing.email));
    }
    if (updated.email) await this.storage.set(emailPtrKey(updated.email), id);
    const existingPhone = canonPhone(existing.phone ?? "");
    const updatedPhone = canonPhone(updated.phone ?? "");
    if (existingPhone && existingPhone !== updatedPhone) {
      const oldPhoneOwner = await this.storage.get<string>(phonePtrKey(existingPhone));
      if (oldPhoneOwner === id) await this.storage.del(phonePtrKey(existingPhone));
    }
    if (updatedPhone) await this.storage.set(phonePtrKey(updatedPhone), id);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.updated",
      message: `Updated lead ${leadLabel(updated)}.`,
      metadata: { leadId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.updated", { leadId: id });
    return updated;
  }

  async recordEnquiryCapture(
    id: string,
    input: { at: number; source: string; enquiryId?: string },
    actor: UserId,
  ): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () =>
      this.recordEnquiryCaptureUnlocked(id, input, actor));
  }

  private async recordEnquiryCaptureUnlocked(
    id: string,
    input: { at: number; source: string; enquiryId?: string },
    actor: UserId,
  ): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (input.enquiryId && existing.journeyEvents?.some(event => event.type === "enquiry-received" && event.enquiryId === input.enquiryId)) return existing;
    const at = Number.isFinite(input.at) ? Math.max(existing.capturedAt, input.at) : now();
    const updated: Lead = {
      ...existing,
      lastEnquiryAt: at,
      lastEnquiryRespondedAt: undefined,
      enquiryIds: Array.from(new Set([...(existing.enquiryIds ?? []), ...(input.enquiryId ? [input.enquiryId] : [])])),
      enquiryCount: (existing.enquiryCount ?? 0) + 1,
      journeyEvents: [
        ...(existing.journeyEvents ?? []),
        journeyEvent("enquiry-received", at, {
          actorUserId: actor,
          source: input.source,
          enquiryId: input.enquiryId,
        }),
      ],
    };
    await this.storage.set(leadKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.enquiry.received",
      message: `Recorded another enquiry from ${leadLabel(updated)}.`,
      metadata: { leadId: id, enquiryId: input.enquiryId, source: input.source, capturedAt: at },
    });
    return updated;
  }

  async recordContact(
    id: string,
    input: { at?: number; channel?: string; outcome?: string; note?: string; incrementSentCount?: boolean },
    actor: UserId,
  ): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () =>
      this.recordContactUnlocked(id, input, actor));
  }

  private async recordContactUnlocked(
    id: string,
    input: { at?: number; channel?: string; outcome?: string; note?: string; incrementSentCount?: boolean },
    actor: UserId,
  ): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const requestedAt = typeof input.at === "number" && Number.isFinite(input.at) ? input.at : now();
    const at = Math.max(existing.capturedAt, Math.min(requestedAt, now() + 5 * 60_000));
    const firstContactedAt = Math.min(existing.firstContactedAt ?? at, at);
    const lastContactedAt = Math.max(existing.lastContactedAt ?? at, at);
    const respondsToLatestEnquiry = Boolean(existing.lastEnquiryAt && at >= existing.lastEnquiryAt);
    const updated: Lead = {
      ...existing,
      firstContactedAt,
      lastContactedAt,
      lastEnquiryRespondedAt: respondsToLatestEnquiry
        ? Math.min(existing.lastEnquiryRespondedAt ?? at, at)
        : existing.lastEnquiryRespondedAt,
      sentCount: input.incrementSentCount ? (existing.sentCount ?? 0) + 1 : existing.sentCount,
      journeyEvents: [
        ...(existing.journeyEvents ?? []),
        journeyEvent("contact-recorded", at, {
          actorUserId: actor,
          channel: input.channel?.trim().slice(0, 40) || "other",
          outcome: input.outcome?.trim().slice(0, 80) || "recorded",
          note: input.note?.trim().slice(0, 500) || undefined,
        }),
      ],
    };
    await this.storage.set(leadKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.contact.recorded",
      message: `Recorded ${input.channel || "contact"} with ${leadLabel(updated)}.`,
      metadata: { leadId: id, contactedAt: at, channel: input.channel, outcome: input.outcome },
    });
    return updated;
  }

  async recordStageChange(
    id: string,
    input: { fromStage?: string; toStage: string; at?: number },
    actor: UserId,
  ): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () =>
      this.recordStageChangeUnlocked(id, input, actor));
  }

  private async recordStageChangeUnlocked(
    id: string,
    input: { fromStage?: string; toStage: string; at?: number },
    actor: UserId,
  ): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const toStage = input.toStage.trim().slice(0, 80);
    if (!toStage) return existing;
    if (existing.currentStageId === toStage) return existing;
    const at = typeof input.at === "number" && Number.isFinite(input.at) ? input.at : now();
    const updated: Lead = {
      ...existing,
      currentStageId: toStage,
      stageEnteredAt: at,
      journeyEvents: [
        ...(existing.journeyEvents ?? []),
        journeyEvent("stage-changed", at, {
          actorUserId: actor,
          fromStage: input.fromStage ?? existing.currentStageId,
          toStage,
        }),
      ],
    };
    await this.storage.set(leadKey(id), updated);
    return updated;
  }

  async recordMeeting(id: string, meetingAt: number, actor: UserId): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () =>
      this.recordMeetingUnlocked(id, meetingAt, actor));
  }

  private async recordMeetingUnlocked(id: string, meetingAt: number, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing || !Number.isFinite(meetingAt)) return existing;
    if (existing.journeyEvents?.some(event => event.type === "meeting-scheduled" && event.scheduledFor === meetingAt)) return existing;
    const updated: Lead = {
      ...existing,
      journeyEvents: [
        ...(existing.journeyEvents ?? []),
        journeyEvent("meeting-scheduled", now(), {
          actorUserId: actor,
          scheduledFor: meetingAt,
          note: `Meeting scheduled for ${isoDateTimeValue(meetingAt) ?? "a date that needs review"}.`,
        }),
      ],
    };
    await this.storage.set(leadKey(id), updated);
    return updated;
  }

  async recordConversion(id: string, clientId: string, actor: UserId, at = now()): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () =>
      this.recordConversionUnlocked(id, clientId, actor, at));
  }

  private async recordConversionUnlocked(id: string, clientId: string, actor: UserId, at: number): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.convertedAt && existing.convertedClientId === clientId) return existing;
    const updated: Lead = {
      ...existing,
      convertedAt: at,
      convertedClientId: clientId,
      currentStageId: "won",
      stageEnteredAt: at,
      journeyEvents: [
        ...(existing.journeyEvents ?? []),
        ...(existing.currentStageId === "won" ? [] : [journeyEvent("stage-changed", at, {
          actorUserId: actor,
          fromStage: existing.currentStageId,
          toStage: "won",
        })]),
        journeyEvent("converted", at, { actorUserId: actor, clientId }),
      ],
    };
    await this.storage.set(leadKey(id), updated);
    return updated;
  }

  // ─── Archive, restore, purge ──────────────────────────────────────────
  //
  // Issue #62. The control said "Archive", the confirmation said "removed from
  // the active leads board", and the service hard-deleted the row, its pointers
  // and its index entry — with no archived state, no list and no way back. The
  // linked foundation pipeline CARD survived, holding a copy of the name, email
  // and phone of a lead that no longer existed.
  //
  // Three verbs now, and each one does what its name says:
  //
  //   • `archive`  — off the board, still here, restorable. Keeps the row, the
  //     index entry and the email/phone pointers; removes the pipeline card and
  //     remembers which column it came from.
  //   • `restore`  — back on the board, in the column it left.
  //   • `purge`    — the old permanent delete, under a name that admits it.
  //
  // The POINTERS are deliberately kept on archive. Dropping them would let the
  // same person enquire again and become a SECOND lead while their history sat
  // invisible; keeping them means `upsert` finds the archived lead and restores
  // it. Purge drops them, because after a purge there is nothing to find.

  async archive(id: string, actor: UserId): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () => this.archiveUnlocked(id, actor));
  }

  private async archiveUnlocked(id: string, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.archivedAt) return existing;               // idempotent
    const at = now();

    // Where the card is NOW, not where the lead's stage says it should be —
    // somebody may have dragged it, and restore should undo the archive rather
    // than quietly relocate the card.
    let columnId: string | undefined;
    if (this.pipeline?.columnIdForLead) {
      columnId = (await this.pipeline.columnIdForLead({ agencyId: this.agencyId, leadId: id })) ?? undefined;
    }
    if (this.pipeline?.removeLeadCards) {
      await this.pipeline.removeLeadCards({ agencyId: this.agencyId, leadId: id, cardId: existing.pipelineCardId });
    }

    const archived: Lead = {
      ...existing,
      archivedAt: at,
      archivedBy: actor,
      archivedFromColumnId: columnId,
      // The card is gone, so the link must go with it — a retained id would
      // point at nothing and read as "there is a card" to the next caller.
      pipelineCardId: undefined,
      journeyEvents: [...(existing.journeyEvents ?? []), journeyEvent("archived", at, { actorUserId: actor })],
    };
    await this.storage.set(leadKey(id), archived);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.archived",
      message: `Archived lead ${leadLabel(existing)}.`,
      metadata: { leadId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.archived", { leadId: id });
    return archived;
  }

  async restore(id: string, actor: UserId): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () => this.restoreUnlocked(id, actor));
  }

  private async restoreUnlocked(id: string, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (!existing.archivedAt) return existing;              // idempotent
    const restored = await this.reviveUnlocked(existing, actor, now());
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.restored",
      message: `Restored lead ${leadLabel(existing)} to the active board.`,
      metadata: { leadId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.restored", { leadId: id });
    return restored;
  }

  /**
   * The state change itself, without the log — shared with `upsert`, which
   * revives an archived lead when the same person comes back rather than
   * writing into a record nobody can see.
   */
  private async reviveUnlocked(existing: Lead, actor: UserId, at: number): Promise<Lead> {
    let card: { cardId: string } | null = null;
    if (this.pipeline) {
      card = await this.pipeline.addLeadCard({
        agencyId: this.agencyId,
        leadId: existing.id,
        email: existing.email,
        phone: existing.phone,
        name: existing.name,
        company: existing.company,
        source: existing.source,
        // Honoured only if that column still exists; the adapter falls back to
        // "New" rather than parking the card somewhere nothing renders.
        columnId: existing.archivedFromColumnId,
      });
    }
    const restored: Lead = {
      ...existing,
      archivedAt: undefined,
      archivedBy: undefined,
      archivedFromColumnId: undefined,
      pipelineCardId: card?.cardId,
      journeyEvents: [...(existing.journeyEvents ?? []), journeyEvent("restored", at, { actorUserId: actor })],
    };
    await this.storage.set(leadKey(existing.id), restored);
    return restored;
  }

  /**
   * Permanent. No archive, no restore, nothing left to find.
   *
   * This is the old `delete()` under an honest name. It stays because erasure
   * and genuine mistakes need it — but nothing routine should call it, and the
   * route that does says "permanently" in its own copy.
   */
  async purge(id: string, actor: UserId): Promise<boolean> {
    return withLeadIdentityLock(this.agencyId, this.storage, () => this.purgeUnlocked(id, actor));
  }

  private async purgeUnlocked(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    // The card goes first. If the write below fails the lead survives WITH its
    // card gone, which is recoverable; the other order leaves an orphan card
    // holding contact details for a lead that no longer exists — the exact
    // failure this issue was raised for.
    if (this.pipeline?.removeLeadCards) {
      await this.pipeline.removeLeadCards({ agencyId: this.agencyId, leadId: id, cardId: existing.pipelineCardId });
    }
    await this.storage.del(leadKey(id));
    if (existing.email && await this.storage.get<string>(emailPtrKey(existing.email)) === id) {
      await this.storage.del(emailPtrKey(existing.email));
    }
    const phone = canonPhone(existing.phone ?? "");
    if (phone && await this.storage.get<string>(phonePtrKey(phone)) === id) {
      await this.storage.del(phonePtrKey(phone));
    }
    const index = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    await this.storage.set(LEAD_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.purged",
      message: `Permanently deleted lead ${leadLabel(existing)}.`,
      metadata: { leadId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.purged", { leadId: id });
    return true;
  }

  // Right-to-be-forgotten: strip a lead's identity, keep the de-identified
  // funnel record. Called by the plugin's `onEraseClient` hook for the lead(s)
  // that converted into the erased client.
  //
  // ANONYMISE, not delete — the erasure disposition policy (see
  // docs/development/plans/plugin-data-erasure.md) assigns relationship /
  // lifecycle facts to anonymise: drop who they WERE, keep what they DID
  // (source, timing, stage, journey), the same treatment the live
  // `brand_enquiries` scrub applies. The email/phone POINTER KEYS hold PII in
  // the key NAME, so they are deleted outright — a value-scan can never reach
  // those. `convertedClientId` is kept: with the client record itself deleted
  // it is a random token, exactly as retained finance records keep theirs, and
  // it is what makes this hook re-runnable (the contract requires idempotency).
  //
  // Leaving an emailless lead is a shape the app already supports — a lead may
  // be captured phone-only (`upsert` requires an email OR a phone), and
  // campaign sends already skip leads with no email address.
  async anonymiseForErasure(id: string, actor: UserId): Promise<Lead | null> {
    return withLeadIdentityLock(this.agencyId, this.storage, () => this.anonymiseForErasureUnlocked(id, actor));
  }

  private async anonymiseForErasureUnlocked(id: string, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.email && await this.storage.get<string>(emailPtrKey(existing.email)) === id) {
      await this.storage.del(emailPtrKey(existing.email));
    }
    const phone = canonPhone(existing.phone ?? "");
    if (phone && await this.storage.get<string>(phonePtrKey(phone)) === id) {
      await this.storage.del(phonePtrKey(phone));
    }
    const alreadyAnonymised = !existing.email && !existing.phone && !existing.name && !existing.company;
    const anonymised: Lead = {
      ...existing,
      email: "",
      name: undefined,
      phone: undefined,
      company: undefined,
      // The canonical Person link is an identity handle, not a funnel fact.
      personId: undefined,
      notes: undefined,
      customFields: undefined,
    };
    await this.storage.set(leadKey(id), anonymised);
    if (!alreadyAnonymised) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "leads",
        action: "leads.lead.anonymised",
        message: `Anonymised lead ${id} for client erasure — identity removed, funnel record kept.`,
        metadata: { leadId: id },
      });
    }
    return anonymised;
  }

  // ─── CSV import ─────────────────────────────────────────────────────────
  //
  // Walks each row, runs `upsert` on canonical email, returns a
  // structured result. The handler converts this to the JSON envelope
  // documented in the round goal D.

  async importCsv(args: {
    text: string;
    filename?: string;
    actor: UserId;
    defaultSource?: string;
    defaultTags?: string[];
    defaultRelationshipCategory?: LeadRelationshipCategory;
    mapping?: Record<string, string>;
    customFieldTypes?: Record<string, "text" | "textarea" | "number" | "date" | "url" | "email" | "select" | "multi-select" | "checkbox">;
    validateCustomFields?: (values: Record<string, CustomFieldValue>, existing?: Record<string, CustomFieldValue>) => Record<string, CustomFieldValue>;
  }): Promise<CsvImportResult> {
    const parsed = parseCsv(args.text);
    const mappedColumns = Object.entries(args.mapping ?? {})
      .map(([index, target]) => ({ index: Number(index), target }))
      .filter(item => Number.isInteger(item.index) && item.index >= 0 && item.target && item.target !== "skip");
    const mappedIndex = (target: string) => mappedColumns.find(item => item.target === target)?.index;
    const emailIndex = mappedColumns.length ? mappedIndex("email") : parsed.headerVariants.email;
    if (emailIndex == null) {
      return {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 0, reason: "csv_missing_email_column" }],
      };
    }
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];
    const source = args.defaultSource ?? `csv:${args.filename ?? "upload"}`;

    for (const row of parsed.rows) {
      const cell = (target: string, fallback?: string) => {
        const index = mappedColumns.length ? mappedIndex(target) : undefined;
        return index == null ? fallback : row.raw[index]?.trim();
      };
      const email = row.raw[emailIndex]?.trim();
      if (!email) {
        skipped += 1;
        errors.push({ row: row.rowNumber, reason: "missing_email" });
        continue;
      }
      try {
        const rawTags = cell("tags", row.tags?.join(",") ?? "");
        const rowTags = rawTags ? rawTags.split(/[,;|]/).map(tag => tag.trim()).filter(Boolean) : [];
        const tags = Array.from(new Set([...(args.defaultTags ?? []), ...rowTags]));
        const customFieldEntries: Array<[string, CustomFieldValue]> = [];
        for (const { index, target } of mappedColumns) {
          if (!target.startsWith("custom:")) continue;
          const id = target.slice("custom:".length);
          const raw = row.raw[index]?.trim() ?? "";
          if (!id || !raw) continue;
          const type = args.customFieldTypes?.[id];
          if (type === "checkbox") customFieldEntries.push([id, /^(true|yes|y|1|checked)$/i.test(raw)]);
          else if (type === "multi-select") customFieldEntries.push([id, raw.split(/[,;|]/).map(item => item.trim()).filter(Boolean)]);
          else customFieldEntries.push([id, raw]);
        }
        const submittedCustomFields = Object.fromEntries(customFieldEntries);
        const existing = await this.getByEmail(email);
        const customFields = args.validateCustomFields
          ? args.validateCustomFields(submittedCustomFields, existing?.customFields)
          : submittedCustomFields;
        const rowRelationshipCategory = cell("relationshipCategory");
        const result = await this.upsert(
          {
            email,
            name: cell("name", row.name),
            phone: cell("phone", row.phone),
            company: cell("company", row.company),
            tags,
            source: cell("source", row.source) || source,
            relationshipCategory: isLeadRelationshipCategory(rowRelationshipCategory)
              ? rowRelationshipCategory
              : args.defaultRelationshipCategory ?? "scraped-list",
            notes: cell("notes", row.notes),
            customFields,
          },
          args.actor,
        );
        if (result.created) imported += 1;
        else updated += 1;
      } catch (err) {
        skipped += 1;
        errors.push({
          row: row.rowNumber,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: args.actor,
      category: "leads",
      action: "leads.csv.imported",
      message: `Imported ${imported} new + ${updated} updated lead${imported + updated === 1 ? "" : "s"} from ${args.filename ?? "upload"}.`,
      metadata: { imported, updated, skipped, filename: args.filename },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.csv.imported", { imported, updated, skipped });
    return { imported, updated, skipped, errors };
  }

  // ─── Audience filter ───────────────────────────────────────────────────
  //
  // Resolves a declarative AudienceFilter to a Lead[] at send time.
  // Pipeline-column lookups go through the optional PipelinePort —
  // when absent, the filter clause is treated as "no constraint" so
  // sends still go out (matches the agency's "best-effort" expectation
  // when the foundation hasn't wired up the pipeline link yet).

  async resolveAudience(filter: AudienceFilter): Promise<Lead[]> {
    const all = await this.list();
    const companySet = filter.companyIds && filter.companyIds.length > 0 ? new Set(filter.companyIds) : null;
    const tagSet = filter.tags && filter.tags.length > 0 ? new Set(filter.tags) : null;
    const sourceSet = filter.sourcedFrom && filter.sourcedFrom.length > 0 ? new Set(filter.sourcedFrom) : null;
    const cutoffStamp = filter.notContactedSinceMs != null ? now() - filter.notContactedSinceMs : null;

    let pipelineLeadIds: Set<string> | null = null;
    if (filter.pipelineColumn && this.pipeline) {
      const ids = await this.pipeline.leadIdsInColumn({
        agencyId: this.agencyId,
        columnLabel: filter.pipelineColumn,
      });
      pipelineLeadIds = new Set(ids);
    }

    return all.filter(lead => {
      const leadCompanyIds = lead.companyIds ?? (lead.companyId ? [lead.companyId] : []);
      if (companySet && !leadCompanyIds.some(companyId => companySet.has(companyId))) return false;
      if (tagSet && !lead.tags.some(t => tagSet.has(t))) return false;
      if (sourceSet && !sourceSet.has(lead.source)) return false;
      if (cutoffStamp != null && (lead.lastContactedAt ?? 0) > cutoffStamp) return false;
      if (pipelineLeadIds && !pipelineLeadIds.has(lead.id)) return false;
      return true;
    });
  }

  // Used by Lead→Contact promotion: the foundation pipelines plugin
  // emits `pipelines.card.moved`; if the destination column maps to
  // "Won", the subscriber calls `markPromoted` to stamp metadata.
  async stampLastEmailedAt(leadId: string, ts: number, actor: UserId): Promise<Lead | null> {
    return this.recordContact(leadId, {
      at: ts,
      channel: "email",
      outcome: "sent",
      note: "Campaign email sent.",
      incrementSentCount: true,
    }, actor);
  }

  // ─── LeadCard projection (re-export for convenience) ─────────────────
  static projectLeadCard = projectLeadCard;
}
