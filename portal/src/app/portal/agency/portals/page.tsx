import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { listClients } from "@/server/tenants";
import { phaseLabel } from "@/server/phases";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { PortalsWorkspace, type PortalTemplateProductRecord, type PortalWorkspaceRecord } from "./_PortalsWorkspace";

type PortalMode = PortalWorkspaceRecord["portalMode"];

export default async function PortalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const companies = new Map(listTradingCompanies(agencyId).map(company => [company.id, company.name]));
  const clients = listClients(agencyId, { includeArchived: true });
  const requestedView = (await searchParams).view;
  if (requestedView === "editor") redirect("/portal/agency/portals/editor");
  ensureDefaultAgencyProducts(agencyId);
  const products: PortalTemplateProductRecord[] = listAgencyProducts(agencyId, true).map(product => ({
    id: product.id,
    name: product.name,
    active: product.active,
    portalRequirement: product.portalRequirement,
    portalTemplateKey: product.portalTemplateKey,
    portalHeadline: product.portalHeadline,
    portalWelcomeNote: product.portalWelcomeNote,
    portalStageFocus: product.portalStageFocus,
    portalSupportCta: product.portalSupportCta,
    accentColor: product.accentColor,
    deliverables: product.deliverables,
  }));

  const portals: PortalWorkspaceRecord[] = clients.map(client => {
    const metadata = client.metadata ?? {};
    return {
      id: client.id,
      name: client.name,
      ownerEmail: client.ownerEmail,
      status: client.status,
      stageLabel: phaseLabel(client.stage),
      companyName: client.companyId ? companies.get(client.companyId) : undefined,
      accentColor: cleanColor(typeof metadata.portalAccentColor === "string" ? metadata.portalAccentColor : client.brand.primaryColor),
      portalBuiltAt: numberValue(metadata.portalBuiltAt),
      portalUpdatedAt: numberValue(metadata.portalAccessUpdatedAt),
      portalAccessSentAt: numberValue(metadata.portalAccessSentAt),
      portalAccessPreparedAt: numberValue(metadata.portalAccessPreparedAt),
      portalLoginEmail: stringValue(metadata.portalLoginEmail),
      portalMode: cleanMode(metadata.portalMode),
      portalServicePlan: stringValue(metadata.portalServicePlan),
    };
  });

  return (
    <PortalsWorkspace
      portals={portals}
      products={products}
      initialView={requestedView === "templates" ? "templates" : "library"}
      canManage={session.role === "agency-owner" || session.role === "agency-manager"}
    />
  );
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanMode(value: unknown): PortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

function cleanColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#166f73";
}
