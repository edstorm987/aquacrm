import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateProspectInput,
  Prospect,
  ProspectFollowUp,
  ProspectInspectionCheck,
  ProspectNote,
  ProspectOutreachAttempt,
  ProspectQualificationState,
  RecordProspectOutreachInput,
  ResolveProspectFollowUpInput,
  ScheduleProspectFollowUpInput,
  UpdateProspectPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const PROSPECT_INDEX_KEY = "prospects/index";
const prospectKey = (id: string): string => `prospect:${id}`;
const INSPECTION_CHECKS = new Set<ProspectInspectionCheck>([
  "business-verified",
  "contact-route-verified",
  "opportunity-confirmed",
  "decision-maker-identified",
  "timing-understood",
]);
export const REQUIRED_PROSPECT_INSPECTION_CHECKS: ProspectInspectionCheck[] = [
  "business-verified",
  "contact-route-verified",
  "opportunity-confirmed",
];

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

function cleanInspectionChecks(values?: ProspectInspectionCheck[]): ProspectInspectionCheck[] {
  return [...new Set((values ?? []).filter(value => INSPECTION_CHECKS.has(value)))];
}

function openFollowUps(followUps: ProspectFollowUp[]): ProspectFollowUp[] {
  return followUps.filter(item => item.status === "scheduled").sort((a, b) => a.dueAt - b.dueAt);
}

function nextFollowUp(followUps: ProspectFollowUp[]): ProspectFollowUp | undefined {
  return openFollowUps(followUps)[0];
}

function legacyFollowUp(row: Prospect): ProspectFollowUp[] {
  const dueAt = cleanTimestamp(row.nextContactAt);
  if (!dueAt) return [];
  return [{
    id: `legacy_follow_up_${row.id}`,
    createdAt: row.updatedAt || row.capturedAt,
    dueAt,
    reason: row.nextContactReason || "Recontact prospect",
    channel: row.preferredChannel,
    status: "scheduled",
  }];
}

function normalizeFollowUps(row: Prospect): ProspectFollowUp[] {
  const source = Array.isArray(row.followUps) ? row.followUps : legacyFollowUp(row);
  return source.flatMap(item => {
    const dueAt = cleanTimestamp(item?.dueAt);
    if (!dueAt) return [];
    const createdAt = cleanTimestamp(item.createdAt) ?? cleanTimestamp(row.updatedAt) ?? cleanTimestamp(row.capturedAt) ?? now();
    const status = item.status === "completed" || item.status === "skipped" ? item.status : "scheduled";
    return [{
      ...item,
      id: clean(item.id) ?? `normalized_follow_up_${row.id}_${dueAt}`,
      createdAt,
      dueAt,
      reason: clean(item.reason) ?? "Recontact prospect",
      status,
      resolvedAt: cleanTimestamp(item.resolvedAt),
      resolutionNote: clean(item.resolutionNote),
    }];
  });
}

function normalizeProspect(row: Prospect): Prospect {
  const followUps = normalizeFollowUps(row);
  const next = nextFollowUp(followUps);
  return {
    ...row,
    tags: cleanTags(row.tags),
    qualificationState: row.qualificationState ?? (row.researchNotes ? "researching" : "unreviewed"),
    fitScore: cleanFitScore(row.fitScore),
    inspectionChecks: cleanInspectionChecks(row.inspectionChecks),
    followUps,
    nextContactAt: next?.dueAt,
    nextContactReason: next?.reason,
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
      inspectionChecks: cleanInspectionChecks(input.inspectionChecks),
      inspectedAt: cleanTimestamp(input.inspectedAt),
      followUps: [],
      outreachAttempts: [],
      notes: [],
      status: "scouting",
      capturedAt: stamp,
      updatedAt: stamp,
    };
    if (prospect.nextContactAt) {
      prospect.followUps = [{
        id: makeId("prospect_follow_up"),
        createdAt: stamp,
        createdBy: actor,
        dueAt: prospect.nextContactAt,
        reason: prospect.nextContactReason || "Recontact prospect",
        channel: prospect.preferredChannel,
        status: "scheduled",
      }];
    }
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
    let followUps = existing.followUps;
    if (patch.nextContactAt !== undefined) {
      const stamp = now();
      followUps = followUps.map(item => item.status === "scheduled"
        ? { ...item, status: "skipped" as const, resolvedAt: stamp, resolutionNote: "Replaced while editing the dossier." }
        : item);
      const dueAt = cleanTimestamp(patch.nextContactAt);
      if (dueAt) {
        followUps = [...followUps, {
          id: makeId("prospect_follow_up"),
          createdAt: stamp,
          createdBy: actor,
          dueAt,
          reason: clean(patch.nextContactReason) || "Recontact prospect",
          channel: patch.preferredChannel ?? existing.preferredChannel,
          status: "scheduled" as const,
        }];
      }
    }
    const scheduled = nextFollowUp(followUps);
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
      inspectionChecks: patch.inspectionChecks === undefined ? existing.inspectionChecks : cleanInspectionChecks(patch.inspectionChecks),
      inspectedAt: patch.inspectedAt === undefined ? existing.inspectedAt : cleanTimestamp(patch.inspectedAt),
      followUps,
      nextContactAt: scheduled?.dueAt,
      nextContactReason: scheduled?.reason,
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
    if (!existing.inspectedAt || !REQUIRED_PROSPECT_INSPECTION_CHECKS.every(check => existing.inspectionChecks.includes(check))) {
      throw new Error("Complete the required scouting inspection before recording outreach.");
    }
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
    let followUps = existing.followUps;
    const dueFollowUp = openFollowUps(followUps).find(item => item.dueAt <= at);
    if (dueFollowUp) {
      followUps = followUps.map(item => item.id === dueFollowUp.id
        ? { ...item, status: "completed" as const, resolvedAt: at, resolutionNote: `Outreach recorded: ${input.outcome}.` }
        : item);
    }
    if (followUpAt) {
      followUps = [...followUps, {
        id: makeId("prospect_follow_up"),
        createdAt: at,
        createdBy: actor,
        dueAt: followUpAt,
        reason: clean(input.followUpReason) || "Continue outreach",
        channel: input.channel,
        status: "scheduled" as const,
      }];
    }
    const scheduled = nextFollowUp(followUps);
    const updated: Prospect = {
      ...existing,
      qualificationState: stateFromOutreach(input),
      preferredChannel: existing.preferredChannel ?? input.channel,
      doNotContact: input.outcome === "not-fit" ? true : existing.doNotContact,
      lastContactedAt: at,
      followUps,
      nextContactAt: scheduled?.dueAt,
      nextContactReason: scheduled?.reason,
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

  async saveInspection(id: string, checks: ProspectInspectionCheck[], actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const inspectionChecks = cleanInspectionChecks(checks);
    const complete = REQUIRED_PROSPECT_INSPECTION_CHECKS.every(check => inspectionChecks.includes(check));
    const updated: Prospect = {
      ...existing,
      inspectionChecks,
      inspectedAt: complete ? (existing.inspectedAt ?? now()) : undefined,
      qualificationState: complete && ["unreviewed", "researching"].includes(existing.qualificationState)
        ? "ready"
        : existing.qualificationState,
      updatedAt: now(),
    };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.inspection-saved",
      message: `${complete ? "Completed" : "Updated"} scouting inspection for ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, checks: inspectionChecks, complete },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.inspection-saved", { prospectId: id, checks: inspectionChecks, complete });
    return updated;
  }

  async scheduleFollowUp(id: string, input: ScheduleProspectFollowUpInput, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "scouting") throw new Error("Only active scouting prospects can receive follow-ups.");
    const dueAt = cleanTimestamp(input.dueAt);
    const reason = clean(input.reason);
    if (!dueAt) throw new Error("Choose a valid follow-up date and time.");
    if (dueAt < now() - 60_000) throw new Error("Choose a follow-up time in the future.");
    if (!reason) throw new Error("Add the reason for this follow-up.");
    const followUp: ProspectFollowUp = {
      id: makeId("prospect_follow_up"),
      createdAt: now(),
      createdBy: actor,
      dueAt,
      reason,
      channel: input.channel,
      status: "scheduled",
    };
    const followUps = [...existing.followUps, followUp];
    const scheduled = nextFollowUp(followUps);
    const updated: Prospect = {
      ...existing,
      followUps,
      nextContactAt: scheduled?.dueAt,
      nextContactReason: scheduled?.reason,
      updatedAt: now(),
    };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.follow-up-scheduled",
      message: `Scheduled ${input.channel ?? "outreach"} follow-up with ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, followUpId: followUp.id, dueAt, reason, channel: input.channel },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.follow-up-scheduled", { prospectId: id, followUp });
    return updated;
  }

  async resolveFollowUp(id: string, input: ResolveProspectFollowUpInput, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const followUp = existing.followUps.find(item => item.id === input.followUpId);
    if (!followUp) throw new Error("Follow-up not found.");
    if (followUp.status !== "scheduled") throw new Error("This follow-up is already resolved.");
    const stamp = now();
    const followUps = existing.followUps.map(item => item.id === followUp.id
      ? { ...item, status: input.status, resolvedAt: stamp, resolutionNote: clean(input.resolutionNote) }
      : item);
    const scheduled = nextFollowUp(followUps);
    const updated: Prospect = {
      ...existing,
      followUps,
      nextContactAt: scheduled?.dueAt,
      nextContactReason: scheduled?.reason,
      updatedAt: stamp,
    };
    await this.storage.set(prospectKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.follow-up-resolved",
      message: `${input.status === "completed" ? "Completed" : "Skipped"} follow-up with ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, followUpId: followUp.id, status: input.status },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.follow-up-resolved", { prospectId: id, followUpId: followUp.id, status: input.status });
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
