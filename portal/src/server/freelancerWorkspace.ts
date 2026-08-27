import "server-only";
// Freelancer-facing workspace — the freelancer's OWN limited view.
//
// A `freelancer` (a PeopleEmployee with employmentType freelancer) sees ONLY
// their assigned one-time jobs, and the agency decides exactly what — nothing
// is hardcoded (Ed: "all configurable"). This module owns the read model +
// the access policy; it READS the people domain via its public exports
// (getPeopleEmployeeByUserId / listPeopleFreelancerJobs) rather than editing
// server/people.ts, which the Staff worker owns.
//
// The policy resolver applies privacy-first defaults, an agency-set policy and
// optional per-job overrides. The same effective policy gates the read model,
// submissions and agency messaging so a hidden action is not merely a UI flag.

import { getClientForAgency } from "@/server/tenants";
import {
  ensureDirectChannel,
  getPeopleEmployeeByUserId,
  listPeopleFreelancerJobs,
  listPeopleMessages,
  markChannelRead,
  postPeopleMessage,
  setPeopleFreelancerJobStatus,
} from "@/server/people";
import { getState, mutate } from "@/server/storage";
import type { FreelancerAccessConfig, PeopleFreelancerJob, PeopleFreelancerJobStatus } from "@/server/types";
import { listUsersForAgency } from "@/server/users";

export type { FreelancerAccessConfig };

// Defaults are privacy-first: the client is anonymised and the freelancer can
// only read. The agency opens up more via the config (see resolveFreelancerAccess).
export const DEFAULT_FREELANCER_ACCESS: FreelancerAccessConfig = {
  showFee: true,
  clientIdentity: "anonymised",
  showBrief: true,
  showDates: true,
  showDeliverables: true,
  showNotes: false,
  actions: { markSubmitted: false, upload: false, message: false },
};

// Coerce arbitrary input (from the config API) into a valid config, filling
// each field from the defaults — never trust the client blob.
export function normaliseFreelancerAccess(input: unknown): FreelancerAccessConfig {
  const raw = (input ?? {}) as Partial<FreelancerAccessConfig> & { actions?: Partial<FreelancerAccessConfig["actions"]> };
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    showFee: bool(raw.showFee, DEFAULT_FREELANCER_ACCESS.showFee),
    clientIdentity: raw.clientIdentity === "named" ? "named" : "anonymised",
    showBrief: bool(raw.showBrief, DEFAULT_FREELANCER_ACCESS.showBrief),
    showDates: bool(raw.showDates, DEFAULT_FREELANCER_ACCESS.showDates),
    showDeliverables: bool(raw.showDeliverables, DEFAULT_FREELANCER_ACCESS.showDeliverables),
    showNotes: bool(raw.showNotes, DEFAULT_FREELANCER_ACCESS.showNotes),
    actions: {
      markSubmitted: bool(raw.actions?.markSubmitted, DEFAULT_FREELANCER_ACCESS.actions.markSubmitted),
      upload: bool(raw.actions?.upload, DEFAULT_FREELANCER_ACCESS.actions.upload),
      message: bool(raw.actions?.message, DEFAULT_FREELANCER_ACCESS.actions.message),
    },
  };
}

// The agency-wide policy (stored or defaults). A per-job override can replace
// it through resolveFreelancerAccess().
export function getFreelancerAccessConfig(agencyId: string): FreelancerAccessConfig {
  const stored = getState().freelancerAccessConfig?.[agencyId];
  return stored ? normaliseFreelancerAccess(stored) : DEFAULT_FREELANCER_ACCESS;
}

export function saveFreelancerAccessConfig(agencyId: string, input: unknown): FreelancerAccessConfig {
  const config = normaliseFreelancerAccess(input);
  mutate(state => {
    state.freelancerAccessConfig = { ...(state.freelancerAccessConfig ?? {}), [agencyId]: config };
  });
  return config;
}

// Per-job override (a full policy for one job). Absent → the agency default.
export function getFreelancerJobOverride(jobId: string): FreelancerAccessConfig | null {
  const stored = getState().freelancerJobOverride?.[jobId];
  return stored ? normaliseFreelancerAccess(stored) : null;
}

export function setFreelancerJobOverride(jobId: string, input: unknown): FreelancerAccessConfig {
  const config = normaliseFreelancerAccess(input);
  mutate(state => {
    state.freelancerJobOverride = { ...(state.freelancerJobOverride ?? {}), [jobId]: config };
  });
  return config;
}

export function clearFreelancerJobOverride(jobId: string): void {
  mutate(state => {
    if (state.freelancerJobOverride?.[jobId]) {
      const next = { ...state.freelancerJobOverride };
      delete next[jobId];
      state.freelancerJobOverride = next;
    }
  });
}

// For the agency config UI: every freelancer job + its override (if any).
export interface FreelancerJobConfigRow { id: string; title: string; override: FreelancerAccessConfig | null; }
export function listFreelancerJobsForConfig(agencyId: string): FreelancerJobConfigRow[] {
  return listPeopleFreelancerJobs(agencyId).map(job => ({ id: job.id, title: job.title, override: getFreelancerJobOverride(job.id) }));
}

/**
 * The single seam for "all configurable" — a per-job override wins over the
 * agency default. This is what the workspace + actions resolve their effective
 * policy from.
 */
export function resolveFreelancerAccess(
  agencyId: string,
  _employeeId: string,
  jobId?: string,
): FreelancerAccessConfig {
  return (jobId ? getFreelancerJobOverride(jobId) : null) ?? getFreelancerAccessConfig(agencyId);
}

// A single job as the freelancer is allowed to see it — only permitted fields
// are populated, so the client component can't leak what config hid.
export interface FreelancerJobView {
  id: string;
  title: string;
  status: PeopleFreelancerJobStatus;
  brief?: string;
  clientLabel?: string;   // client.name when "named"; a neutral label when anonymised
  startsOn?: string;
  dueOn?: string;
  deliveredAt?: number;
  feeLabel?: string;      // formatted only when showFee
  notes?: string;
  deliverables?: Array<{ id: string; name: string; url: string; addedAt: number }>;
  submissions: Array<{ id: string; name: string; url: string; uploadedAt: number; size: number }>;
  can: FreelancerAccessConfig["actions"];
}

export interface FreelancerConversationMessage {
  id: string;
  authorName: string;
  body: string;
  mine: boolean;
  createdAt: number;
}

export interface FreelancerWorkspaceView {
  freelancerName: string;
  jobs: FreelancerJobView[];
  messages: FreelancerConversationMessage[];
  canMessage: boolean;
}

function formatFee(feeMinor: number | undefined, currency: string): string | undefined {
  if (typeof feeMinor !== "number") return undefined;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(feeMinor / 100);
  } catch {
    return `${(feeMinor / 100).toFixed(2)} ${currency || "GBP"}`;
  }
}

function toJobView(job: PeopleFreelancerJob, agencyId: string, cfg: FreelancerAccessConfig): FreelancerJobView {
  const view: FreelancerJobView = {
    id: job.id,
    title: job.title,
    status: job.status,
    deliveredAt: job.deliveredAt,
    submissions: (job.submissions ?? []).map(file => ({ id: file.id, name: file.name, url: file.url, uploadedAt: file.uploadedAt, size: file.size })),
    can: cfg.actions,
  };
  if (cfg.showBrief) view.brief = job.brief;
  if (cfg.showDates) { view.startsOn = job.startsOn; view.dueOn = job.dueOn; }
  if (cfg.showFee) view.feeLabel = formatFee(job.feeMinor, job.currency);
  if (cfg.showNotes) view.notes = job.notes;
  if (cfg.showDeliverables) view.deliverables = (job.deliverables ?? []).map(item => ({ id: item.id, name: item.name, url: item.url, addedAt: item.addedAt }));
  if (job.clientId) {
    view.clientLabel = cfg.clientIdentity === "named"
      ? (getClientForAgency(agencyId, job.clientId)?.name ?? undefined)
      : "Confidential client project";
  }
  return view;
}

/**
 * Resolve the signed-in freelancer's workspace. Returns null when the user has
 * no linked freelancer employee record (so the page can show a friendly empty
 * state instead of leaking anything).
 */
export function freelancerWorkspace(agencyId: string, userId: string): FreelancerWorkspaceView | null {
  const employee = getPeopleEmployeeByUserId(agencyId, userId);
  if (!employee) return null;
  const jobs = listPeopleFreelancerJobs(agencyId, employee.id)
    .map(job => toJobView(job, agencyId, resolveFreelancerAccess(agencyId, employee.id, job.id)));
  return {
    freelancerName: employee.name,
    jobs,
    messages: freelancerAgencyConversation(agencyId, userId),
    canMessage: jobs.some(job => job.can.message),
  };
}

function freelancerOwnerChannel(agencyId: string, userId: string) {
  const owner = listUsersForAgency(agencyId).find(user => user.role === "agency-owner");
  if (!owner) return null;
  const channel = Object.values(getState().peopleChannels ?? {}).find(candidate =>
    candidate.agencyId === agencyId
    && candidate.kind === "direct"
    && candidate.memberUserIds.includes(userId)
    && candidate.memberUserIds.includes(owner.id));
  return { owner, channel };
}

export function freelancerAgencyConversation(agencyId: string, userId: string): FreelancerConversationMessage[] {
  const connection = freelancerOwnerChannel(agencyId, userId);
  if (!connection?.channel) return [];
  return listPeopleMessages(agencyId, connection.channel.id).map(message => ({
    id: message.id,
    authorName: message.authorName,
    body: message.body,
    mine: message.authorUserId === userId,
    createdAt: message.createdAt,
  }));
}

export function freelancerJobForAction(
  agencyId: string,
  userId: string,
  jobId: string,
  action: keyof FreelancerAccessConfig["actions"],
): PeopleFreelancerJob | null {
  const employee = getPeopleEmployeeByUserId(agencyId, userId);
  if (!employee) return null;
  const job = listPeopleFreelancerJobs(agencyId, employee.id).find(candidate => candidate.id === jobId);
  if (!job || !resolveFreelancerAccess(agencyId, employee.id, job.id).actions[action]) return null;
  return job;
}

export function messageFreelancerAgency(input: { agencyId: string; userId: string; jobId: string; body: string }): FreelancerConversationMessage[] {
  const job = freelancerJobForAction(input.agencyId, input.userId, input.jobId, "message");
  if (!job) throw new Error("Messaging is not available for this job.");
  const owner = listUsersForAgency(input.agencyId).find(user => user.role === "agency-owner");
  if (!owner) throw new Error("The agency owner account is unavailable.");
  const channel = ensureDirectChannel(input.agencyId, input.userId, owner.id);
  postPeopleMessage({
    agencyId: input.agencyId,
    channelId: channel.id,
    authorUserId: input.userId,
    body: `${job.title}: ${input.body}`,
  });
  markChannelRead(input.agencyId, channel.id, input.userId);
  return freelancerAgencyConversation(input.agencyId, input.userId);
}

// Freelancer action: mark an active job's work submitted (→ `delivered`, the
// freelancer's claim; the agency still controls `paid`). Gated on (a) the job
// belonging to this freelancer, (b) the config allowing it, (c) the job being
// active. Returns a discriminated result the API maps to a status code.
export function submitFreelancerJob(agencyId: string, userId: string, jobId: string):
  { ok: true } | { ok: false; error: "no_freelancer" | "not_your_job" | "not_allowed" | "not_active" } {
  const employee = getPeopleEmployeeByUserId(agencyId, userId);
  if (!employee) return { ok: false, error: "no_freelancer" };
  const job = listPeopleFreelancerJobs(agencyId, employee.id).find(j => j.id === jobId);
  if (!job) return { ok: false, error: "not_your_job" };
  if (!resolveFreelancerAccess(agencyId, employee.id, job.id).actions.markSubmitted) return { ok: false, error: "not_allowed" };
  if (job.status !== "active") return { ok: false, error: "not_active" };
  setPeopleFreelancerJobStatus({ agencyId, jobId: job.id, status: "delivered", actorUserId: userId });
  return { ok: true };
}
