import { redirect } from "next/navigation";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES, type ClientPortalMode } from "@/server/types";
import { listClients } from "@/server/tenants";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { ensureProductPortalTemplates, ensureStunningPortalTemplate } from "@/server/clientPortalDesigns";
import { ClientPortalStudio, type PortalStudioClient, type PortalStudioTemplate } from "./_ClientPortalStudio";

export default async function ClientPortalEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; productId?: string; templateId?: string; scope?: string; mode?: string; section?: string }>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const query = await searchParams;
  ensureDefaultAgencyProducts(agencyId);
  const products = listAgencyProducts(agencyId, true).filter(product => product.portalRequirement !== "none");
  const masterTemplate = ensureStunningPortalTemplate(agencyId, session.userId);
  const productTemplates = ensureProductPortalTemplates(agencyId, products, session.userId);
  const templates: PortalStudioTemplate[] = [masterTemplate, ...productTemplates]
    .map(template => ({
      id: template.id,
      name: template.productId ? products.find(product => product.id === template.productId)?.name || template.name : "Master · Stunning Standard",
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
  const clients: PortalStudioClient[] = listClients(agencyId, { includeArchived: true })
    .map(client => ({
      id: client.id,
      name: client.name,
      built: typeof client.metadata?.portalBuiltAt === "number",
      mode: cleanMode(client.metadata?.portalMode),
    }))
    .sort((a, b) => Number(b.built) - Number(a.built) || a.name.localeCompare(b.name));
  const requestedClient = clients.find(client => client.id === query.clientId);
  const initialClientId = requestedClient?.id ?? clients.find(client => client.built)?.id ?? clients[0]?.id ?? "";

  return (
    <ClientPortalStudio
      clients={clients}
      templates={templates}
      initialClientId={initialClientId}
      initialTemplateId={initialTemplateId}
      initialScope={query.scope === "template" ? "template" : "client"}
      initialMode={cleanMode(query.mode ?? requestedClient?.mode)}
      initialSection={cleanSection(query.section)}
      canManage={session.role === "agency-owner" || session.role === "agency-manager"}
    />
  );
}

function cleanMode(value: unknown): ClientPortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

function cleanSection(value: unknown): "home" | "project" | "results" | "files" | "billing" | "support" | "resources" | "details" {
  return value === "project" || value === "results" || value === "files" || value === "billing" || value === "support" || value === "resources" || value === "details"
    ? value
    : "home";
}
