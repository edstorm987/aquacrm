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

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Create-or-update on canonical email. Returns `{lead, created}` so
  // CSV import can tell whether a row was new or merged.
  async upsert(input: CreateLeadInput, actor: UserId): Promise<{ lead: Lead; created: boolean }> {
    const email = canonEmail(input.email);
    if (!PLAUSIBLE_EMAIL.test(email)) {
      throw new Error(`Implausible email: ${input.email}`);
    }
    const existingId = await this.storage.get<string>(emailPtrKey(email));
    if (existingId) {
      const existing = await this.get(existingId);
      if (existing) {
        const patched = await this.update(existing.id, {
          // Only fill blanks — never clobber existing notes/tags from a re-import.
          name: existing.name ?? input.name,
          phone: existing.phone ?? input.phone,
          company: existing.company ?? input.company,
          tags: input.tags && input.tags.length > 0
            ? Array.from(new Set([...existing.tags, ...input.tags]))
            : existing.tags,
          notes: existing.notes ?? input.notes,
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
      name: input.name?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      company: input.company?.trim() || undefined,
      tags: input.tags ?? [],
      source: input.source,
      capturedAt: input.capturedAt ?? ts,
      notes: input.notes,
      sentCount: 0,
    };
    await this.storage.set(leadKey(id), lead);
    await this.storage.set(emailPtrKey(email), id);
    const index = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(LEAD_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.created",
      message: `Captured lead ${lead.email} from ${lead.source}.`,
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
    const updated: Lead = {
      ...existing,
      ...patch,
      tags: patch.tags ?? existing.tags,
    };
    await this.storage.set(leadKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.updated",
      message: `Updated lead ${updated.email}.`,
      metadata: { leadId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.lead.updated", { leadId: id });
    return updated;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(leadKey(id));
    await this.storage.del(emailPtrKey(existing.email));
    const index = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    await this.storage.set(LEAD_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.lead.archived",
      message: `Archived lead ${existing.email}.`,
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
  }): Promise<CsvImportResult> {
    const parsed = parseCsv(args.text);
    if (!("email" in parsed.headerVariants)) {
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
      if (!row.email || row.email.length === 0) {
        skipped += 1;
        errors.push({ row: row.rowNumber, reason: "missing_email" });
        continue;
      }
      try {
        const tags = Array.from(new Set([...(args.defaultTags ?? []), ...(row.tags ?? [])]));
        const result = await this.upsert(
          {
            email: row.email,
            name: row.name,
            phone: row.phone,
            company: row.company,
            tags,
            source: row.source && row.source.length > 0 ? row.source : source,
            notes: row.notes,
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
