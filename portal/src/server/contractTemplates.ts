import "server-only";

import crypto from "node:crypto";
import type { ClientContractTemplate } from "@/lib/clients/clientContracts";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";

export function listContractTemplates(agencyId: string, includeArchived = false): ClientContractTemplate[] {
  return Object.values(getState().contractTemplates)
    .filter(template => template.agencyId === agencyId && (includeArchived || template.status === "active"))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.title.localeCompare(b.title));
}

export function createContractTemplate(
  agencyId: string,
  input: {
    title: unknown;
    summary?: unknown;
    body: unknown;
    sourceContractId?: unknown;
    creationOperationId?: unknown;
  },
  actorUserId: string,
): ClientContractTemplate {
  const title = clean(input.title, 180);
  const body = clean(input.body, 50_000);
  if (!title || !body) throw new Error("Template title and terms are required.");
  const summary = clean(input.summary, 2_000) || undefined;
  const sourceContractId = cleanId(input.sourceContractId, 120);
  const creationOperationId = cleanId(input.creationOperationId, 180);
  const stableId = creationOperationId
    ? `ctpl_${crypto.createHash("sha256").update(`${agencyId}\u0000${creationOperationId}`).digest("hex").slice(0, 24)}`
    : `ctpl_${crypto.randomBytes(8).toString("hex")}`;
  const existing = getState().contractTemplates[stableId]
    ?? (sourceContractId
      ? Object.values(getState().contractTemplates).find(template =>
          template.agencyId === agencyId && template.sourceContractId === sourceContractId)
      : undefined);
  if (existing) {
    if (
      existing.agencyId !== agencyId
      || existing.title !== title
      || existing.summary !== summary
      || existing.body !== body
      || (sourceContractId && existing.sourceContractId !== sourceContractId)
    ) {
      throw new Error("That template save was already used for different contract terms.");
    }
    return existing;
  }
  const now = Date.now();
  const template: ClientContractTemplate = {
    id: stableId,
    agencyId,
    sourceContractId: sourceContractId || undefined,
    creationOperationId: creationOperationId || undefined,
    title,
    summary,
    body,
    status: "active",
    source: "library",
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.contractTemplates[template.id] = template; });
  logActivity({
    idempotencyKey: creationOperationId ? `contract-template:${creationOperationId}` : undefined,
    agencyId,
    actorUserId,
    category: "finance",
    action: "contract.template_created",
    message: `Created contract template “${template.title}”.`,
    metadata: { templateId: template.id },
  });
  return template;
}

export function updateContractTemplate(
  agencyId: string,
  id: string,
  input: { title?: unknown; summary?: unknown; body?: unknown; status?: unknown },
  actorUserId: string,
): ClientContractTemplate | null {
  const current = getState().contractTemplates[id];
  if (!current || current.agencyId !== agencyId) return null;
  const updated: ClientContractTemplate = {
    ...current,
    title: input.title === undefined ? current.title : clean(input.title, 180) || current.title,
    summary: input.summary === undefined ? current.summary : clean(input.summary, 2_000) || undefined,
    body: input.body === undefined ? current.body : clean(input.body, 50_000) || current.body,
    status: input.status === "archived" ? "archived" : input.status === "active" ? "active" : current.status,
    updatedAt: Date.now(),
  };
  mutate(state => { state.contractTemplates[id] = updated; });
  logActivity({
    agencyId,
    actorUserId,
    category: "finance",
    action: "contract.template_updated",
    message: `Updated contract template “${updated.title}”.`,
    metadata: { templateId: id },
  });
  return updated;
}

export function deleteContractTemplate(agencyId: string, id: string, actorUserId: string): boolean {
  const current = getState().contractTemplates[id];
  if (!current || current.agencyId !== agencyId) return false;
  mutate(state => { delete state.contractTemplates[id]; });
  logActivity({
    agencyId,
    actorUserId,
    category: "finance",
    action: "contract.template_deleted",
    message: `Deleted contract template “${current.title}”.`,
    metadata: { templateId: id },
  });
  return true;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanId(value: unknown, max: number): string {
  const cleaned = clean(value, max);
  return cleaned && /^[a-zA-Z0-9._:-]+$/.test(cleaned) ? cleaned : "";
}
