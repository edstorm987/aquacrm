import crypto from "node:crypto";

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import { normalizeGooglePlaceId } from "../lib/domain";
import type {
  CreateProspectInput,
  Lead,
  Prospect,
  ProspectFollowUp,
  ProspectInspectionCheck,
  ProspectNote,
  ProspectOutreachAttempt,
  ProspectOutreachChannel,
  ProspectOutreachOutcome,
  ProspectQualificationState,
  ProspectStatus,
  RecordProspectOutreachInput,
  ResolveProspectFollowUpInput,
  ScheduleProspectFollowUpInput,
  UpdateProspectPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";

const PROSPECT_INDEX_KEY = "prospects/index";
const prospectKey = (id: string): string => `prospect:${id}`;
const prospectLeadPointerKey = (leadId: string): string => `prospects/lead/${leadId}`;
const mutationQueues = new Map<AgencyId, Promise<void>>();
export const MIGRATED_LEAD_CONTACT_NOTE_PREFIX = "migrated_lead_contact_";
const PROSPECT_LIMITS = {
  name: 160,
  company: 200,
  email: 320,
  phone: 80,
  address: 500,
  niche: 120,
  source: 160,
  foundAt: 500,
  opportunity: 4_000,
  researchNotes: 10_000,
  nextStep: 2_000,
  nextContactReason: 1_000,
  note: 4_000,
  outreachNote: 4_000,
  followUpReason: 1_000,
  resolutionNote: 2_000,
  actorId: 160,
  tagCount: 50,
  tagLength: 80,
  historyCount: 1_000,
} as const;
const INSPECTION_CHECKS = new Set<ProspectInspectionCheck>([
  "business-verified",
  "contact-route-verified",
  "opportunity-confirmed",
  "decision-maker-identified",
  "timing-understood",
]);
const RESEARCH_PATCH_KEYS = new Set<keyof UpdateProspectPatch>([
  "email",
  "phone",
  "website",
  "address",
  "googlePlaceId",
  "googleMapsUrl",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
  "niche",
  "tags",
  "foundAt",
  "opportunity",
  "researchNotes",
  "nextStep",
  "qualificationState",
  "fitScore",
  "preferredChannel",
  "nextContactAt",
  "nextContactReason",
  "inspectionChecks",
  "inspectedAt",
]);
export const REQUIRED_PROSPECT_INSPECTION_CHECKS: ProspectInspectionCheck[] = [
  "business-verified",
  "contact-route-verified",
  "opportunity-confirmed",
];

const QUALIFICATION_STATES = new Set<ProspectQualificationState>([
  "unreviewed", "researching", "ready", "outreach", "engaged", "not-now",
]);
const PROSPECT_STATUSES = new Set<ProspectStatus>(["scouting", "qualified", "dismissed"]);
const OUTREACH_CHANNELS = new Set<ProspectOutreachChannel>([
  "call", "email", "sms", "whatsapp", "dm", "in-person",
]);
const OUTREACH_OUTCOMES = new Set<ProspectOutreachOutcome>([
  "attempted", "no-answer", "left-message", "sent", "replied", "interested",
  "not-now", "not-fit", "wrong-contact", "meeting-booked",
]);

function clean(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function normalizeLegacyText(value: unknown, maxLength: number): string | undefined {
  return clean(value)?.slice(0, maxLength);
}

function cleanProspectTextInput(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return cleaned || undefined;
}

const GOOGLE_MAPS_DIRECT_HOSTS = new Set([
  "maps.google.com",
  "maps.google.co.uk",
  "maps.app.goo.gl",
]);
const GOOGLE_MAPS_PATH_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "google.co.uk",
  "www.google.co.uk",
]);

function isGoogleMapsUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (GOOGLE_MAPS_DIRECT_HOSTS.has(host)) return true;
  if (GOOGLE_MAPS_PATH_HOSTS.has(host)) {
    return url.pathname === "/maps" || url.pathname.startsWith("/maps/");
  }
  return host === "goo.gl" && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"));
}

/**
 * Canonical browser-link boundary for prospect data. These values are later
 * rendered as hrefs, so HTML input types and React escaping are not the
 * security control: the stored value itself must be an allowed URL.
 */
type ProspectHrefKind = "generic" | "google-maps" | "instagram" | "facebook" | "linkedin";

function hostMatches(host: string, roots: readonly string[]): boolean {
  return roots.some(root => host === root || host.endsWith(`.${root}`));
}

function hrefMatchesKind(url: URL, kind: ProspectHrefKind): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (kind === "generic") return true;
  if (kind === "google-maps") return isGoogleMapsUrl(url);
  if (kind === "instagram") return hostMatches(host, ["instagram.com"]);
  if (kind === "facebook") return hostMatches(host, ["facebook.com", "fb.com"]);
  return hostMatches(host, ["linkedin.com"]);
}

function canonicalProspectHref(value: unknown, kind: ProspectHrefKind = "generic"): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 2_048) return undefined;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password) return undefined;
    if (!hrefMatchesKind(parsed, kind)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function cleanProspectHrefInput(
  value: unknown,
  label: string,
  kind: ProspectHrefKind = "generic",
): string | undefined {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) return undefined;
  const canonical = canonicalProspectHref(value, kind);
  if (!canonical) {
    if (kind === "google-maps") {
      throw new Error(`${label} must be a safe Google Maps http(s) URL without embedded credentials.`);
    }
    const destination = kind === "generic" ? "" : ` on ${kind}`;
    throw new Error(`${label} must be a safe http(s) URL${destination} without embedded credentials.`);
  }
  return canonical;
}

function normalizeLegacyTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map(value => value.trim().toLowerCase().slice(0, PROSPECT_LIMITS.tagLength))
    .filter(Boolean))]
    .slice(0, PROSPECT_LIMITS.tagCount);
}

function cleanProspectTagsInput(values: unknown): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error("Tags must be a list of text values.");
  if (values.length > PROSPECT_LIMITS.tagCount) {
    throw new Error(`Add no more than ${PROSPECT_LIMITS.tagCount} tags.`);
  }
  const tags: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") throw new Error("Every tag must be text.");
    const tag = value.trim().toLowerCase();
    if (tag.length > PROSPECT_LIMITS.tagLength) {
      throw new Error(`Each tag must be ${PROSPECT_LIMITS.tagLength} characters or fewer.`);
    }
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function cleanQualificationStateInput(
  value: unknown,
  fallback: ProspectQualificationState,
): ProspectQualificationState {
  if (value === undefined) return fallback;
  if (!QUALIFICATION_STATES.has(value as ProspectQualificationState)) {
    throw new Error("Qualification state is invalid.");
  }
  return value as ProspectQualificationState;
}

function cleanProspectStatusInput(value: unknown, fallback: ProspectStatus): ProspectStatus {
  if (value === undefined) return fallback;
  if (!PROSPECT_STATUSES.has(value as ProspectStatus)) throw new Error("Prospect status is invalid.");
  return value as ProspectStatus;
}

function cleanOutreachChannelInput(value: unknown, label: string): ProspectOutreachChannel | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!OUTREACH_CHANNELS.has(value as ProspectOutreachChannel)) throw new Error(`${label} is invalid.`);
  return value as ProspectOutreachChannel;
}

function cleanOutreachOutcomeInput(value: unknown): ProspectOutreachOutcome {
  if (!OUTREACH_OUTCOMES.has(value as ProspectOutreachOutcome)) throw new Error("Outreach outcome is invalid.");
  return value as ProspectOutreachOutcome;
}

function cleanInspectionChecksInput(values: unknown): ProspectInspectionCheck[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error("Inspection checks must be a list.");
  const checks: ProspectInspectionCheck[] = [];
  for (const value of values) {
    if (!INSPECTION_CHECKS.has(value as ProspectInspectionCheck)) throw new Error("Inspection check is invalid.");
    if (!checks.includes(value as ProspectInspectionCheck)) checks.push(value as ProspectInspectionCheck);
  }
  return checks;
}

function cleanFitScore(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanTimestamp(value?: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function cleanOutreachAttemptId(value?: string): string | undefined {
  const cleaned = clean(value);
  if (!cleaned) return undefined;
  if (cleaned.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(cleaned)) {
    throw new Error("Outreach attempt id is invalid.");
  }
  return cleaned;
}

async function withProspectMutationLock<T>(
  agencyId: AgencyId,
  storage: PluginStorage,
  work: () => Promise<T>,
): Promise<T> {
  const previous = mutationQueues.get(agencyId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  mutationQueues.set(agencyId, queued);
  await previous;
  try {
    if (typeof storage.runExclusive !== "function") {
      throw new Error("prospect_mutation_requires_exclusive_storage");
    }
    return await storage.runExclusive(`acquisition-state:${agencyId}`, work);
  } finally {
    release();
    if (mutationQueues.get(agencyId) === queued) mutationQueues.delete(agencyId);
  }
}

function cleanGooglePlaceIdInput(value: unknown): string | undefined {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) return undefined;
  const normalized = normalizeGooglePlaceId(value);
  if (!normalized) throw new Error("Google Place ID is invalid.");
  return normalized;
}

function cleanInspectionChecks(values?: ProspectInspectionCheck[]): ProspectInspectionCheck[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(value => INSPECTION_CHECKS.has(value)))];
}

function hasRequiredInspectionChecks(values: ProspectInspectionCheck[]): boolean {
  return REQUIRED_PROSPECT_INSPECTION_CHECKS.every(check => values.includes(check));
}

function normalizedQualificationState(
  value: unknown,
  inspectionChecks: ProspectInspectionCheck[],
  hasResearch: boolean,
): ProspectQualificationState {
  const state = QUALIFICATION_STATES.has(value as ProspectQualificationState)
    ? value as ProspectQualificationState
    : hasResearch ? "researching" : "unreviewed";
  return state === "ready" && !hasRequiredInspectionChecks(inspectionChecks) ? "researching" : state;
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
    reason: normalizeLegacyText(row.nextContactReason, PROSPECT_LIMITS.followUpReason) || "Recontact prospect",
    channel: OUTREACH_CHANNELS.has(row.preferredChannel as ProspectOutreachChannel) ? row.preferredChannel : undefined,
    status: "scheduled",
  }];
}

function normalizeFollowUps(row: Prospect): ProspectFollowUp[] {
  const source = Array.isArray(row.followUps) ? row.followUps : legacyFollowUp(row);
  return source.slice(-PROSPECT_LIMITS.historyCount).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const dueAt = cleanTimestamp(item?.dueAt);
    if (!dueAt) return [];
    const createdAt = cleanTimestamp(item.createdAt) ?? cleanTimestamp(row.updatedAt) ?? cleanTimestamp(row.capturedAt) ?? now();
    const status = item.status === "completed" || item.status === "skipped" ? item.status : "scheduled";
    const channel = OUTREACH_CHANNELS.has(item.channel as ProspectOutreachChannel) ? item.channel : undefined;
    return [{
      id: normalizeLegacyText(item.id, 160) ?? `normalized_follow_up_${row.id}_${dueAt}_${index}`,
      createdAt,
      createdBy: normalizeLegacyText(item.createdBy, PROSPECT_LIMITS.actorId),
      sourceOutreachAttemptId: normalizeLegacyText(item.sourceOutreachAttemptId, 160),
      dueAt,
      reason: normalizeLegacyText(item.reason, PROSPECT_LIMITS.followUpReason) ?? "Recontact prospect",
      channel,
      status,
      resolvedAt: cleanTimestamp(item.resolvedAt),
      resolvedBy: normalizeLegacyText(item.resolvedBy, PROSPECT_LIMITS.actorId),
      resolutionNote: normalizeLegacyText(item.resolutionNote, PROSPECT_LIMITS.resolutionNote),
    }];
  });
}

function normalizeOutreachAttempts(value: unknown): ProspectOutreachAttempt[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-PROSPECT_LIMITS.historyCount).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<ProspectOutreachAttempt>;
    const id = normalizeLegacyText(row.id, 160);
    const at = cleanTimestamp(row.at);
    if (!id || !at
      || !OUTREACH_CHANNELS.has(row.channel as ProspectOutreachChannel)
      || !OUTREACH_OUTCOMES.has(row.outcome as ProspectOutreachOutcome)) return [];
    return [{
      id,
      at,
      actorUserId: normalizeLegacyText(row.actorUserId, PROSPECT_LIMITS.actorId),
      finalisedAt: cleanTimestamp(row.finalisedAt),
      finalisedByUserId: normalizeLegacyText(row.finalisedByUserId, PROSPECT_LIMITS.actorId),
      channel: row.channel as ProspectOutreachChannel,
      outcome: row.outcome as ProspectOutreachOutcome,
      note: normalizeLegacyText(row.note, PROSPECT_LIMITS.outreachNote),
      followUpAt: cleanTimestamp(row.followUpAt),
      followUpReason: normalizeLegacyText(row.followUpReason, PROSPECT_LIMITS.followUpReason),
    }];
  });
}

function normalizeProspectNotes(value: unknown): ProspectNote[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-PROSPECT_LIMITS.historyCount).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<ProspectNote>;
    const id = normalizeLegacyText(row.id, 160);
    const at = cleanTimestamp(row.at);
    const body = normalizeLegacyText(row.body, PROSPECT_LIMITS.note);
    if (!id || !at || !body) return [];
    return [{
      id,
      at,
      actorUserId: normalizeLegacyText(row.actorUserId, PROSPECT_LIMITS.actorId),
      body,
    }];
  });
}

function normalizeProspect(row: Prospect): Prospect {
  const followUps = normalizeFollowUps(row);
  const next = nextFollowUp(followUps);
  const inspectionChecks = cleanInspectionChecks(row.inspectionChecks);
  const researchNotes = normalizeLegacyText(row.researchNotes, PROSPECT_LIMITS.researchNotes);
  return {
    ...row,
    name: normalizeLegacyText(row.name, PROSPECT_LIMITS.name),
    company: normalizeLegacyText(row.company, PROSPECT_LIMITS.company),
    email: normalizeLegacyText(row.email, PROSPECT_LIMITS.email)?.toLowerCase(),
    phone: normalizeLegacyText(row.phone, PROSPECT_LIMITS.phone),
    website: canonicalProspectHref(row.website),
    address: normalizeLegacyText(row.address, PROSPECT_LIMITS.address),
    googlePlaceId: normalizeGooglePlaceId(row.googlePlaceId),
    googleMapsUrl: canonicalProspectHref(row.googleMapsUrl, "google-maps"),
    instagramUrl: canonicalProspectHref(row.instagramUrl, "instagram"),
    facebookUrl: canonicalProspectHref(row.facebookUrl, "facebook"),
    linkedinUrl: canonicalProspectHref(row.linkedinUrl, "linkedin"),
    niche: normalizeLegacyText(row.niche, PROSPECT_LIMITS.niche),
    tags: normalizeLegacyTags(row.tags),
    source: normalizeLegacyText(row.source, PROSPECT_LIMITS.source) ?? "other",
    foundAt: normalizeLegacyText(row.foundAt, PROSPECT_LIMITS.foundAt),
    opportunity: normalizeLegacyText(row.opportunity, PROSPECT_LIMITS.opportunity),
    researchNotes,
    nextStep: normalizeLegacyText(row.nextStep, PROSPECT_LIMITS.nextStep),
    qualificationState: normalizedQualificationState(row.qualificationState, inspectionChecks, Boolean(researchNotes)),
    fitScore: cleanFitScore(row.fitScore),
    preferredChannel: OUTREACH_CHANNELS.has(row.preferredChannel as ProspectOutreachChannel) ? row.preferredChannel : undefined,
    doNotContact: row.doNotContact === true,
    lastContactedAt: cleanTimestamp(row.lastContactedAt),
    inspectionChecks,
    inspectedAt: hasRequiredInspectionChecks(inspectionChecks) ? cleanTimestamp(row.inspectedAt) : undefined,
    researchUpdatedBy: normalizeLegacyText(row.researchUpdatedBy, PROSPECT_LIMITS.actorId),
    researchUpdatedAt: cleanTimestamp(row.researchUpdatedAt),
    followUps,
    nextContactAt: next?.dueAt,
    nextContactReason: next?.reason,
    outreachAttempts: normalizeOutreachAttempts(row.outreachAttempts),
    notes: normalizeProspectNotes(row.notes),
    status: PROSPECT_STATUSES.has(row.status as ProspectStatus) ? row.status : "scouting",
    dismissedAt: cleanTimestamp(row.dismissedAt),
    dismissedByUserId: normalizeLegacyText(row.dismissedByUserId, PROSPECT_LIMITS.actorId),
    restoredAt: cleanTimestamp(row.restoredAt),
    restoredByUserId: normalizeLegacyText(row.restoredByUserId, PROSPECT_LIMITS.actorId),
    qualifiedLeadId: normalizeLegacyText(row.qualifiedLeadId, 160),
  };
}

function stateFromOutreach(input: RecordProspectOutreachInput): ProspectQualificationState {
  if (["replied", "interested", "meeting-booked"].includes(input.outcome)) return "engaged";
  if (["not-now", "not-fit"].includes(input.outcome)) return "not-now";
  return "outreach";
}

function stateFromLatestOutreach(
  attempts: ProspectOutreachAttempt[],
  fallback: ProspectQualificationState,
): ProspectQualificationState {
  let latest: ProspectOutreachAttempt | undefined;
  for (const attempt of attempts) {
    // Array order breaks timestamp ties, so a finalised/newer persisted row
    // remains deterministic even when two actions share the same millisecond.
    if (!latest || attempt.at >= latest.at) latest = attempt;
  }
  return latest ? stateFromOutreach(latest) : fallback;
}

function outreachAttemptStateDigest(attempt: ProspectOutreachAttempt): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    id: attempt.id,
    at: attempt.at,
    actorUserId: attempt.actorUserId ?? "",
    finalisedAt: attempt.finalisedAt ?? null,
    finalisedByUserId: attempt.finalisedByUserId ?? "",
    channel: attempt.channel,
    outcome: attempt.outcome,
    note: attempt.note ?? "",
    followUpAt: attempt.followUpAt ?? null,
    followUpReason: attempt.followUpReason ?? "",
  })).digest("hex").slice(0, 24);
}

function prospectLabel(prospect: Pick<Prospect, "company" | "name" | "website">): string {
  return prospect.company || prospect.name || prospect.website || "Unnamed prospect";
}

function acquisitionProspectId(agencyId: AgencyId, leadId: string): string {
  const digest = crypto.createHash("sha256").update(`${agencyId}\u0000${leadId}`).digest("hex").slice(0, 32);
  return `prospect_lead_${digest}`;
}

function migratedLeadNoteId(prefix: string, lead: Lead, identity: string): string {
  const digest = crypto.createHash("sha256")
    .update(`${lead.agencyId}\u0000${lead.id}\u0000${identity}`)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}${digest}`;
}

/**
 * Preserve pre-dossier Journey context without claiming that a provider send
 * occurred. Historical contact rows become attributed dossier notes; only
 * Prospect-owned outreach code is allowed to create ProspectOutreachAttempts.
 */
function legacyLeadHistoryNotes(lead: Lead): ProspectNote[] {
  const rows: ProspectNote[] = [];
  const leadNote = normalizeLegacyText(lead.notes, PROSPECT_LIMITS.note);
  if (leadNote) {
    rows.push({
      id: migratedLeadNoteId("migrated_lead_note_", lead, "lead-notes"),
      at: cleanTimestamp(lead.capturedAt) ?? 1,
      actorUserId: undefined,
      body: leadNote,
    });
  }

  for (const [index, event] of (Array.isArray(lead.journeyEvents) ? lead.journeyEvents : []).entries()) {
    if (!event || event.type !== "contact-recorded") continue;
    if (typeof event.id === "string" && event.id.startsWith("journey:prospect:")) continue;
    const channel = normalizeLegacyText(event.channel, 40);
    const outcome = normalizeLegacyText(event.outcome, 80);
    const note = normalizeLegacyText(event.note, 500);
    const detail = [
      channel && `Channel: ${channel}`,
      outcome && `Recorded outcome: ${outcome}`,
      note,
    ].filter(Boolean).join(" · ");
    rows.push({
      id: migratedLeadNoteId(
        MIGRATED_LEAD_CONTACT_NOTE_PREFIX,
        lead,
        typeof event.id === "string" && event.id ? event.id : `legacy-contact-${index}`,
      ),
      at: cleanTimestamp(event.at) ?? cleanTimestamp(lead.capturedAt) ?? 1,
      actorUserId: normalizeLegacyText(event.actorUserId, PROSPECT_LIMITS.actorId),
      body: normalizeLegacyText(`Journey contact record · ${detail || "Contact recorded"}`, PROSPECT_LIMITS.note)!,
    });
  }

  return rows
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(-PROSPECT_LIMITS.historyCount);
}

function mergeProspectNotes(existing: ProspectNote[], incoming: ProspectNote[]): ProspectNote[] {
  const byId = new Map(existing.map(note => [note.id, note]));
  for (const note of incoming) {
    const prior = byId.get(note.id);
    byId.set(note.id, prior
      ? { ...prior, ...note, actorUserId: note.actorUserId ?? prior.actorUserId }
      : note);
  }
  return [...byId.values()]
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(-PROSPECT_LIMITS.historyCount);
}

function prospectCanRemainActionable(prospect: Prospect): boolean {
  return prospect.status === "scouting" || prospect.status === "qualified";
}

function nextProspectUpdatedAt(prospect: Prospect): number {
  return Math.max(now(), prospect.updatedAt + 1);
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

  /** Resolve the durable Lead pointer even if an interrupted write omitted the index entry. */
  async getByQualifiedLeadId(leadId: string): Promise<Prospect | null> {
    const cleanedLeadId = clean(leadId);
    if (!cleanedLeadId) return null;
    const pointerId = await this.storage.get<string>(prospectLeadPointerKey(cleanedLeadId));
    if (pointerId) {
      const pointed = await this.get(pointerId);
      if (!pointed || pointed.status !== "qualified" || pointed.qualifiedLeadId !== cleanedLeadId) {
        throw new Error("The acquisition dossier pointer does not match this lead.");
      }
      return pointed;
    }
    const linked = (await this.list()).filter(row =>
      row.status === "qualified" && row.qualifiedLeadId === cleanedLeadId);
    if (linked.length > 1) {
      throw new Error("Multiple acquisition dossiers point at this lead. Resolve the duplicate before continuing.");
    }
    return linked[0] ?? null;
  }

  /**
   * Permanently remove one acquisition dossier for a data-subject erasure.
   *
   * The row is deleted last so a retry after any interrupted storage write
   * still has agency/lead ownership evidence. Pointer removal is compare-and-
   * delete: a stale erasure can never remove a successor dossier's pointer.
   * No activity row is written because an erasure audit must not recreate the
   * prospect identity that this operation removes.
   */
  async eraseForErasure(id: string, qualifiedLeadIds: string[] = []): Promise<boolean> {
    return withProspectMutationLock(this.agencyId, this.storage, async () => {
      const existing = await this.storage.get<Prospect>(prospectKey(id));
      if (existing && existing.agencyId !== this.agencyId) return false;

      const allowedLeadIds = new Set(qualifiedLeadIds.map(value => value.trim()).filter(Boolean));
      if (existing?.qualifiedLeadId && !allowedLeadIds.has(existing.qualifiedLeadId)) {
        throw new Error("The acquisition dossier belongs to a different Journey lead.");
      }

      const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
      if (index.includes(id)) {
        await this.storage.set(PROSPECT_INDEX_KEY, index.filter(prospectId => prospectId !== id));
      }

      const pointerLeadIds = new Set(allowedLeadIds);
      if (existing?.qualifiedLeadId) pointerLeadIds.add(existing.qualifiedLeadId);
      for (const leadId of pointerLeadIds) {
        const pointerKey = prospectLeadPointerKey(leadId);
        if (await this.storage.get<string>(pointerKey) === id) {
          await this.storage.del(pointerKey);
        }
      }

      if (existing) await this.storage.del(prospectKey(id));
      return Boolean(existing);
    });
  }

  private async reconcileLeadIdentityUnlocked(
    existing: Prospect,
    lead: Lead,
    actor: UserId,
  ): Promise<Prospect> {
    const leadIdentity = {
      name: normalizeLegacyText(lead.name, PROSPECT_LIMITS.name),
      company: normalizeLegacyText(lead.company, PROSPECT_LIMITS.company),
      email: normalizeLegacyText(lead.email, PROSPECT_LIMITS.email)?.toLowerCase(),
      phone: normalizeLegacyText(lead.phone, PROSPECT_LIMITS.phone),
    };
    const identityChanged = existing.name !== leadIdentity.name
      || existing.company !== leadIdentity.company
      || existing.email !== leadIdentity.email
      || existing.phone !== leadIdentity.phone;
    if (!identityChanged) return existing;
    const reconciled = { ...existing, ...leadIdentity, updatedAt: nextProspectUpdatedAt(existing) };
    await this.storage.set(prospectKey(reconciled.id), reconciled);
    await this.activity.logActivity({
      idempotencyKey: `lead-acquisition-identity:${lead.id}:${reconciled.updatedAt}`,
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.prospect.identity-synchronised",
      message: `Synchronised the acquisition dossier identity for lead ${lead.id}.`,
      metadata: { leadId: lead.id, prospectId: reconciled.id },
    });
    return reconciled;
  }

  private async reconcileLeadHistoryUnlocked(existing: Prospect, lead: Lead): Promise<Prospect> {
    const notes = mergeProspectNotes(existing.notes, legacyLeadHistoryNotes(lead));
    if (JSON.stringify(existing.notes) === JSON.stringify(notes)) return existing;
    const reconciled = { ...existing, notes, updatedAt: nextProspectUpdatedAt(existing) };
    await this.storage.set(prospectKey(reconciled.id), reconciled);
    return reconciled;
  }

  /**
   * Give an existing Lead the same acquisition dossier used by Scouting.
   *
   * The id is deterministic and the Lead pointer is written under a durable
   * storage lease, so two focused-workspace loads converge on one dossier.
   * Lead identity remains authoritative after qualification; this row is the
   * editable research/outreach facet and `qualifiedLeadId` is server-owned.
   */
  async ensureAcquisitionDossierForLead(lead: Lead, actor: UserId): Promise<Prospect> {
    if (lead.agencyId !== this.agencyId) throw new Error("The linked lead belongs to another agency.");
    if (lead.archivedAt || lead.convertedAt) throw new Error("Only active leads can have an acquisition dossier prepared.");
    return withProspectMutationLock(this.agencyId, this.storage, async () => {
      const pointerId = await this.storage.get<string>(prospectLeadPointerKey(lead.id));
      const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
      const linked: Prospect[] = [];
      for (const id of index) {
        const row = await this.storage.get<Prospect>(prospectKey(id));
        if (row?.agencyId === this.agencyId && row.status === "qualified" && row.qualifiedLeadId === lead.id) {
          linked.push(normalizeProspect(row));
        }
      }
      const projectedIds = [...new Set((lead.prospectAcquisitions ?? []).map(item => item.prospectId))];
      if (projectedIds.length > 1) {
        throw new Error("Multiple acquisition dossiers are projected onto this lead. Resolve the duplicate before continuing.");
      }
      if (projectedIds[0] && !linked.some(item => item.id === projectedIds[0])) {
        const projected = await this.get(projectedIds[0]);
        if (!projected || projected.status !== "qualified" || projected.qualifiedLeadId !== lead.id) {
          throw new Error("The Journey backlink points to a missing or mismatched acquisition dossier.");
        }
        linked.push(projected);
      }
      if (linked.length > 1) throw new Error("Multiple acquisition dossiers point at this lead. Resolve the duplicate before continuing.");

      const pointed = pointerId ? await this.get(pointerId) : null;
      if (pointed && (pointed.status !== "qualified" || pointed.qualifiedLeadId !== lead.id)) {
        throw new Error("The acquisition dossier pointer does not match this lead.");
      }
      const existing = pointed ?? linked[0];
      if (existing) {
        if (projectedIds[0] && projectedIds[0] !== existing.id) {
          throw new Error("The Journey and acquisition dossier backlinks do not match.");
        }
        // Once a dossier belongs to Journey, the Lead owns contact identity.
        // Reconcile that identity while holding the same Prospect lock used by
        // every dossier mutation so a later research write cannot restore a
        // stale pre-qualification name, company, email or phone value.
        const identityReconciled = await this.reconcileLeadIdentityUnlocked(existing, lead, actor);
        const reconciled = await this.reconcileLeadHistoryUnlocked(identityReconciled, lead);
        if (!index.includes(existing.id)) {
          await this.storage.set(PROSPECT_INDEX_KEY, [...index, existing.id]);
        }
        if (pointerId !== existing.id) {
          await this.storage.set(prospectLeadPointerKey(lead.id), existing.id);
        }
        return reconciled;
      }

      const stamp = now();
      const id = acquisitionProspectId(this.agencyId, lead.id);
      const recovered = await this.get(id);
      if (recovered) {
        if (recovered.status !== "qualified" || recovered.qualifiedLeadId !== lead.id) {
          throw new Error("The deterministic acquisition dossier id is already in use.");
        }
        await this.storage.set(prospectLeadPointerKey(lead.id), recovered.id);
        await this.storage.set(PROSPECT_INDEX_KEY, [...new Set([...index, recovered.id])]);
        const identityReconciled = await this.reconcileLeadIdentityUnlocked(recovered, lead, actor);
        return this.reconcileLeadHistoryUnlocked(identityReconciled, lead);
      }

      const customFields = lead.customFields ?? {};
      const website = canonicalProspectHref(customFields.website);
      const niche = normalizeLegacyText(customFields.niche, PROSPECT_LIMITS.niche);
      const prospect: Prospect = {
        id,
        agencyId: this.agencyId,
        name: normalizeLegacyText(lead.name, PROSPECT_LIMITS.name),
        company: normalizeLegacyText(lead.company, PROSPECT_LIMITS.company),
        email: normalizeLegacyText(lead.email, PROSPECT_LIMITS.email)?.toLowerCase(),
        phone: normalizeLegacyText(lead.phone, PROSPECT_LIMITS.phone),
        website,
        niche,
        tags: normalizeLegacyTags(lead.tags),
        source: normalizeLegacyText(`lead:${lead.source}`, PROSPECT_LIMITS.source) ?? "lead:other",
        qualificationState: lead.lastContactedAt ? "outreach" : "unreviewed",
        lastContactedAt: cleanTimestamp(lead.lastContactedAt),
        inspectionChecks: [],
        followUps: [],
        outreachAttempts: [],
        notes: legacyLeadHistoryNotes(lead),
        status: "qualified",
        qualifiedLeadId: lead.id,
        capturedAt: cleanTimestamp(lead.capturedAt) ?? stamp,
        updatedAt: stamp,
      };
      await this.storage.set(prospectKey(id), prospect);
      await this.storage.set(prospectLeadPointerKey(lead.id), id);
      await this.storage.set(PROSPECT_INDEX_KEY, [...new Set([...index, id])]);
      await this.activity.logActivity({
        idempotencyKey: `lead-acquisition-dossier:${lead.id}`,
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "leads",
        action: "leads.prospect.prepared-for-lead",
        message: `Prepared the acquisition dossier for lead ${lead.id}.`,
        metadata: { leadId: lead.id, prospectId: id },
      });
      this.events.emit({ agencyId: this.agencyId }, "leads.prospect.created", { prospectId: id });
      return prospect;
    });
  }

  async create(input: CreateProspectInput, actor: UserId): Promise<Prospect> {
    return withProspectMutationLock(this.agencyId, this.storage, () => this.createUnlocked(input, actor));
  }

  private async createUnlocked(input: CreateProspectInput, actor: UserId): Promise<Prospect> {
    const company = cleanProspectTextInput(input.company, "Company", PROSPECT_LIMITS.company);
    const name = cleanProspectTextInput(input.name, "Name", PROSPECT_LIMITS.name);
    const website = cleanProspectHrefInput(input.website, "Website");
    const googlePlaceId = cleanGooglePlaceIdInput(input.googlePlaceId);
    if (!company && !name && !website) {
      throw new Error("Add a business name, person, or website before saving this prospect.");
    }
    const stamp = now();
    const initialResearchSaved = [...RESEARCH_PATCH_KEYS].some(key =>
      Object.prototype.hasOwnProperty.call(input, key));
    const inspectionChecks = cleanInspectionChecksInput(input.inspectionChecks);
    const researchNotes = cleanProspectTextInput(input.researchNotes, "Research notes", PROSPECT_LIMITS.researchNotes);
    const requestedQualificationState = cleanQualificationStateInput(
      input.qualificationState,
      researchNotes ? "researching" : "unreviewed",
    );
    const prospect: Prospect = {
      id: makeId("prospect"),
      agencyId: this.agencyId,
      name,
      company,
      email: cleanProspectTextInput(input.email, "Email", PROSPECT_LIMITS.email)?.toLowerCase(),
      phone: cleanProspectTextInput(input.phone, "Phone", PROSPECT_LIMITS.phone),
      website,
      address: cleanProspectTextInput(input.address, "Address", PROSPECT_LIMITS.address),
      googlePlaceId,
      googleMapsUrl: cleanProspectHrefInput(input.googleMapsUrl, "Google Maps listing", "google-maps"),
      instagramUrl: cleanProspectHrefInput(input.instagramUrl, "Instagram link", "instagram"),
      facebookUrl: cleanProspectHrefInput(input.facebookUrl, "Facebook link", "facebook"),
      linkedinUrl: cleanProspectHrefInput(input.linkedinUrl, "LinkedIn link", "linkedin"),
      niche: cleanProspectTextInput(input.niche, "Niche", PROSPECT_LIMITS.niche),
      tags: cleanProspectTagsInput(input.tags),
      source: cleanProspectTextInput(input.source, "Source", PROSPECT_LIMITS.source) ?? "other",
      foundAt: cleanProspectTextInput(input.foundAt, "Found at", PROSPECT_LIMITS.foundAt),
      opportunity: cleanProspectTextInput(input.opportunity, "Opportunity", PROSPECT_LIMITS.opportunity),
      researchNotes,
      nextStep: cleanProspectTextInput(input.nextStep, "Next step", PROSPECT_LIMITS.nextStep),
      qualificationState: normalizedQualificationState(requestedQualificationState, inspectionChecks, Boolean(researchNotes)),
      fitScore: cleanFitScore(input.fitScore),
      preferredChannel: cleanOutreachChannelInput(input.preferredChannel, "Preferred channel"),
      doNotContact: Boolean(input.doNotContact),
      nextContactAt: cleanTimestamp(input.nextContactAt),
      nextContactReason: cleanProspectTextInput(input.nextContactReason, "Next contact reason", PROSPECT_LIMITS.nextContactReason),
      inspectionChecks,
      inspectedAt: hasRequiredInspectionChecks(inspectionChecks) ? cleanTimestamp(input.inspectedAt) : undefined,
      researchUpdatedBy: initialResearchSaved ? actor : undefined,
      researchUpdatedAt: initialResearchSaved ? stamp : undefined,
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
    return withProspectMutationLock(this.agencyId, this.storage, () => this.updateUnlocked(id, patch, actor));
  }

  private async updateUnlocked(id: string, patch: UpdateProspectPatch, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status === "qualified"
      && ["name", "company", "email", "phone"].some(key => Object.prototype.hasOwnProperty.call(patch, key))) {
      throw new Error("Edit qualified contact identity on its Journey lead.");
    }
    const updateStamp = nextProspectUpdatedAt(existing);
    const researchSaved = [...RESEARCH_PATCH_KEYS].some(key =>
      Object.prototype.hasOwnProperty.call(patch, key));
    const inspectionChecks = patch.inspectionChecks === undefined
      ? existing.inspectionChecks
      : cleanInspectionChecksInput(patch.inspectionChecks);
    const researchNotes = patch.researchNotes === undefined
      ? existing.researchNotes
      : cleanProspectTextInput(patch.researchNotes, "Research notes", PROSPECT_LIMITS.researchNotes);
    const qualificationState = normalizedQualificationState(
      cleanQualificationStateInput(patch.qualificationState, existing.qualificationState),
      inspectionChecks,
      Boolean(researchNotes),
    );
    const preferredChannel = patch.preferredChannel === undefined
      ? existing.preferredChannel
      : cleanOutreachChannelInput(patch.preferredChannel, "Preferred channel");
    const patchedNextContactReason = patch.nextContactReason === undefined
      ? existing.nextContactReason
      : cleanProspectTextInput(patch.nextContactReason, "Next contact reason", PROSPECT_LIMITS.nextContactReason);
    let followUps = existing.followUps;
    if (patch.nextContactAt !== undefined) {
      followUps = followUps.map(item => item.status === "scheduled"
        ? { ...item, status: "skipped" as const, resolvedAt: updateStamp, resolvedBy: actor, resolutionNote: "Replaced while editing the dossier." }
        : item);
      const dueAt = cleanTimestamp(patch.nextContactAt);
      if (dueAt) {
        if (followUps.length >= PROSPECT_LIMITS.historyCount) {
          throw new Error(`A prospect can retain no more than ${PROSPECT_LIMITS.historyCount} follow-ups.`);
        }
        followUps = [...followUps, {
          id: makeId("prospect_follow_up"),
          createdAt: updateStamp,
          createdBy: actor,
          dueAt,
          reason: patchedNextContactReason || "Recontact prospect",
          channel: preferredChannel,
          status: "scheduled" as const,
        }];
      }
    }
    const scheduled = nextFollowUp(followUps);
    const updated: Prospect = {
      ...existing,
      ...patch,
      name: patch.name === undefined ? existing.name : cleanProspectTextInput(patch.name, "Name", PROSPECT_LIMITS.name),
      company: patch.company === undefined ? existing.company : cleanProspectTextInput(patch.company, "Company", PROSPECT_LIMITS.company),
      email: patch.email === undefined ? existing.email : cleanProspectTextInput(patch.email, "Email", PROSPECT_LIMITS.email)?.toLowerCase(),
      phone: patch.phone === undefined ? existing.phone : cleanProspectTextInput(patch.phone, "Phone", PROSPECT_LIMITS.phone),
      website: patch.website === undefined ? existing.website : cleanProspectHrefInput(patch.website, "Website"),
      address: patch.address === undefined ? existing.address : cleanProspectTextInput(patch.address, "Address", PROSPECT_LIMITS.address),
      googlePlaceId: patch.googlePlaceId === undefined ? existing.googlePlaceId : cleanGooglePlaceIdInput(patch.googlePlaceId),
      googleMapsUrl: patch.googleMapsUrl === undefined ? existing.googleMapsUrl : cleanProspectHrefInput(patch.googleMapsUrl, "Google Maps listing", "google-maps"),
      instagramUrl: patch.instagramUrl === undefined ? existing.instagramUrl : cleanProspectHrefInput(patch.instagramUrl, "Instagram link", "instagram"),
      facebookUrl: patch.facebookUrl === undefined ? existing.facebookUrl : cleanProspectHrefInput(patch.facebookUrl, "Facebook link", "facebook"),
      linkedinUrl: patch.linkedinUrl === undefined ? existing.linkedinUrl : cleanProspectHrefInput(patch.linkedinUrl, "LinkedIn link", "linkedin"),
      niche: patch.niche === undefined ? existing.niche : cleanProspectTextInput(patch.niche, "Niche", PROSPECT_LIMITS.niche),
      tags: patch.tags === undefined ? existing.tags : cleanProspectTagsInput(patch.tags),
      source: patch.source === undefined ? existing.source : cleanProspectTextInput(patch.source, "Source", PROSPECT_LIMITS.source) ?? "other",
      foundAt: patch.foundAt === undefined ? existing.foundAt : cleanProspectTextInput(patch.foundAt, "Found at", PROSPECT_LIMITS.foundAt),
      opportunity: patch.opportunity === undefined ? existing.opportunity : cleanProspectTextInput(patch.opportunity, "Opportunity", PROSPECT_LIMITS.opportunity),
      researchNotes,
      nextStep: patch.nextStep === undefined ? existing.nextStep : cleanProspectTextInput(patch.nextStep, "Next step", PROSPECT_LIMITS.nextStep),
      qualificationState,
      fitScore: patch.fitScore === undefined ? existing.fitScore : cleanFitScore(patch.fitScore),
      preferredChannel,
      doNotContact: patch.doNotContact === undefined ? existing.doNotContact : patch.doNotContact === true,
      inspectionChecks,
      inspectedAt: hasRequiredInspectionChecks(inspectionChecks)
        ? (patch.inspectedAt === undefined ? existing.inspectedAt : cleanTimestamp(patch.inspectedAt))
        : undefined,
      status: cleanProspectStatusInput(patch.status, existing.status),
      qualifiedLeadId: patch.qualifiedLeadId === undefined
        ? existing.qualifiedLeadId
        : cleanProspectTextInput(patch.qualifiedLeadId, "Qualified lead", 160),
      researchUpdatedBy: researchSaved ? actor : existing.researchUpdatedBy,
      researchUpdatedAt: researchSaved ? updateStamp : existing.researchUpdatedAt,
      followUps,
      nextContactAt: scheduled?.dueAt,
      nextContactReason: scheduled?.reason,
      updatedAt: updateStamp,
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
    return withProspectMutationLock(this.agencyId, this.storage, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      if (existing.status !== "scouting") throw new Error("A prospect already linked to Journey cannot be dismissed here.");
      const stamp = nextProspectUpdatedAt(existing);
      const updated: Prospect = {
        ...existing,
        status: "dismissed",
        dismissedAt: stamp,
        dismissedByUserId: actor,
        updatedAt: stamp,
      };
      await this.storage.set(prospectKey(id), updated);
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "leads",
        action: "leads.prospect.dismissed",
        message: `Marked ${prospectLabel(updated)} as not qualified.`,
        metadata: { prospectId: id },
      });
      this.events.emit({ agencyId: this.agencyId }, "leads.prospect.dismissed", { prospectId: id });
      return updated;
    });
  }

  /** Return a retained not-qualified dossier to its previous active desk. */
  async restore(id: string, actor: UserId): Promise<Prospect | null> {
    return withProspectMutationLock(this.agencyId, this.storage, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      // Safe retry: once restored, repeating the same intent must not duplicate
      // lifecycle evidence or change the preserved qualification state.
      if (existing.status === "scouting") return existing;
      if (existing.status !== "dismissed") {
        throw new Error("A prospect already linked to Journey cannot be restored here.");
      }
      const stamp = nextProspectUpdatedAt(existing);
      const updated: Prospect = {
        ...existing,
        status: "scouting",
        restoredAt: stamp,
        restoredByUserId: actor,
        updatedAt: stamp,
      };
      await this.storage.set(prospectKey(id), updated);
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "leads",
        action: "leads.prospect.restored",
        message: `Restored ${prospectLabel(updated)} to the active acquisition workflow.`,
        metadata: { prospectId: id, qualificationState: updated.qualificationState },
      });
      this.events.emit({ agencyId: this.agencyId }, "leads.prospect.restored", {
        prospectId: id,
        qualificationState: updated.qualificationState,
      });
      return updated;
    });
  }

  /** Commit the server-owned Prospect -> Lead edge from the latest locked row. */
  async linkQualifiedLead(id: string, leadId: string, actor: UserId): Promise<Prospect | null> {
    return withProspectMutationLock(this.agencyId, this.storage, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      const linkedLeadId = clean(leadId);
      if (!linkedLeadId) throw new Error("A Journey lead is required for qualification.");
      const pointerId = await this.storage.get<string>(prospectLeadPointerKey(linkedLeadId));
      if (pointerId && pointerId !== existing.id) {
        throw new Error("This Journey lead is already linked to another acquisition dossier.");
      }
      const index = (await this.storage.get<string[]>(PROSPECT_INDEX_KEY)) ?? [];
      for (const prospectId of index) {
        if (prospectId === existing.id) continue;
        const candidate = await this.storage.get<Prospect>(prospectKey(prospectId));
        if (candidate?.agencyId === this.agencyId
          && candidate.status === "qualified"
          && candidate.qualifiedLeadId === linkedLeadId) {
          throw new Error("This Journey lead is already linked to another acquisition dossier.");
        }
      }
      if (existing.status === "qualified") {
        if (existing.qualifiedLeadId !== linkedLeadId) {
          throw new Error("This prospect is already linked to another Journey lead.");
        }
        await this.storage.set(prospectLeadPointerKey(linkedLeadId), existing.id);
        return existing;
      }
      if (existing.status !== "scouting") throw new Error("Only an active scouting prospect can be qualified.");
      if (!existing.email && !existing.phone) {
        throw new Error("Add an email address or phone number before qualifying this prospect as a lead.");
      }
      if (existing.doNotContact) throw new Error("Remove the do-not-contact hold before qualifying this prospect.");
      const updated = await this.updateUnlocked(id, { status: "qualified", qualifiedLeadId: linkedLeadId }, actor);
      if (updated) await this.storage.set(prospectLeadPointerKey(linkedLeadId), updated.id);
      return updated;
    });
  }

  async recordOutreach(id: string, input: RecordProspectOutreachInput, actor: UserId): Promise<Prospect | null> {
    return withProspectMutationLock(this.agencyId, this.storage, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      if (!prospectCanRemainActionable(existing)) throw new Error("Only active acquisition records can be contacted.");
      const channel = cleanOutreachChannelInput(input.channel, "Outreach channel");
      if (!channel) throw new Error("Outreach channel is required.");
      const outcome = cleanOutreachOutcomeInput(input.outcome);
      const requestedAttemptId = cleanOutreachAttemptId(input.attemptId);
      const priorIndex = requestedAttemptId
        ? existing.outreachAttempts.findIndex(item => item.id === requestedAttemptId)
        : -1;
      const priorAttempt = priorIndex >= 0 ? existing.outreachAttempts[priorIndex] : undefined;
      // A retry/finalisation is bookkeeping for a provider action that already
      // happened. A hold added by that attempt must not make its own exact
      // replay fail, while a new attempt remains blocked.
      if (existing.doNotContact && !priorAttempt) {
        throw new Error("Remove the do-not-contact hold before recording outreach.");
      }
      if (priorAttempt && priorAttempt.channel !== channel) {
        throw new Error("An outreach attempt cannot change channel when it is finalised.");
      }
      if (!priorAttempt && existing.outreachAttempts.length >= PROSPECT_LIMITS.historyCount) {
        throw new Error(`A prospect can retain no more than ${PROSPECT_LIMITS.historyCount} outreach attempts.`);
      }

      // Occurrence time belongs to the provider action. A later disposition or
      // replay may enrich that row, but cannot move quota evidence to another
      // day by supplying a new timestamp.
      const at = priorAttempt?.at ?? cleanTimestamp(input.contactedAt) ?? now();
      const suppliedFollowUpAt = input.followUpAt === undefined
        ? undefined
        : cleanTimestamp(input.followUpAt);
      if (input.followUpAt !== undefined && suppliedFollowUpAt === undefined) {
        throw new Error("Follow-up time must be a valid positive timestamp.");
      }
      const followUpAt = input.followUpAt === undefined
        ? priorAttempt?.followUpAt
        : suppliedFollowUpAt;
      const followUpReason = input.followUpReason === undefined
        ? priorAttempt?.followUpReason
        : cleanProspectTextInput(input.followUpReason, "Follow-up reason", PROSPECT_LIMITS.followUpReason);
      const note = input.note === undefined
        ? priorAttempt?.note
        : cleanProspectTextInput(input.note, "Outreach note", PROSPECT_LIMITS.outreachNote);
      const dispositionChanged = Boolean(priorAttempt && (
        priorAttempt.outcome !== outcome
        || priorAttempt.note !== note
        || priorAttempt.followUpAt !== followUpAt
        || priorAttempt.followUpReason !== followUpReason
      ));
      // Automatic provider retries may repair the durable row, but must not
      // masquerade as a human outcome. Only the explicit outcome form sets
      // `finalise`; its first successful save is attributable even when the
      // selected result matches the provisional provider result.
      const stampFinalisation = Boolean(priorAttempt && input.finalise === true && (
        !priorAttempt.finalisedAt || dispositionChanged
      ));
      const attempt: ProspectOutreachAttempt = {
        id: requestedAttemptId ?? makeId("prospect_attempt"),
        at,
        actorUserId: priorAttempt?.actorUserId ?? actor,
        finalisedAt: stampFinalisation ? now() : priorAttempt?.finalisedAt,
        finalisedByUserId: stampFinalisation ? actor : priorAttempt?.finalisedByUserId,
        channel,
        outcome,
        note,
        followUpAt,
        followUpReason,
      };

      let followUps = existing.followUps;
      // A retry/finalisation of the same attempt must not consume the next due
      // reminder. Only the first insertion resolves the reminder it acted on.
      if (!priorAttempt) {
        const dueFollowUp = openFollowUps(followUps).find(item => item.dueAt <= at);
        if (dueFollowUp) {
          followUps = followUps.map(item => item.id === dueFollowUp.id
            ? { ...item, status: "completed" as const, resolvedAt: at, resolvedBy: actor, resolutionNote: `Outreach recorded: ${outcome}.` }
            : item);
        }
      }

      if (followUpAt) {
        const linkedFollowUpIndex = followUps.findIndex(item => item.sourceOutreachAttemptId === attempt.id);
        if (linkedFollowUpIndex < 0) {
          if (followUps.length >= PROSPECT_LIMITS.historyCount) {
            throw new Error(`A prospect can retain no more than ${PROSPECT_LIMITS.historyCount} follow-ups.`);
          }
          followUps = [...followUps, {
            id: makeId("prospect_follow_up"),
            createdAt: at,
            createdBy: actor,
            sourceOutreachAttemptId: attempt.id,
            dueAt: followUpAt,
            reason: followUpReason || "Continue outreach",
            channel,
            status: "scheduled" as const,
          }];
        } else {
          const linked = followUps[linkedFollowUpIndex];
          if (linked?.status === "scheduled") {
            followUps = followUps.map((item, index) => index === linkedFollowUpIndex
              ? {
                  ...item,
                  dueAt: followUpAt,
                  reason: followUpReason || "Continue outreach",
                  channel,
                }
              : item);
          }
        }
      }

      const outreachAttempts = [...existing.outreachAttempts];
      if (priorIndex >= 0) outreachAttempts[priorIndex] = attempt;
      else outreachAttempts.push(attempt);
      const scheduled = nextFollowUp(followUps);
      // Finalising an older call must not move a prospect backwards after a
      // newer interaction. The aggregate state follows the most recent
      // provider occurrence, not whichever row happened to be edited last.
      const qualificationState = stateFromLatestOutreach(outreachAttempts, existing.qualificationState);
      const doNotContact = outcome === "not-fit" ? true : existing.doNotContact;
      const changed = !(
        priorAttempt
        && JSON.stringify(priorAttempt) === JSON.stringify(attempt)
        && JSON.stringify(existing.followUps) === JSON.stringify(followUps)
        && existing.qualificationState === qualificationState
        && existing.doNotContact === doNotContact
      );

      const updated: Prospect = changed
        ? {
            ...existing,
            qualificationState,
            preferredChannel: existing.preferredChannel ?? input.channel,
            doNotContact,
            lastContactedAt: existing.lastContactedAt === undefined ? at : Math.max(existing.lastContactedAt, at),
            followUps,
            nextContactAt: scheduled?.dueAt,
            nextContactReason: scheduled?.reason,
            outreachAttempts,
            updatedAt: nextProspectUpdatedAt(existing),
          }
        : existing;
      if (changed) await this.storage.set(prospectKey(id), updated);

      // This idempotency key deliberately distinguishes the initial provider
      // state from a later human disposition, while collapsing an exact retry.
      // Calling the activity port even on an unchanged row repairs the allowed
      // non-transactional-storage case where set() succeeded and logging threw.
      await this.activity.logActivity({
        idempotencyKey: `prospect-outreach:${id}:${attempt.id}:${outreachAttemptStateDigest(attempt)}`,
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "leads",
        action: "leads.prospect.outreach-recorded",
        message: `Recorded ${channel} outreach to ${prospectLabel(updated)}: ${outcome}.`,
        metadata: {
          prospectId: id,
          // Personal metric evidence is agency/user scoped and therefore must
          // also include the owning prospect; a reused client token on another
          // dossier cannot collapse two real provider actions into one quota.
          attemptId: `${id}:${attempt.id}`,
          outreachAttemptId: attempt.id,
          finalised: Boolean(priorAttempt),
          channel,
          outcome,
          contactedAt: at,
          followUpAt,
        },
      });
      if (changed) {
        this.events.emit({ agencyId: this.agencyId }, "leads.prospect.outreach-recorded", { prospectId: id, attempt });
      }
      return updated;
    });
  }

  async saveInspection(id: string, checks: ProspectInspectionCheck[], actor: UserId): Promise<Prospect | null> {
    return withProspectMutationLock(this.agencyId, this.storage, () => this.saveInspectionUnlocked(id, checks, actor));
  }

  private async saveInspectionUnlocked(id: string, checks: ProspectInspectionCheck[], actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const stamp = nextProspectUpdatedAt(existing);
    const inspectionChecks = cleanInspectionChecksInput(checks);
    const complete = hasRequiredInspectionChecks(inspectionChecks);
    const qualificationState: ProspectQualificationState = complete
      ? (["unreviewed", "researching", "ready"].includes(existing.qualificationState)
          ? "ready"
          : existing.qualificationState)
      : existing.qualificationState === "ready"
        ? "researching"
        : existing.qualificationState === "unreviewed" && inspectionChecks.length > 0
          ? "researching"
          : existing.qualificationState;
    const updated: Prospect = {
      ...existing,
      inspectionChecks,
      inspectedAt: complete ? (existing.inspectedAt ?? stamp) : undefined,
      researchUpdatedBy: actor,
      researchUpdatedAt: stamp,
      qualificationState,
      updatedAt: stamp,
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
    return withProspectMutationLock(this.agencyId, this.storage, () => this.scheduleFollowUpUnlocked(id, input, actor));
  }

  private async scheduleFollowUpUnlocked(id: string, input: ScheduleProspectFollowUpInput, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (!prospectCanRemainActionable(existing)) throw new Error("Only active acquisition records can receive follow-ups.");
    const dueAt = cleanTimestamp(input.dueAt);
    const reason = cleanProspectTextInput(input.reason, "Follow-up reason", PROSPECT_LIMITS.followUpReason);
    const channel = cleanOutreachChannelInput(input.channel, "Follow-up channel");
    if (!dueAt) throw new Error("Choose a valid follow-up date and time.");
    if (dueAt < now() - 60_000) throw new Error("Choose a follow-up time in the future.");
    if (!reason) throw new Error("Add the reason for this follow-up.");
    if (existing.followUps.length >= PROSPECT_LIMITS.historyCount) {
      throw new Error(`A prospect can retain no more than ${PROSPECT_LIMITS.historyCount} follow-ups.`);
    }
    const stamp = nextProspectUpdatedAt(existing);
    const followUp: ProspectFollowUp = {
      id: makeId("prospect_follow_up"),
      createdAt: stamp,
      createdBy: actor,
      dueAt,
      reason,
      channel,
      status: "scheduled",
    };
    const followUps = [...existing.followUps, followUp];
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
      action: "leads.prospect.follow-up-scheduled",
      message: `Scheduled ${channel ?? "outreach"} follow-up with ${prospectLabel(updated)}.`,
      metadata: { prospectId: id, followUpId: followUp.id, dueAt, reason, channel },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.prospect.follow-up-scheduled", { prospectId: id, followUp });
    return updated;
  }

  async resolveFollowUp(id: string, input: ResolveProspectFollowUpInput, actor: UserId): Promise<Prospect | null> {
    return withProspectMutationLock(this.agencyId, this.storage, () => this.resolveFollowUpUnlocked(id, input, actor));
  }

  private async resolveFollowUpUnlocked(id: string, input: ResolveProspectFollowUpInput, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const followUp = existing.followUps.find(item => item.id === input.followUpId);
    if (!followUp) throw new Error("Follow-up not found.");
    if (followUp.status !== "scheduled") throw new Error("This follow-up is already resolved.");
    if (input.status !== "completed" && input.status !== "skipped") throw new Error("Follow-up status is invalid.");
    const resolutionNote = cleanProspectTextInput(
      input.resolutionNote,
      "Resolution note",
      PROSPECT_LIMITS.resolutionNote,
    );
    const stamp = nextProspectUpdatedAt(existing);
    const followUps = existing.followUps.map(item => item.id === followUp.id
      ? { ...item, status: input.status, resolvedAt: stamp, resolvedBy: actor, resolutionNote }
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
    return withProspectMutationLock(this.agencyId, this.storage, () => this.addNoteUnlocked(id, body, actor));
  }

  private async addNoteUnlocked(id: string, body: string, actor: UserId): Promise<Prospect | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const cleaned = cleanProspectTextInput(body, "Note", PROSPECT_LIMITS.note);
    if (!cleaned) throw new Error("Note cannot be empty.");
    if (existing.notes.length >= PROSPECT_LIMITS.historyCount) {
      throw new Error(`A prospect can retain no more than ${PROSPECT_LIMITS.historyCount} notes.`);
    }
    const note: ProspectNote = { id: makeId("prospect_note"), at: now(), actorUserId: actor, body: cleaned };
    const updated: Prospect = {
      ...existing,
      notes: [...existing.notes, note],
      qualificationState: existing.qualificationState === "unreviewed" ? "researching" : existing.qualificationState,
      updatedAt: nextProspectUpdatedAt(existing),
    };
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
