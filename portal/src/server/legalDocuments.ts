import "server-only";

import crypto from "node:crypto";

import { logActivity } from "./activity";
import {
  applyLegalDocumentDetach,
  collectLegalDocumentDependants,
  describeLegalDocumentDependants,
  type LegalDocumentDependant,
} from "./legalDocumentDependencies";
import { getState, mutate } from "./storage";
import type { LegalDocument, LegalDocumentCategory, LegalDocumentStatus } from "./types";

/**
 * A permanent delete that was refused because records still cite the document.
 * It carries the exact dependants so the caller answers with the inventory
 * rather than a bare failure — the same named-conflict shape the capital
 * register uses.
 */
export class LegalDocumentInUseError extends Error {
  constructor(public readonly document: LegalDocument, public readonly dependants: LegalDocumentDependant[]) {
    super(`“${document.title}” was not deleted: ${describeLegalDocumentDependants(dependants)} Archive it to keep the evidence, or confirm a detach to clear those citations first.`);
    this.name = "LegalDocumentInUseError";
  }
}

/**
 * Reserved `reference` prefix for compliance *framework declarations* — the
 * per-company record that says "this company is on the HIPAA track".
 *
 * Why it lives here rather than in a settings field: the flag has to persist
 * per trading company, and the only typed per-company store is `types.ts` /
 * `storage.ts`, which this plan does not own. Rather than invent a second,
 * untyped persistence path, the declaration is written as a legal-register
 * record — which is arguably where it belongs anyway: you should not be able
 * to put a company on the HIPAA track without a dated, attributable record
 * saying you handle PHI and for whom.
 *
 * Two consequences are deliberate:
 *   - declarations are INVISIBLE to `listLegalDocuments`, so the legal register
 *     UI, search, Radar's compliance counts and the operational alerts all see
 *     exactly what they saw before. A toggle must not inflate a document count.
 *   - the reserved prefix is stripped from anything a user writes, so nobody
 *     can hand-craft a document that silently switches a framework on.
 *
 * If a typed `complianceSettings` slice ever lands, move the flag there and
 * leave the declaration as the evidence record.
 */
export const COMPLIANCE_DECLARATION_PREFIX = "aqua:framework:";
export const HIPAA_TRACK_REFERENCE = `${COMPLIANCE_DECLARATION_PREFIX}hipaa`;

function isComplianceDeclaration(document: LegalDocument): boolean {
  return typeof document.reference === "string" && document.reference.startsWith(COMPLIANCE_DECLARATION_PREFIX);
}

/**
 * The legal register as every existing surface knows it. Framework declarations
 * are filtered out — they are configuration evidence, not filed documents, and
 * they have no file behind them.
 */
export function listLegalDocuments(agencyId: string): LegalDocument[] {
  return Object.values(getState().legalDocuments)
    .filter(document => document.agencyId === agencyId && !isComplianceDeclaration(document))
    .sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived") || (a.reminderAt ?? a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.reminderAt ?? b.expiresAt ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt);
}

/** Declarations only — the compliance posture's view of which tracks are on. */
export function listComplianceDeclarations(agencyId: string): LegalDocument[] {
  return Object.values(getState().legalDocuments)
    .filter(document => document.agencyId === agencyId && isComplianceDeclaration(document))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLegalDocument(agencyId: string, id: string): LegalDocument | null {
  const document = getState().legalDocuments[id];
  if (!document || document.agencyId !== agencyId) return null;
  // A declaration has no file behind it, so it must never be reachable from the
  // document-content or delete paths that assume one.
  return isComplianceDeclaration(document) ? null : document;
}

/**
 * Is the HIPAA readiness track switched on for this company?
 *
 * `companyId === null` means the agency-wide/shared scope. A declaration with
 * no `companyIds` applies to every company, matching the register's own
 * "empty = parent/shared record" convention.
 *
 * IMPORTANT: a `true` here means "a checklist is switched on", never "this
 * company is HIPAA compliant". See `lib/compliancePosture.ts`.
 */
export function isHipaaTrackEnabled(agencyId: string, companyId: string | null): boolean {
  return listComplianceDeclarations(agencyId).some(document =>
    document.reference === HIPAA_TRACK_REFERENCE
    && document.status !== "archived"
    && (!document.companyIds?.length || (companyId !== null && document.companyIds.includes(companyId))));
}

/**
 * Flip the HIPAA readiness track for one company.
 *
 * Turning it OFF archives the declaration rather than deleting it: when the
 * track was on matters later, and a compliance record that can vanish without
 * trace is worse than none.
 */
export function setHipaaTrack(input: {
  agencyId: string;
  companyId: string | null;
  companyName: string;
  enabled: boolean;
  actorUserId: string;
}): LegalDocument | null {
  const { agencyId, companyId, companyName, enabled, actorUserId } = input;
  const existing = listComplianceDeclarations(agencyId).find(document =>
    document.reference === HIPAA_TRACK_REFERENCE
    && sameScope(document.companyIds, companyId));
  const now = Date.now();

  if (!enabled) {
    if (!existing || existing.status === "archived") return existing ?? null;
    const archived: LegalDocument = { ...existing, status: "archived", updatedAt: now };
    mutate(state => { state.legalDocuments[archived.id] = archived; });
    logActivity({
      agencyId,
      actorUserId,
      category: "settings",
      action: "compliance.hipaa_track_disabled",
      message: `Switched the HIPAA readiness track off for ${companyName}.`,
      metadata: { documentId: archived.id, companyId: companyId ?? "" },
    });
    return archived;
  }

  const declaration: LegalDocument = existing
    ? { ...existing, status: "active", effectiveAt: existing.effectiveAt ?? now, updatedAt: now }
    : {
      id: `legal_${crypto.randomBytes(8).toString("hex")}`,
      agencyId,
      companyIds: companyId ? [companyId] : [],
      title: `PHI scope declaration — ${companyName}`,
      category: "company",
      status: "active",
      reference: HIPAA_TRACK_REFERENCE,
      notes: "Declares that this company handles protected health information, which switches on the HIPAA readiness checklist. "
        + "This declaration is a scope statement only. It does not make the company HIPAA compliant and confers nothing: "
        + "signed BAAs with every subprocessor, a risk assessment, workforce training and legal sign-off all happen outside this software.",
      effectiveAt: now,
      fileName: "",
      contentType: "application/vnd.aqua.compliance-declaration",
      size: 0,
      storageProvider: "local",
      storageKey: "",
      createdBy: actorUserId,
      createdAt: now,
      updatedAt: now,
    };

  mutate(state => { state.legalDocuments[declaration.id] = declaration; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "compliance.hipaa_track_enabled",
    message: `Switched the HIPAA readiness track on for ${companyName}. This tracks requirements; it does not confer compliance.`,
    metadata: { documentId: declaration.id, companyId: companyId ?? "" },
  });
  return declaration;
}

function sameScope(companyIds: string[] | undefined, companyId: string | null): boolean {
  const scoped = companyIds ?? [];
  return companyId === null ? scoped.length === 0 : scoped.length === 1 && scoped[0] === companyId;
}

/**
 * Strip the reserved prefix from user-supplied references so a hand-written
 * reference can never switch a framework on. Returns the cleaned value.
 */
function cleanReference(value: unknown, max: number): string {
  const reference = clean(value, max);
  return reference.toLowerCase().startsWith(COMPLIANCE_DECLARATION_PREFIX) ? "" : reference;
}

export function createLegalDocument(input: Omit<LegalDocument, "createdAt" | "updatedAt">): LegalDocument {
  const now = Date.now();
  const document: LegalDocument = {
    ...input,
    companyIds: cleanList(input.companyIds),
    title: clean(input.title, 240) || input.fileName,
    category: cleanCategory(input.category),
    status: cleanStatus(input.status),
    counterparty: clean(input.counterparty, 180) || undefined,
    reference: cleanReference(input.reference, 120) || undefined,
    notes: clean(input.notes, 4_000) || undefined,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.legalDocuments[document.id] = document; });
  logActivity({
    agencyId: document.agencyId,
    actorUserId: document.createdBy,
    category: "settings",
    action: "legal.document_added",
    message: `Added ${document.category} document "${document.title}".`,
    metadata: { documentId: document.id },
  });
  return document;
}

/** Roll back only the row/audit written by a failed private-upload attach. */
export function rollbackLegalDocumentUpload(agencyId: string, id: string): boolean {
  let removed = false;
  mutate(state => {
    const document = state.legalDocuments[id];
    if (!document || document.agencyId !== agencyId) return;
    delete state.legalDocuments[id];
    state.activity = state.activity.filter(entry => !(
      entry.agencyId === agencyId
      && entry.action === "legal.document_added"
      && entry.metadata?.documentId === id
    ));
    removed = true;
  });
  return removed;
}

export function updateLegalDocument(
  agencyId: string,
  id: string,
  patch: Partial<Pick<LegalDocument, "title" | "category" | "status" | "counterparty" | "reference" | "effectiveAt" | "expiresAt" | "reminderAt" | "notes" | "companyIds">>,
  actorUserId: string,
): LegalDocument | null {
  const existing = getLegalDocument(agencyId, id);
  if (!existing) return null;
  const updated: LegalDocument = {
    ...existing,
    companyIds: patch.companyIds === undefined ? existing.companyIds : cleanList(patch.companyIds),
    title: patch.title === undefined ? existing.title : clean(patch.title, 240) || existing.title,
    category: patch.category === undefined ? existing.category : cleanCategory(patch.category),
    status: patch.status === undefined ? existing.status : cleanStatus(patch.status),
    counterparty: patch.counterparty === undefined ? existing.counterparty : clean(patch.counterparty, 180) || undefined,
    reference: patch.reference === undefined ? existing.reference : cleanReference(patch.reference, 120) || undefined,
    effectiveAt: patch.effectiveAt === undefined ? existing.effectiveAt : cleanDate(patch.effectiveAt),
    expiresAt: patch.expiresAt === undefined ? existing.expiresAt : cleanDate(patch.expiresAt),
    reminderAt: patch.reminderAt === undefined ? existing.reminderAt : cleanDate(patch.reminderAt),
    notes: patch.notes === undefined ? existing.notes : clean(patch.notes, 4_000) || undefined,
    updatedAt: Date.now(),
  };
  mutate(state => { state.legalDocuments[id] = updated; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "legal.document_updated",
    message: `Updated legal document "${updated.title}".`,
    metadata: { documentId: id },
  });
  return updated;
}

/**
 * Permanently remove a register row.
 *
 * `detach` clears every finance obligation and governance decision still
 * citing the document IN THE SAME transaction as the row. Without it a purge
 * with dependants is refused, because the alternative — the row gone and the
 * citations still holding its id — is the silent damage this guard exists to
 * prevent: an obligation quietly loses its evidence link and a decision prints
 * a document id nobody can open.
 *
 * Returns the removed document together with what it actually detached, so the
 * caller reports a reconciliation it verified rather than one it assumed.
 */
export function deleteLegalDocument(
  agencyId: string,
  id: string,
  options?: { detach?: boolean; actorUserId?: string },
): { document: LegalDocument; detached: LegalDocumentDependant[] } | null {
  const existing = getLegalDocument(agencyId, id);
  if (!existing) return null;
  let detached: LegalDocumentDependant[] = [];
  let refused = false;
  mutate(state => {
    const dependants = collectLegalDocumentDependants(state, agencyId, id);
    if (dependants.length && !options?.detach) { refused = true; return; }
    detached = options?.detach ? applyLegalDocumentDetach(state, agencyId, id) : [];
    delete state.legalDocuments[id];
  });
  if (refused) throw new LegalDocumentInUseError(existing, collectLegalDocumentDependants(getState(), agencyId, id));
  logActivity({
    agencyId,
    actorUserId: options?.actorUserId ?? existing.createdBy,
    category: "settings",
    action: "legal.document_deleted",
    message: detached.length
      ? `Permanently deleted legal document "${existing.title}" and detached it from ${describeLegalDocumentDependants(detached)}`
      : `Permanently deleted legal document "${existing.title}". Nothing cited it.`,
    metadata: {
      documentId: id,
      detachedCount: String(detached.length),
      detached: detached.map(dependant => `${dependant.kind}:${dependant.id}`).join(","),
    },
  });
  return { document: existing, detached };
}

/**
 * Puts a just-deleted register row back exactly as it was.
 *
 * The compensating half of a permanent delete. `deleteLegalDocument` is the
 * authoritative dependant check, so it has to run BEFORE the stored binary is
 * touched — otherwise a citation appearing mid-delete destroys the file and
 * leaves the row advertising evidence nobody can open. That ordering means the
 * row is already gone when the provider delete runs, so a provider refusal has
 * to restore it rather than report a delete that half-happened.
 *
 * Deliberately NOT `createLegalDocument`: this restores the original
 * `createdAt`/`createdBy`/`id`, because the document was never really deleted.
 * Returns false when a row with that id exists again (nothing to restore).
 *
 * It cannot re-attach citations a `detach` purge already cleared — the caller
 * must report that residue rather than imply a clean rollback.
 */
export function restoreLegalDocument(document: LegalDocument): boolean {
  let restored = false;
  mutate(state => {
    if (state.legalDocuments[document.id]) return;
    state.legalDocuments[document.id] = document;
    restored = true;
  });
  return restored;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))).slice(0, 30)
    : [];
}

function cleanDate(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function cleanCategory(value: unknown): LegalDocumentCategory {
  const allowed: LegalDocumentCategory[] = ["contract", "insurance", "hmrc", "letter", "template", "policy", "company", "other"];
  return allowed.includes(value as LegalDocumentCategory) ? value as LegalDocumentCategory : "other";
}

function cleanStatus(value: unknown): LegalDocumentStatus {
  const allowed: LegalDocumentStatus[] = ["draft", "active", "action-required", "expired", "archived"];
  return allowed.includes(value as LegalDocumentStatus) ? value as LegalDocumentStatus : "active";
}
