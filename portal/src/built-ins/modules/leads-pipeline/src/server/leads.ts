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
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  AudienceFilter,
  CreateLeadInput,
  CustomFieldValue,
  CsvImportResult,
  Lead,
  LeadFilter,
  UpdateLeadPatch,
} from "../lib/domain";
import { projectLeadCard } from "../lib/domain";
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

function canonPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

function leadLabel(lead: Pick<Lead, "email" | "phone" | "name" | "id">): string {
  return lead.email || lead.phone || lead.name || lead.id;
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
    const rows: Lead[] = [];
    for (const id of index) {
      const row = await this.storage.get<Lead>(leadKey(id));
      if (row && row.agencyId === this.agencyId) rows.push(row);
    }
    if (!filter) return rows.sort((a, b) => b.capturedAt - a.capturedAt);
    const q = filter.query?.toLowerCase().trim();
    const cutoff = filter.notContactedSinceMs;
    const cutoffStamp = cutoff != null ? now() - cutoff : null;
    return rows
      .filter(l => !filter.tag || l.tags.includes(filter.tag))
      .filter(l => !filter.source || l.source === filter.source)
      .filter(l => !q || `${l.name ?? ""} ${l.email} ${l.company ?? ""}`.toLowerCase().includes(q))
      .filter(l => cutoffStamp == null || (l.lastContactedAt ?? 0) <= cutoffStamp)
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }

  async get(id: string): Promise<Lead | null> {
    const row = await this.storage.get<Lead>(leadKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
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
      const existing = await this.get(existingId);
      if (existing) {
        const patched = await this.update(existing.id, {
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
          tags: input.tags && input.tags.length > 0
            ? Array.from(new Set([...existing.tags, ...input.tags]))
            : existing.tags,
          notes: existing.notes ?? input.notes,
          customFields: { ...(input.customFields ?? {}), ...(existing.customFields ?? {}) },
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
        return { lead: patched ?? existing, created: false };
      }
    }
    const id = makeId("lead");
    const ts = now();
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
      capturedAt: input.capturedAt ?? ts,
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
        await this.update(id, { pipelineCardId: card.cardId }, actor);
      }
    }

    return { lead, created: true };
  }

  async update(id: string, patch: UpdateLeadPatch, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const email = patch.email === undefined ? existing.email : canonEmail(patch.email);
    const phone = patch.phone === undefined ? existing.phone : patch.phone.trim() || undefined;
    if (email && !PLAUSIBLE_EMAIL.test(email)) throw new Error(`Implausible email: ${patch.email}`);
    if (!email && !PLAUSIBLE_PHONE.test(canonPhone(phone ?? ""))) {
      throw new Error("A valid email address or phone number is required.");
    }
    const updated: Lead = {
      ...existing,
      ...patch,
      email,
      phone,
      tags: patch.tags ?? existing.tags,
    };
    await this.storage.set(leadKey(id), updated);
    if (existing.email && existing.email !== updated.email) await this.storage.del(emailPtrKey(existing.email));
    if (updated.email) await this.storage.set(emailPtrKey(updated.email), id);
    const existingPhone = canonPhone(existing.phone ?? "");
    const updatedPhone = canonPhone(updated.phone ?? "");
    if (existingPhone && existingPhone !== updatedPhone) await this.storage.del(phonePtrKey(existingPhone));
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

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(leadKey(id));
    if (existing.email) await this.storage.del(emailPtrKey(existing.email));
    const phone = canonPhone(existing.phone ?? "");
    if (phone) await this.storage.del(phonePtrKey(phone));
    const index = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    await this.storage.set(LEAD_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.archived",
      message: `Archived lead ${leadLabel(existing)}.`,
      metadata: { leadId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.archived", { leadId: id });
    return true;
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
    mapping?: Record<string, string>;
    customFieldTypes?: Record<string, "text" | "number" | "date" | "url" | "select" | "multi-select" | "checkbox">;
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
        const customFields = Object.fromEntries(customFieldEntries);
        const result = await this.upsert(
          {
            email,
            name: cell("name", row.name),
            phone: cell("phone", row.phone),
            company: cell("company", row.company),
            tags,
            source: cell("source", row.source) || source,
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
    const existing = await this.get(leadId);
    if (!existing) return null;
    const sentCount = (existing.sentCount ?? 0) + 1;
    return this.update(leadId, { lastContactedAt: ts, sentCount }, actor);
  }

  // ─── LeadCard projection (re-export for convenience) ─────────────────
  static projectLeadCard = projectLeadCard;
}
