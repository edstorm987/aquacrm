import "server-only";

import type { Client } from "./types";
import {
  createClient,
  getClientForAgency,
  listClients,
  updateClient,
  type CreateClientInput,
} from "./tenants";

export interface CreateLinkedClientWorkspaceInput {
  sourceClientId: string;
  name: string;
  workspaceLabel?: string;
  websiteUrl?: string;
  companyId?: string;
  carryContact?: boolean;
  carryServices?: boolean;
  selectedProductIds?: string[];
  stage?: Client["stage"];
}

export function clientRelationshipId(client: Client): string {
  return client.relationshipId?.trim() || client.id;
}

export function listClientRelationshipWorkspaces(
  agencyId: string,
  clientId: string,
  options: { includeArchived?: boolean } = {},
): Client[] {
  const current = getClientForAgency(agencyId, clientId);
  if (!current) return [];
  const relationshipId = clientRelationshipId(current);
  return listClients(agencyId, options)
    .filter(candidate => clientRelationshipId(candidate) === relationshipId)
    .sort((a, b) => Number(a.id !== clientId) - Number(b.id !== clientId)
      || (a.workspaceLabel || a.name).localeCompare(b.workspaceLabel || b.name));
}

export function prepareLinkedClientWorkspaceCreation(
  agencyId: string,
  input: CreateLinkedClientWorkspaceInput,
): CreateClientInput & { stage: Client["stage"] } {
  const source = getClientForAgency(agencyId, input.sourceClientId);
  if (!source) throw new Error("Source client workspace was not found.");
  const name = input.name.trim().slice(0, 160);
  if (!name) throw new Error("A workspace or company name is required.");

  const sourceMeta = source.metadata ?? {};
  const relationshipId = clientRelationshipId(source);
  if (source.relationshipId !== relationshipId) {
    updateClient(agencyId, source.id, { relationshipId });
  }

  const metadata: Record<string, unknown> = {
    relationshipSourceClientId: source.id,
    relationshipWorkspaceCreatedAt: Date.now(),
  };
  if (input.carryContact !== false) {
    for (const key of ["clientEmail", "phone", "contactPhone", "portalLoginEmail", "portalContactName", "linkedContacts", "clientEntityType"] as const) {
      if (sourceMeta[key] !== undefined) metadata[key] = sourceMeta[key];
    }
  }
  if (Array.isArray(input.selectedProductIds)) {
    metadata.portalSelectedProductIds = [...new Set(input.selectedProductIds.map(value => value.trim()).filter(Boolean))].slice(0, 48);
  } else if (input.carryServices === true) {
    for (const key of ["selectedProductIds", "productIds", "portalSelectedProductIds", "portalProductIds"] as const) {
      if (sourceMeta[key] !== undefined) metadata[key] = sourceMeta[key];
    }
  }

  return {
    name,
    relationshipId,
    workspaceLabel: input.workspaceLabel?.trim().slice(0, 120) || undefined,
    ownerEmail: input.carryContact === false ? undefined : source.ownerEmail,
    websiteUrl: input.websiteUrl?.trim() || undefined,
    companyId: input.companyId?.trim() || source.companyId,
    stage: input.stage ?? source.stage,
    metadata,
  };
}

export function createLinkedClientWorkspace(
  agencyId: string,
  input: CreateLinkedClientWorkspaceInput,
): Client {
  return createClient(agencyId, prepareLinkedClientWorkspaceCreation(agencyId, input));
}

export function linkClientWorkspaces(agencyId: string, sourceClientId: string, targetClientId: string): Client[] {
  const source = getClientForAgency(agencyId, sourceClientId);
  const target = getClientForAgency(agencyId, targetClientId);
  if (!source || !target) throw new Error("Both client workspaces must belong to this agency.");
  const sourceRelationshipId = clientRelationshipId(source);
  const targetRelationshipId = clientRelationshipId(target);
  const updated: Client[] = [];

  for (const candidate of listClients(agencyId, { includeArchived: true })) {
    const candidateRelationshipId = clientRelationshipId(candidate);
    if (candidateRelationshipId !== sourceRelationshipId && candidateRelationshipId !== targetRelationshipId) continue;
    const saved = updateClient(agencyId, candidate.id, { relationshipId: sourceRelationshipId });
    if (saved) updated.push(saved);
  }
  return updated;
}

export function unlinkClientWorkspace(agencyId: string, clientId: string, remainingClientId?: string): Client | null {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  const relationshipId = clientRelationshipId(client);
  const group = listClients(agencyId, { includeArchived: true })
    .filter(candidate => clientRelationshipId(candidate) === relationshipId);
  if (relationshipId === client.id && group.length > 1) {
    const replacement = group.find(candidate => candidate.id === remainingClientId && candidate.id !== client.id)
      ?? group.find(candidate => candidate.id !== client.id);
    if (replacement) {
      for (const sibling of group) {
        if (sibling.id !== client.id) updateClient(agencyId, sibling.id, { relationshipId: replacement.id });
      }
    }
  }
  return updateClient(agencyId, clientId, { relationshipId: client.id });
}

export function clientPortalAccessEmail(client: Client): string {
  const metadata = client.metadata ?? {};
  const candidate = metadata.portalLoginEmail ?? metadata.clientEmail ?? client.ownerEmail;
  return typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
}

export function listAccessibleClientPortals(agencyId: string, clientId: string, email: string): Client[] {
  const normalisedEmail = email.trim().toLowerCase();
  if (!normalisedEmail) return [];
  return listClientRelationshipWorkspaces(agencyId, clientId)
    .filter(client => client.status === "active" || client.status === "suspended")
    .filter(client => typeof client.metadata?.portalBuiltAt === "number")
    .filter(client => clientPortalAccessEmail(client) === normalisedEmail);
}
