import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { phaseLabel } from "@/server/phases";
import { getUserById } from "@/server/users";
import { getInstall, listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { PeopleHub, type ContactRole, type HubContact } from "./_PeopleHub";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { INTERNAL_WORKSPACE_NAME } from "@/lib/internalWorkspace";

// /portal/clients — agency-side client list. Client-* roles redirect
// straight to their own client portal (a list of "all clients" makes no
// sense for them).

export default async function ClientsList({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  const currentUser = getUserById(session.userId);
  const serviceBrands = listTradingCompanies(session.agencyId).filter(company => company.status !== "archived");
  const clients = listClients(session.agencyId);
  ensureDefaultAgencyProducts(session.agencyId);
  const products = listAgencyProducts(session.agencyId);
  const workspaceSettings = getAgencyWorkspaceSettings(session.agencyId);
  const leadsInstall = getInstall({ agencyId: agency.id }, "leads-pipeline");
  let contacts: HubContact[] = [];
  if (leadsInstall) {
    ensureLeadsPipelineFoundationRegistered();
    const leadsContainer = containerFor({
      agencyId: agency.id,
      storage: makePluginStorage(leadsInstall.id) as never,
    });
    const [contactRows, leadRows] = await Promise.all([
      leadsContainer.contacts.list(),
      leadsContainer.leads.list(),
    ]);
    const contactEmails = new Set(contactRows.map(contact => contact.email.toLowerCase()));
    contacts = [
      ...contactRows.map(contact => ({
        id: contact.id,
        email: contact.email,
        name: contact.name,
        phone: contact.phone,
        company: contact.company,
        tags: contact.tags,
        type: contact.type as ContactRole,
        source: contact.source,
        notes: contact.notes,
        recordKind: "contact" as const,
      })),
      ...leadRows
        .filter(lead => !contactEmails.has(lead.email.toLowerCase()))
        .map(lead => ({
          id: lead.id,
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
          company: lead.company,
          tags: lead.tags,
          type: "lead" as const,
          source: lead.source,
          notes: lead.notes,
          recordKind: "lead" as const,
        })),
    ];
  }
  const requestedView = (await searchParams).view;
  const initialView = requestedView === "contacts" || requestedView === "staff" || requestedView === "health" || requestedView === "all" ? requestedView : "clients";
  const installs = listInstalledFor({ agencyId: agency.id });
  const eff = effectiveRole(session);
  const panels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
  });
  const currentPath = "/portal/clients";

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar
          panels={panels}
          tenantLabel={INTERNAL_WORKSPACE_NAME}
          currentPath={currentPath}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            title={INTERNAL_WORKSPACE_NAME}
            subtitle="Clients & contacts"
            role={session.role}
            email={session.email}
            name={currentUser?.name}
            avatarUrl={currentUser?.avatarUrl}
            panels={panels}
            tenantLabel={INTERNAL_WORKSPACE_NAME}
            currentPath={currentPath}
            isDemo={session.isDemo}
            showcaseMode={Boolean(session.showcaseReturnAgencyId)}
            privacyTerms={[
              ...clients.flatMap(client => [client.name, client.ownerEmail ?? ""]),
              ...contacts.flatMap(contact => [contact.name ?? "", contact.email, contact.phone ?? "", contact.company ?? ""]),
            ]}
            notifications={<NotificationBell agencyId={agency.id} actor={session.userId} />}
          />
          <main id="main-content" className="mm-private-surface min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label="clients index">
              <PeopleHub
                initialView={initialView}
                clientDefaults={workspaceSettings}
                brands={serviceBrands.map(company => ({
                  id: company.id,
                  name: company.name,
                  primaryColor: company.brand.primaryColor,
                }))}
                products={products.map(product => ({
                  id: product.id, kind: product.kind, name: product.name, category: product.category,
                  description: product.description ?? "", deliverables: product.deliverables,
                  buyerHeadline: product.buyerHeadline, coverImageUrl: product.coverImageUrl,
                  accentColor: product.accentColor, portalRequirement: product.portalRequirement,
                  portalHeadline: product.portalHeadline, portalWelcomeNote: product.portalWelcomeNote,
                  includedProductIds: product.includedProductIds, welcomePackItems: product.welcomePackItems,
                  welcomePackNotes: product.welcomePackNotes, pricing: product.pricing,
                  priceCents: product.priceCents, billingInterval: product.billingInterval,
                  depositPercent: product.depositPercent, taxRatePercent: product.taxRatePercent,
                  paymentTermsDays: product.paymentTermsDays, billingNotes: product.billingNotes,
                  internalInfo: product.internalInfo, contractTitle: product.contractTitle,
                  contractBody: product.contractBody, sopIds: product.sopIds,
                  sopCategories: product.sopCategories, companyIds: product.companyIds,
                }))}
                clients={clients.map(client => {
                  const metadata = client.metadata as { leadSource?: string; lastContactedAt?: number; products?: unknown[]; niche?: string; customFields?: Record<string, unknown> } | undefined;
                  const healthNotes = [
                    !client.ownerEmail ? "Account email missing" : null,
                    !metadata?.leadSource ? "Acquisition source missing" : null,
                    metadata?.lastContactedAt && Date.now() - metadata.lastContactedAt > 1000 * 60 * 60 * 24 * 14 ? "No contact in 14+ days" : null,
                  ].filter((note): note is string => Boolean(note));
                  return {
                  id: client.id,
                  name: client.name,
                  ownerEmail: client.ownerEmail,
                  websiteUrl: client.websiteUrl,
                  stageLabel: phaseLabel(client.stage),
                  status: client.status,
                  primaryColor: client.brand.primaryColor,
                  source: metadata?.leadSource ?? "Unknown",
                  niche: metadata?.niche ?? (typeof metadata?.customFields?.niche === "string" ? metadata.customFields.niche : undefined),
                  lastContactedAt: metadata?.lastContactedAt,
                  health: healthNotes.length ? "attention" as const : "healthy" as const,
                  healthNotes,
                };})}
                contacts={contacts}
              />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
