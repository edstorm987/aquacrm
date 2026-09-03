import "server-only";

import crypto from "node:crypto";

import { logActivity } from "@/server/activity";
import { createAgencyTask } from "@/server/tasks";
import { getState, mutate } from "@/server/storage";
import type {
  AgencyTask,
  AgencyTaskPriority,
  ExternalAssistantActionProposal,
  ExternalAssistantProposalCategory,
  ExternalAssistantProposalStatus,
  AccessElementKey,
} from "@/server/types";

const OPEN_PROPOSAL_LIMIT_PER_ASSISTANT = 50;
const CATEGORIES: ExternalAssistantProposalCategory[] = ["company", "client", "sales", "finance", "delivery", "support", "development", "marketing", "operations"];
const PRIORITIES: AgencyTaskPriority[] = ["low", "normal", "high", "urgent"];

export interface SubmitExternalAssistantProposalInput {
  agencyId: string;
  assistantKeyId?: string;
  assistantFingerprint: string;
  assistantName: string;
  title: string;
  detail: string;
  evidence?: string[];
  category?: ExternalAssistantProposalCategory;
  /** Derived by the authenticated transport; never accepted from assistant text. */
  requiredElements?: AccessElementKey[];
  priority?: AgencyTaskPriority;
  suggestedDueAt?: number;
  sourceIds?: string[];
  sourceHref?: string;
  expectedOutcome?: string;
}

export function listExternalAssistantActionProposals(
  agencyId: string,
  statuses?: ExternalAssistantProposalStatus[],
): ExternalAssistantActionProposal[] {
  releaseExpiredParks(agencyId);
  const allowed = statuses?.length ? new Set(statuses) : null;
  return Object.values(getState().externalAssistantActionProposals)
    .filter(proposal => proposal.agencyId === agencyId && (!allowed || allowed.has(proposal.status)))
    .sort((left, right) => proposalStatusRank(left.status) - proposalStatusRank(right.status) || right.updatedAt - left.updatedAt);
}

export function listProposalsForExternalAssistant(
  agencyId: string,
  assistantFingerprint: string,
): ExternalAssistantActionProposal[] {
  return listExternalAssistantActionProposals(agencyId)
    .filter(proposal => proposal.assistantFingerprint === assistantFingerprint)
    .slice(0, 100);
}

export function submitExternalAssistantActionProposal(
  input: SubmitExternalAssistantProposalInput,
): ExternalAssistantActionProposal {
  const title = cleanText(input.title, 240);
  const detail = cleanText(input.detail, 2_000);
  if (!title) throw new Error("proposal_title_required");
  if (!detail) throw new Error("proposal_detail_required");

  const open = Object.values(getState().externalAssistantActionProposals)
    .filter(proposal => proposal.agencyId === input.agencyId
      && proposal.assistantFingerprint === input.assistantFingerprint
      && (proposal.status === "pending" || proposal.status === "parked"));
  const duplicate = open.find(proposal => normalise(proposal.title) === normalise(title));
  if (duplicate) return duplicate;
  if (open.length >= OPEN_PROPOSAL_LIMIT_PER_ASSISTANT) throw new Error("proposal_limit_reached");

  const now = Date.now();
  const requiredElements = [...new Set<AccessElementKey>([
    "workspace.actions",
    ...(input.requiredElements ?? []),
  ])];
  const proposal: ExternalAssistantActionProposal = {
    id: `aip_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    assistantKeyId: input.assistantKeyId,
    assistantFingerprint: input.assistantFingerprint,
    assistantName: cleanText(input.assistantName, 80) || "External assistant",
    title,
    detail,
    evidence: cleanList(input.evidence, 20, 500),
    category: CATEGORIES.includes(input.category as ExternalAssistantProposalCategory) ? input.category! : "operations",
    requiredElements,
    priority: PRIORITIES.includes(input.priority as AgencyTaskPriority) ? input.priority! : "normal",
    suggestedDueAt: validFutureTimestamp(input.suggestedDueAt),
    sourceIds: cleanList(input.sourceIds, 30, 240),
    sourceHref: validSourceHref(input.sourceHref),
    expectedOutcome: cleanText(input.expectedOutcome, 600) || undefined,
    status: "pending",
    submittedAt: now,
    updatedAt: now,
  };
  mutate(state => { state.externalAssistantActionProposals[proposal.id] = proposal; });
  logActivity({
    agencyId: proposal.agencyId,
    category: "integrations",
    action: "external_ai.action_proposed",
    message: `${proposal.assistantName} proposed “${proposal.title}”.`,
    metadata: { proposalId: proposal.id, assistantKeyId: proposal.assistantKeyId, priority: proposal.priority, category: proposal.category, requiredElements },
  });
  return proposal;
}

export function decideExternalAssistantActionProposal(input: {
  agencyId: string;
  proposalId: string;
  decision: "accept" | "park" | "reject";
  actorUserId: string;
  assigneeUserId?: string;
  dueAt?: number;
  parkedUntil?: number;
  note?: string;
}): { proposal: ExternalAssistantActionProposal; task?: AgencyTask } {
  const existing = getState().externalAssistantActionProposals[input.proposalId];
  if (!existing || existing.agencyId !== input.agencyId) throw new Error("proposal_not_found");
  if (existing.status === "accepted" || existing.status === "rejected") throw new Error("proposal_already_decided");

  const now = Date.now();
  let task: AgencyTask | undefined;
  const nextStatus: ExternalAssistantProposalStatus = input.decision === "accept" ? "accepted" : input.decision === "park" ? "parked" : "rejected";
  if (input.decision === "accept") {
    const sourceIds = existing.sourceIds.slice(0, 30);
    const requestedAssignee = input.assigneeUserId
      ? getState().users[input.assigneeUserId]
      : undefined;
    const assigneeUserId = requestedAssignee
      && (requestedAssignee.agencyId === existing.agencyId || requestedAssignee.agencyIds?.includes(existing.agencyId))
      ? requestedAssignee.id
      : input.actorUserId;
    task = createAgencyTask({
      agencyId: existing.agencyId,
      title: existing.title,
      notes: existing.detail,
      priority: existing.priority,
      dueAt: validFutureTimestamp(input.dueAt) ?? existing.suggestedDueAt ?? now + 3 * 86_400_000,
      origin: "advisor",
      sourceId: `external-proposal:${existing.id}`,
      sourceHref: existing.sourceHref,
      evidence: existing.evidence,
      evidenceSourceIds: sourceIds,
      expectedOutcome: existing.expectedOutcome,
      reconciliationSourceIds: sourceIds,
      assigneeUserId,
      createdBy: input.actorUserId,
    });
  }

  const proposal: ExternalAssistantActionProposal = {
    ...existing,
    status: nextStatus,
    updatedAt: now,
    parkedUntil: input.decision === "park" ? validFutureTimestamp(input.parkedUntil) ?? now + 86_400_000 : undefined,
    decidedAt: input.decision === "park" ? undefined : now,
    decidedBy: input.decision === "park" ? undefined : input.actorUserId,
    decisionNote: cleanText(input.note, 1_000) || undefined,
    taskId: task?.id,
  };
  mutate(state => { state.externalAssistantActionProposals[proposal.id] = proposal; });
  logActivity({
    agencyId: proposal.agencyId,
    actorUserId: input.actorUserId,
    category: "integrations",
    action: `external_ai.proposal_${nextStatus}`,
    message: `${input.decision === "accept" ? "Accepted" : input.decision === "park" ? "Parked" : "Rejected"} external AI proposal “${proposal.title}”.`,
    metadata: { proposalId: proposal.id, taskId: task?.id, assistantKeyId: proposal.assistantKeyId },
  });
  return { proposal, task };
}

function releaseExpiredParks(agencyId: string): void {
  const now = Date.now();
  const expired = Object.values(getState().externalAssistantActionProposals)
    .filter(proposal => proposal.agencyId === agencyId && proposal.status === "parked" && proposal.parkedUntil && proposal.parkedUntil <= now);
  if (!expired.length) return;
  mutate(state => {
    for (const proposal of expired) state.externalAssistantActionProposals[proposal.id] = { ...proposal, status: "pending", parkedUntil: undefined, updatedAt: now };
  });
}

function proposalStatusRank(status: ExternalAssistantProposalStatus): number {
  return status === "pending" ? 0 : status === "parked" ? 1 : status === "accepted" ? 2 : 3;
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

function cleanList(values: unknown[] | undefined, limit: number, itemLimit: number): string[] {
  return [...new Set((values ?? []).map(value => cleanText(value, itemLimit)).filter(Boolean))].slice(0, limit);
}

function validFutureTimestamp(value?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > Date.now() - 86_400_000 ? value : undefined;
}

function validSourceHref(value?: string): string | undefined {
  const href = cleanText(value, 1_000);
  return href.startsWith("/") ? href : undefined;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
