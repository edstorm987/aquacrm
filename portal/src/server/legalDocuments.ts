import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { LegalDocument, LegalDocumentCategory, LegalDocumentStatus } from "./types";

export function listLegalDocuments(agencyId: string): LegalDocument[] {
  return Object.values(getState().legalDocuments)
    .filter(document => document.agencyId === agencyId)
    .sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived") || (a.reminderAt ?? a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.reminderAt ?? b.expiresAt ?? Number.MAX_SAFE_INTEGER) || b.updatedAt - a.updatedAt);
}

export function getLegalDocument(agencyId: string, id: string): LegalDocument | null {
  const document = getState().legalDocuments[id];
  return document?.agencyId === agencyId ? document : null;
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
    reference: clean(input.reference, 120) || undefined,
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
    reference: patch.reference === undefined ? existing.reference : clean(patch.reference, 120) || undefined,
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

export function deleteLegalDocument(agencyId: string, id: string): LegalDocument | null {
  const existing = getLegalDocument(agencyId, id);
  if (!existing) return null;
  mutate(state => { delete state.legalDocuments[id]; });
  return existing;
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
