import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateProspectInput,
  Prospect,
  ProspectNote,
  ProspectOutreachAttempt,
  ProspectQualificationState,
  RecordProspectOutreachInput,
  UpdateProspectPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const PROSPECT_INDEX_KEY = "prospects/index";
const prospectKey = (id: string): string => `prospect:${id}`;

function clean(value?: string): string | undefined {
  return value?.trim() || undefined;
}

function cleanTags(values?: string[]): string[] {
  return [...new Set((values ?? []).map(value => value.trim().toLowerCase()).filter(Boolean))];
}

function cleanFitScore(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanTimestamp(value?: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeProspect(row: Prospect): Prospect {
  return {
    ...row,
    tags: cleanTags(row.tags),
    qualificationState: row.qualificationState ?? (row.researchNotes ? "researching" : "unreviewed"),
    fitScore: cleanFitScore(row.fitScore),
    outreachAttempts: Array.isArray(row.outreachAttempts) ? row.outreachAttempts : [],
    notes: Array.isArray(row.notes) ? row.notes : [],
  };
}

function stateFromOutreach(input: RecordProspectOutreachInput): ProspectQualificationState {
  if (["replied", "interested", "meeting-booked"].includes(input.outcome)) return "engaged";
  if (["not-now", "not-fit"].includes(input.outcome)) return "not-now";
  return "outreach";
}

function prospectLabel(prospect: Pick<Prospect, "company" | "name" | "website">): string {
  return prospect.company || prospect.name || prospect.website || "Unnamed prospect";
}

export class ProspectService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<Prospect[]> {
    const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
    const rows: Prospect[] = [];
    for (const id of index) {
      const row = await this.storage.get<Prospect>(prospectKey(id));
      if (row && row.agencyId === this.agencyId) rows.push(normalizeProspect(row));
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Prospect | null> {
    const row = await this.storage.get<Prospect>(prospectKey(id));
    return row && row.agencyId === this.agencyId ? normalizeProspect(row) : null;
  }

  async create(input: CreateProspectInput, actor: UserId): Promise<Prospect> {
    const company = clean(input.company);
    const name = clean(input.name);
    const website = clean(input.website);
    if (!company && !name && !website) {
      throw new Error("Add a business name, person, or website.");
    }
    const stamp = now();
    const prospect: Prospect = {
      id: makeId("prospect"),
      agencyId: this.agencyId,
      name,
      company,
      email: clean(input.email)?.toLowerCase(),
      phone: clean(input.phone),
      website,
      address: clean(input.address),
      googleMapsUrl: clean(input.googleMapsUrl),
      instagramUrl: clean(input.instagramUrl),
      facebookUrl: clean(input.facebookUrl),
      linkedinUrl: clean(input.linkedinUrl),
      niche: clean(input.niche),
      tags: cleanTags(input.tags),
      source: clean(input.source) ?? "other",
      foundAt: clean(input.foundAt),
      opportunity: clean(input.opportunity),
      researchNotes: clean(input.researchNotes),
      nextStep: clean(input.nextStep),
      qualificationState: input.qualificationState ?? (input.researchNotes ? "researching" : "unreviewed"),
      fitScore: cleanFitScore(input.fitScore),
      preferredChannel: input.preferredChannel,
      doNotContact: Boolean(input.doNotContact),
      nextContactAt: cleanTimestamp(input.nextContactAt),
      nextContactReason: clean(input.nextContactReason),
      outreachAttempts: [],
      notes: [],
      status: "scouting",
      capturedAt: stamp,
      updatedAt: stamp,
    };
    await this.storage.set(prospectKey(prospect.id), prospect);
    const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
    await this.storage.set(PROSPECT_INDEX_KEY, [...index, prospect.id]);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.created",
      message: `Scouted ${prospectLabel(prospect)} from ${prospect.source}.`,
      metadata: { prospectId: prospect.id, niche: prospect.niche, source: prospect.source },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.created", { prospectId: prospect.id });
    return prospect;
  }

  async update(id: string, patch: UpdateProspectPatch, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated: Prospect = {
      ...existing,
      ...patch,
      name: patch.name === undefined ? existing.name : clean(patch.name),
      company: patch.company === undefined ? existing.company : clean(patch.company),
      email: patch.email === undefined ? existing.email : clean(patch.email)?.toLowerCase(),
      phone: patch.phone === undefined ? existing.phone : clean(patch.phone),
      website: patch.website === undefined ? existing.website : clean(patch.website),
      address: patch.address === undefined ? existing.address : clean(patch.address),
      googleMapsUrl: patch.googleMapsUrl === undefined ? existing.googleMapsUrl : clean(patch.googleMapsUrl),
      instagramUrl: patch.instagramUrl === undefined ? existing.instagramUrl : clean(patch.instagramUrl),
      facebookUrl: patch.facebookUrl === undefined ? existing.facebookUrl : clean(patch.facebookUrl),
      linkedinUrl: patch.linkedinUrl === undefined ? existing.linkedinUrl : clean(patch.linkedinUrl),
      niche: patch.niche === undefined ? existing.niche : clean(patch.niche),
      tags: patch.tags === undefined ? existing.tags : cleanTags(patch.tags),
      source: patch.source === undefined ? existing.source : clean(patch.source) ?? "other",
      foundAt: patch.foundAt === undefined ? existing.foundAt : clean(patch.foundAt),
      opportunity: patch.opportunity === undefined ? existing.opportunity : clean(patch.opportunity),
      researchNotes: patch.researchNotes === undefined ? existing.researchNotes : clean(patch.researchNotes),
      nextStep: patch.nextStep === undefined ? existing.nextStep : clean(patch.nextStep),
      fitScore: patch.fitScore === undefined ? existing.fitScore : cleanFitScore(patch.fitScore),
      nextContactAt: patch.nextContactAt === undefined
        ? existing.nextContactAt
        : cleanTimestamp(patch.nextContactAt),
      nextContactReason: patch.nextContactReason === undefined ? existing.nextContactReason : clean(patch.nextContactReason),
      updatedAt: now(),
    };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.updated",
      message: `Updated scouting record for ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, fields: Object.keys(patch) },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.updated", {
      prospectId: id,
      status: updated.status,
    });
    return updated;
  }

  async dismiss(id: string, actor: UserId): Promise<Prospect | null> {
    return this.update(id, { status: "dismissed" }, actor);
  }

  async recordOutreach(id: string, input: RecordProspectOutreachInput, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "scouting") throw new Error("Only active scouting prospects can be contacted.");
    if (existing.doNotContact) throw new Error("Remove the do-not-contact hold before recording outreach.");
    const at = cleanTimestamp(input.contactedAt) ?? now();
    const followUpAt = cleanTimestamp(input.followUpAt);
    const attempt: ProspectOutreachAttempt = {
      id: makeId("prospect_attempt"),
      at,
      actorUserId: actor,
      channel: input.channel,
      outcome: input.outcome,
      note: clean(input.note),
      followUpAt,
      followUpReason: clean(input.followUpReason),
    };
    const updated: Prospect = {
      ...existing,
      qualificationState: stateFromOutreach(input),
      preferredChannel: existing.preferredChannel ?? input.channel,
      doNotContact: input.outcome === "not-fit" ? true : existing.doNotContact,
      lastContactedAt: at,
      nextContactAt: followUpAt,
      nextContactReason: clean(input.followUpReason),
      outreachAttempts: [...existing.outreachAttempts, attempt],
      updatedAt: now(),
    };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.outreach-recorded",
      message: `Recorded ${input.channel} outreach to ${prospectLabel(updated)}: ${input.outcome}.`,
      metadata: { prospectId: id, attemptId: attempt.id, channel: input.channel, outcome: input.outcome, followUpAt },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.outreach-recorded", { prospectId: id, attempt });
    return updated;
  }

  async addNote(id: string, body: string, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const cleaned = clean(body);
    if (!cleaned) throw new Error("Note cannot be empty.");
    const note: ProspectNote = { id: makeId("prospect_note"), at: now(), actorUserId: actor, body: cleaned };
    const updated: Prospect = { ...existing, notes: [...existing.notes, note], updatedAt: note.at };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.note-added",
      message: `Added scouting context to ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, noteId: note.id },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.note-added", { prospectId: id, noteId: note.id });
    return updated;
  }
}
