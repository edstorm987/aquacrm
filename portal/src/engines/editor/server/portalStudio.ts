import "server-only";

import { agencyProductsForRead, listAgencyProducts } from "@/server/agencyProducts";
import { ensureProductPortalTemplates, ensureStunningPortalTemplate } from "@/server/clientPortalDesigns";
import { listClients } from "@/server/tenants";
import type { ClientPortalMode, Role } from "@/server/types";
import type {
  PortalStudioClient,
  PortalStudioTemplate,
} from "@/engines/editor/DevEditor";

// ─── Dev Editor Engine — the studio's server loader ──────────────────────────
//
// The Portal Studio IS the engine's UI: a live canvas over the real portal, a
// depth selector (just-tell-it / visual-builder / developer) and the Builder,
// Content, Pages, Brand, Code, Repo and Versions inspectors. It was reachable
// from exactly one route, so the Dev Team "Editor" mounted a stripped,
// read-only file browser instead and looked like a third of the engine.
//
// This module is that route's loader, lifted out so ANY surface can mount the
// same studio with the same data. Nothing here is new behaviour — it is the
// existing loader, moved, so the two callers cannot drift.

export type PortalStudioSection =
  | "home" | "project" | "results" | "files" | "billing" | "support" | "resources" | "details";

export interface PortalStudioQuery {
  clientId?: string;
  productId?: string;
  templateId?: string;
  scope?: string;
  mode?: string;
  section?: string;
  context?: string;
}

export interface PortalStudioProps {
  clients: PortalStudioClient[];
  templates: PortalStudioTemplate[];
  initialClientId: string;
  initialTemplateId: string;
  initialScope: "template" | "client";
  initialMode: ClientPortalMode;
  initialSection: PortalStudioSection;
  canManage: boolean;
  /** True when the caller pinned the studio to one client (no client switching). */
  lockToClient: boolean;
}

import { SAMPLE_CLIENT_NAME, sampleClientId } from "@/lib/server/clients/samplePreviewClient";

export function cleanPortalMode(value: unknown): ClientPortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

export function cleanPortalSection(value: unknown): PortalStudioSection {
  return value === "project" || value === "results" || value === "files" || value === "billing"
    || value === "support" || value === "resources" || value === "details"
    ? value
    : "home";
}

/**
 * Everything the studio needs to mount, for one agency.
 *
 * `lockToClient` stays opt-in via `query.context`: "client-workspace" pins the
 * studio to the client you came from. Other contexts (e.g. the Dev Team
 * editor) leave the client switcher available.
 */
export function loadPortalStudioProps(input: {
  agencyId: string;
  userId: string;
  role: Role;
  query: PortalStudioQuery;
}): PortalStudioProps {
  const { agencyId, userId, role, query } = input;

  agencyProductsForRead(agencyId);
  const products = listAgencyProducts(agencyId, true).filter(product => product.portalRequirement !== "none");
  const masterTemplate = ensureStunningPortalTemplate(agencyId, userId);
  const productTemplates = ensureProductPortalTemplates(agencyId, products, userId);

  const templates: PortalStudioTemplate[] = [masterTemplate, ...productTemplates].map(template => ({
    id: template.id,
    name: template.productId
      ? products.find(product => product.id === template.productId)?.name || template.name
      : "Master · Stunning Standard",
    productId: template.productId,
    baseTemplateVersionId: template.baseTemplateVersionId,
    latestMasterVersionId: masterTemplate.publishedVersionId,
    active: template.productId ? products.find(product => product.id === template.productId)?.active !== false : true,
  }));

  const requestedProductTemplate = query.productId
    ? templates.find(template => template.productId === query.productId)
    : undefined;
  const initialTemplateId = templates.some(template => template.id === query.templateId)
    ? query.templateId!
    : requestedProductTemplate?.id ?? masterTemplate.id;

  const realClients: PortalStudioClient[] = listClients(agencyId, { includeArchived: true })
    .map(client => ({
      id: client.id,
      name: client.name,
      built: typeof client.metadata?.portalBuiltAt === "number",
      mode: cleanPortalMode(client.metadata?.portalMode),
    }))
    .sort((a, b) => Number(b.built) - Number(a.built) || a.name.localeCompare(b.name));

  // The stand-in is ALWAYS offered, and always last.
  //
  // A template — a product portal especially — belongs to a product rather than
  // to any client, so drafting one must not wait on a real client existing. With
  // no clients at all the editor used to refuse to open (Ed, 2026-08-27); with
  // clients, the sample is still the honest thing to draft a template against,
  // because previewing a template through a real client shows THEIR data.
  //
  // Nothing is created for it — see samplePreviewClient.ts.
  const clients: PortalStudioClient[] = [
    ...realClients,
    { id: sampleClientId(agencyId), name: SAMPLE_CLIENT_NAME, built: false, mode: "designing" as const },
  ];

  const requestedClient = clients.find(client => client.id === query.clientId);
  // A built client is still the best default when one exists — the sample is a
  // floor, not a preference.
  const initialClientId = requestedClient?.id
    ?? realClients.find(client => client.built)?.id
    ?? realClients[0]?.id
    ?? sampleClientId(agencyId);

  return {
    clients,
    templates,
    initialClientId,
    initialTemplateId,
    initialScope: query.scope === "template" ? "template" : "client",
    initialMode: cleanPortalMode(query.mode ?? requestedClient?.mode),
    initialSection: cleanPortalSection(query.section),
    canManage: role === "agency-owner" || role === "agency-manager",
    lockToClient: query.context === "client-workspace" && Boolean(requestedClient),
  };
}
