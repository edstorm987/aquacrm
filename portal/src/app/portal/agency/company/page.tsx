import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server/auth/auth";
import { buildCompanyHealthSnapshot } from "@/engines/data/server/kpi/companyHealthSnapshot";
import { listLegalDocuments } from "@/server/legalDocuments";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { CompanyWorkspace } from "./_CompanyWorkspace";
import { TradingCompaniesPanel } from "./_TradingCompaniesPanel";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { listSops } from "@/engines/sop/server/sops";
import { listUsersForAgency } from "@/server/users";
import { calculateServiceBrandHealth } from "@/lib/performance/companyHealth";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { INTEGRATION_CATALOG, type IntegrationProvider } from "@/lib/integrations/catalog";
import { getPortalFormFields } from "@/server/portalEditor";

type CompanyPageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CompanyPage({ searchParams }: { searchParams: CompanyPageSearchParams }) {
  await ensureHydrated();
  const query = await searchParams;
  const requestedView = singleValue(query.view);
  if (requestedView === "products") redirect("/portal/agency/fulfilment?view=services");
  const requestedIntegration = integrationProvider(singleValue(query.integration));
  const specialistView = requestedView === "connections" || requestedView === "products" || requestedView === "legal" || requestedView === "companies";
  if (!specialistView) {
    const battle = requestedView === "direction" ? "strategy"
      : requestedView === "capacity" ? "capacity"
        : requestedView === "plans" ? "plans"
          : requestedView === "reviews" ? "reviews"
            : requestedView === "objectives" ? "objectives"
              : requestedView === "projections" ? "projections"
                : "overview";
    redirect(`/portal/agency?station=battle&battle=${battle}`);
  }
  const initialView = requestedView === "connections" ? "connections" : requestedView === "products" ? "products" : requestedView === "legal" ? "legal" : undefined;
  const showCompaniesGrid = requestedView === "companies";
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId);
  const companyHealth = await buildCompanyHealthSnapshot(session.agencyId);
  const profile = companyHealth.profile;
  const canEdit = !session.publicShowcase
    && (session.role === "agency-owner" || session.role === "agency-manager");
  if (canEdit) ensureDefaultAgencyProducts(session.agencyId);
  const products = listAgencyProducts(session.agencyId, true);
  const users = listUsersForAgency(session.agencyId).filter(user => user.role.startsWith("agency-"));
  const tradingCompanies = listTradingCompanies(session.agencyId, true);
  const companies = tradingCompanies.map(company => ({
    company,
    companyClients: clients.filter(client => client.companyId === company.id),
    productCount: products.filter(product => product.companyIds?.includes(company.id)).length,
    staffCount: users.filter(user => user.companyIds?.includes(company.id)).length,
  })).map(({ company, companyClients, productCount, staffCount }) => ({
    ...company,
    clientCount: companyClients.length,
    productCount,
    staffCount,
    healthScore: calculateServiceBrandHealth({
      status: company.status,
      hasWebsite: Boolean(company.website),
      hasDescription: Boolean(company.description),
      clientCount: companyClients.length,
      activeClientCount: companyClients.filter(client => client.status === "active").length,
      productCount,
      staffCount,
    }).overall,
  }));
  const settings = getAgencyWorkspaceSettings(session.agencyId);
  return <>
    {showCompaniesGrid ? (
      <TradingCompaniesPanel
        companies={companies}
        canEdit={canEdit}
        workspace={{
          clientCount: clients.length,
          productCount: products.length,
          staffCount: users.length,
          healthScore: companyHealth.health.overall,
          website: settings.website,
        }}
      />
    ) : null}
    {!showCompaniesGrid ? (
      <CompanyWorkspace
        initial={profile}
        companyName={session.publicShowcase ? "Showcase company" : "AquaOasis-Web"}
        actuals={companyHealth.actuals}
        staffCount={users.length}
        canEdit={canEdit}
        legalDocuments={listLegalDocuments(session.agencyId)}
        initialProducts={products}
        sops={listSops(session.agencyId)}
        tradingCompanies={tradingCompanies}
        serviceBrands={companies}
        productDefaults={{ taxRatePercent: settings.defaultTaxRatePercent, paymentTermsDays: settings.defaultPaymentTermsDays }}
        productCustomFields={getPortalFormFields(session.agencyId, "products")}
        clients={clients.map(client => ({ id: client.id, name: client.name }))}
        workspaceWebsite={settings.website}
        initialView={initialView}
        initialIntegration={requestedIntegration}
      />
    ) : null}
  </>;
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function integrationProvider(value: string | undefined): IntegrationProvider | undefined {
  return INTEGRATION_CATALOG.some(item => item.id === value) ? value as IntegrationProvider : undefined;
}
