import "server-only";

import crypto from "node:crypto";

import { cleanClientContacts } from "@/lib/clients/clientContacts";
import { getState, mutate } from "@/server/storage";
import { getClientForAgency, listClients } from "@/server/tenants";
import type {
  Client,
  IdentityResolutionCandidate,
  IdentityResolutionReason,
  IdentityResolutionResult,
  IdentityResolutionReview,
  IdentityResolutionSource,
  IdentityReviewStatus,
} from "@/server/types";

const AUTO_LINK_SCORE = 90;
const AUTO_LINK_MARGIN = 12;
const SUGGESTION_SCORE = 35;
const COMMON_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "yahoo.com", "aol.com", "proton.me", "protonmail.com",
]);

export interface IdentityResolutionInput {
  agencyId: string;
  sourceType: IdentityResolutionSource;
  sourceId: string;
  sourceLabel: string;
  sourceHref?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  clientId?: string;
  leadId?: string;
  contactId?: string;
  resolvedAt?: number;
}

export interface IdentityReviewDecision {
  agencyId: string;
  reviewId: string;
  action: "link" | "park" | "dismiss";
  clientId?: string;
  note?: string;
  parkedUntil?: number;
  actorUserId: string;
}

type CandidateAccumulator = {
  client: Client;
  reasons: IdentityResolutionReason[];
  clientContactId?: string;
};

export function normaliseIdentityEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function normaliseIdentityPhone(value: string | undefined, defaultCountryCode = "44"): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const extensionless = raw.replace(/(?:ext\.?|extension|x)\s*\d+$/i, "").trim();
  let digits = extensionless.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (defaultCountryCode && digits.startsWith(`${defaultCountryCode}0`)) digits = `${defaultCountryCode}${digits.slice(defaultCountryCode.length + 1)}`;
  if (digits.startsWith("0") && defaultCountryCode) digits = `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length < 7 || digits.length > 15) return "";
  return `+${digits}`;
}

export function resolveContactIdentity(input: IdentityResolutionInput): IdentityResolutionResult {
  const email = normaliseIdentityEmail(input.email);
  const phone = normaliseIdentityPhone(input.phone);
  const name = normaliseWords(input.name);
  const company = normaliseWords(input.company);
  const emailDomain = email.includes("@") ? email.split("@").at(-1) ?? "" : "";
  const accumulators = listClients(input.agencyId).map(client => scoreClient({
    client,
    input,
    email,
    phone,
    name,
    company,
    emailDomain,
  }));
  const candidates = accumulators
    .map(toCandidate)
    .filter(candidate => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence || left.clientName.localeCompare(right.clientName));
  const top = candidates[0];
  const runnerUp = candidates[1];
  const hasAuthoritativeEvidence = Boolean(top?.reasons.some(reason => ["explicit", "crm-id", "email", "phone"].includes(reason.kind)));
  const topHasExactCompany = Boolean(company && top?.reasons.some(reason => reason.kind === "company" && reason.weight >= 32));
  const runnerUpHasExactCompany = Boolean(company && runnerUp?.reasons.some(reason => reason.kind === "company" && reason.weight >= 32));
  const uniqueEnough = !runnerUp
    || top.confidence - runnerUp.confidence >= AUTO_LINK_MARGIN
    || (topHasExactCompany && !runnerUpHasExactCompany);
  const resolved = Boolean(top && top.confidence >= AUTO_LINK_SCORE && hasAuthoritativeEvidence && uniqueEnough);
  const status = resolved ? "resolved" : top && top.confidence >= SUGGESTION_SCORE ? "ambiguous" : "unmatched";
  const explanation = resolutionExplanation(status, top, runnerUp);
  return {
    status,
    confidence: resolved || status === "ambiguous" ? top?.confidence ?? 0 : 0,
    clientId: resolved ? top?.clientId : undefined,
    clientName: resolved ? top?.clientName : undefined,
    clientContactId: resolved ? top?.clientContactId : undefined,
    leadId: clean(input.leadId, 160),
    contactId: clean(input.contactId, 160),
    candidates: candidates.slice(0, 8),
    explanation,
    resolvedAt: input.resolvedAt ?? Date.now(),
  };
}

export function upsertIdentityResolutionReview(input: IdentityResolutionInput, resolution: IdentityResolutionResult): IdentityResolutionReview {
  const id = reviewId(input.agencyId, input.sourceType, input.sourceId);
  const current = getState().identityResolutionReviews?.[id];
  const now = Date.now();
  const manuallyDecided = current?.status === "linked" || current?.status === "dismissed" || (current?.status === "parked" && (current.parkedUntil ?? Infinity) > now);
  const status: IdentityReviewStatus = manuallyDecided
    ? current.status
    : resolution.status === "resolved"
      ? "auto-linked"
      : "pending";
  const review: IdentityResolutionReview = {
    ...current,
    id,
    agencyId: input.agencyId,
    sourceType: input.sourceType,
    sourceId: clean(input.sourceId, 200) ?? input.sourceId,
    sourceLabel: clean(input.sourceLabel, 240) ?? "Unlabelled identity",
    sourceHref: clean(input.sourceHref, 2_000),
    name: clean(input.name, 200),
    email: normaliseIdentityEmail(input.email) || undefined,
    phone: clean(input.phone, 80),
    company: clean(input.company, 200),
    leadId: clean(input.leadId, 160),
    contactId: clean(input.contactId, 160),
    status,
    resolution: manuallyDecided && current ? current.resolution : resolution,
    selectedClientId: manuallyDecided ? current?.selectedClientId : resolution.clientId,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  // Idempotency guard (mirrors upsertPerson, persons.ts). This helper is called
  // for up to ~500 website enquiries plus every social conversation on EVERY
  // clients/inbox render. Without this it rebuilt the review with a fresh
  // `updatedAt` and called mutate() per item per render, and the page's
  // flushPendingWrites() then serialised the whole batch into one
  // apply_app_datastore_patch on the single ~3.25MB app_datastores row — a
  // multi-minute write convoy on serverless (invisible on a single-process
  // localhost). Compare on everything except the volatile timestamps: BOTH the
  // top-level `updatedAt` AND the nested `resolution.resolvedAt`, which
  // resolveContactIdentity re-stamps with Date.now() on every call. A genuine
  // change (status, link, candidates, labels…) still differs and still writes.
  const normalise = (candidate: IdentityResolutionReview): string =>
    JSON.stringify({ ...candidate, updatedAt: 0, resolution: { ...candidate.resolution, resolvedAt: 0 } });
  if (current && normalise(current) === normalise(review)) return current;
  mutate(state => {
    state.identityResolutionReviews ??= {};
    state.identityResolutionReviews[id] = review;
  });
  return review;
}

export function listIdentityResolutionReviews(
  agencyId: string,
  options: { status?: IdentityReviewStatus | "all"; includeAutoLinked?: boolean } = {},
): IdentityResolutionReview[] {
  const status = options.status ?? "pending";
  return Object.values(getState().identityResolutionReviews ?? {})
    .filter(review => review.agencyId === agencyId)
    .filter(review => options.includeAutoLinked || review.status !== "auto-linked")
    .filter(review => status === "all" || review.status === status)
    .sort((left, right) => statusRank(left.status) - statusRank(right.status) || right.updatedAt - left.updatedAt);
}

export function getIdentityResolutionReview(agencyId: string, reviewIdValue: string): IdentityResolutionReview | null {
  const review = getState().identityResolutionReviews?.[reviewIdValue];
  return review?.agencyId === agencyId ? review : null;
}

export function clearIdentityResolutionReviews(agencyId: string): number {
  const ids = Object.values(getState().identityResolutionReviews ?? {})
    .filter(review => review.agencyId === agencyId)
    .map(review => review.id);
  if (!ids.length) return 0;
  mutate(state => {
    state.identityResolutionReviews ??= {};
    for (const id of ids) delete state.identityResolutionReviews[id];
  });
  return ids.length;
}

export function decideIdentityResolutionReview(input: IdentityReviewDecision): IdentityResolutionReview | null {
  const current = getIdentityResolutionReview(input.agencyId, input.reviewId);
  if (!current) return null;
  const now = Date.now();
  let updated: IdentityResolutionReview;
  if (input.action === "link") {
    const client = input.clientId ? getClientForAgency(input.agencyId, input.clientId) : null;
    if (!client) throw new Error("A valid client is required to link this identity.");
    const candidate = current.resolution.candidates.find(item => item.clientId === client.id);
    updated = {
      ...current,
      status: "linked",
      selectedClientId: client.id,
      decisionNote: clean(input.note, 1_000),
      decidedBy: input.actorUserId,
      decidedAt: now,
      parkedUntil: undefined,
      resolution: {
        ...current.resolution,
        status: "resolved",
        confidence: candidate?.confidence ?? 100,
        clientId: client.id,
        clientName: client.name,
        clientContactId: candidate?.clientContactId,
        explanation: candidate
          ? `Manually approved after reviewing ${candidate.reasons.length} matching signal${candidate.reasons.length === 1 ? "" : "s"}.`
          : "Manually linked to the selected client after identity review.",
        resolvedAt: now,
      },
      updatedAt: now,
    };
  } else if (input.action === "park") {
    updated = {
      ...current,
      status: "parked",
      decisionNote: clean(input.note, 1_000),
      parkedUntil: Number.isFinite(input.parkedUntil) ? input.parkedUntil : now + 7 * 24 * 60 * 60 * 1_000,
      decidedBy: input.actorUserId,
      decidedAt: now,
      updatedAt: now,
    };
  } else {
    updated = {
      ...current,
      status: "dismissed",
      decisionNote: clean(input.note, 1_000),
      parkedUntil: undefined,
      decidedBy: input.actorUserId,
      decidedAt: now,
      updatedAt: now,
    };
  }
  mutate(state => {
    state.identityResolutionReviews ??= {};
    state.identityResolutionReviews[current.id] = updated;
  });
  return updated;
}

function scoreClient(args: {
  client: Client;
  input: IdentityResolutionInput;
  email: string;
  phone: string;
  name: string;
  company: string;
  emailDomain: string;
}): CandidateAccumulator {
  const { client, input, email, phone, name, company, emailDomain } = args;
  const metadata = client.metadata ?? {};
  const linkedContacts = cleanClientContacts(metadata.linkedContacts);
  const reasons: IdentityResolutionReason[] = [];
  let clientContactId: string | undefined;
  const add = (reason: IdentityResolutionReason) => {
    if (!reasons.some(item => item.kind === reason.kind && item.label === reason.label && item.detail === reason.detail)) reasons.push(reason);
  };

  if (input.clientId && input.clientId === client.id) add({ kind: "explicit", label: "Existing client link", detail: `The source already names ${client.name}.`, weight: 100 });
  const metadataLeadIds = [metadata.leadId, metadata.promotedFromLeadId].filter((value): value is string => typeof value === "string");
  if (input.leadId && metadataLeadIds.includes(input.leadId)) add({ kind: "crm-id", label: "Lead lineage", detail: "The source lead is already recorded on this client.", weight: 98 });
  if (input.contactId && metadata.contactId === input.contactId) add({ kind: "crm-id", label: "Contact lineage", detail: "The source contact is already recorded on this client.", weight: 98 });

  const clientEmails = [client.ownerEmail, metadata.clientEmail, metadata.portalLoginEmail, metadata.contactEmail]
    .filter((value): value is string => typeof value === "string")
    .map(normaliseIdentityEmail)
    .filter(Boolean);
  if (email && clientEmails.includes(email)) add({ kind: "email", label: "Exact account email", detail: email, weight: 96 });
  for (const contact of linkedContacts) {
    if (input.contactId && contact.id === input.contactId) {
      clientContactId = contact.id;
      add({ kind: "crm-id", label: "Linked client contact", detail: `${contact.name} is stored on this client.`, weight: 99 });
    }
    if (email && normaliseIdentityEmail(contact.email) === email) {
      clientContactId ??= contact.id;
      add({ kind: "email", label: "Exact linked-contact email", detail: `${contact.name} · ${email}`, weight: 98 });
    }
    if (phone && normaliseIdentityPhone(contact.phone) === phone) {
      clientContactId ??= contact.id;
      add({ kind: "phone", label: "Exact linked-contact phone", detail: `${contact.name} · ${phone}`, weight: 96 });
    }
    if (name && normaliseWords(contact.name) === name) add({ kind: "name", label: "Matching contact name", detail: contact.name, weight: 28 });
  }

  const clientPhones = [metadata.phone, metadata.contactPhone, metadata.clientPhone]
    .filter((value): value is string => typeof value === "string")
    .map(value => normaliseIdentityPhone(value))
    .filter(Boolean);
  if (phone && clientPhones.includes(phone)) add({ kind: "phone", label: "Exact account phone", detail: phone, weight: 94 });
  if (company && normaliseWords(client.name) === company) add({ kind: "company", label: "Matching company", detail: client.name, weight: 32 });
  if (name && normaliseWords(client.name) === name) add({ kind: "name", label: "Matching client name", detail: client.name, weight: 32 });

  if (emailDomain && !COMMON_EMAIL_DOMAINS.has(emailDomain)) {
    const clientDomains = clientEmails.map(value => value.split("@").at(-1)).filter(Boolean);
    if (clientDomains.includes(emailDomain)) add({ kind: "email-domain", label: "Matching business email domain", detail: emailDomain, weight: 18 });
  }
  return { client, reasons, clientContactId };
}

function toCandidate(value: CandidateAccumulator): IdentityResolutionCandidate {
  const rawScore = value.reasons.reduce((total, reason) => total + reason.weight, 0);
  return {
    clientId: value.client.id,
    clientName: value.client.name,
    clientContactId: value.clientContactId,
    confidence: Math.min(100, rawScore),
    reasons: value.reasons.sort((left, right) => right.weight - left.weight),
  };
}

function resolutionExplanation(status: IdentityResolutionResult["status"], top?: IdentityResolutionCandidate, runnerUp?: IdentityResolutionCandidate): string {
  if (status === "resolved" && top) return `Linked to ${top.clientName} from ${top.reasons.map(reason => reason.label.toLowerCase()).join(", ")}.`;
  if (status === "ambiguous" && top && runnerUp && top.confidence - runnerUp.confidence < AUTO_LINK_MARGIN) {
    return `${top.clientName} and ${runnerUp.clientName} are too close to choose safely.`;
  }
  if (status === "ambiguous" && top) return `${top.clientName} is a possible match, but the evidence is not authoritative enough to auto-link.`;
  return "No client has enough matching evidence. Review or leave this identity unlinked.";
}

function normaliseWords(value: string | undefined): string {
  return value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

function reviewId(agencyId: string, sourceType: IdentityResolutionSource, sourceId: string): string {
  const digest = crypto.createHash("sha256").update(`${agencyId}\u0000${sourceType}\u0000${sourceId}`).digest("hex").slice(0, 24);
  return `irr_${digest}`;
}

function statusRank(status: IdentityReviewStatus): number {
  return status === "pending" ? 0 : status === "parked" ? 1 : status === "linked" ? 2 : status === "dismissed" ? 3 : 4;
}

function clean(value: unknown, limit: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, limit) || undefined : undefined;
}
