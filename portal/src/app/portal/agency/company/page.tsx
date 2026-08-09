import { requireRole } from "@/lib/server/auth";
import { buildCompanyHealthSnapshot } from "@/lib/server/companyHealthSnapshot";
import { listLegalDocuments } from "@/server/legalDocuments";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { CompanyWorkspace } from "./_CompanyWorkspace";
import { TradingCompaniesPanel } from "./_TradingCompaniesPanel";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { listAgencyProducts } from "@/server/agencyProducts";
import { listUsersForAgency } from "@/server/users";
import { calculateServiceBrandHealth } from "@/lib/companyHealth";

export default async function CompanyPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId);
  const companyHealth = await buildCompanyHealthSnapshot(session.agencyId);
  const profile = companyHealth.profile;
  const products = listAgencyProducts(session.agencyId, true);
  const users = listUsersForAgency(session.agencyId).filter(user => user.role.startsWith("agency-"));
  const companies = listTradingCompanies(session.agencyId, true).map(company => ({
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
  const canEdit = session.role === "agency-owner" || session.role === "agency-manager";
  return <>
    <TradingCompaniesPanel
      companies={companies}
      canEdit={canEdit}
      workspace={{
        clientCount: clients.length,
        productCount: products.length,
        staffCount: users.length,
        healthScore: companyHealth.health.overall,
      }}
    />
    <CompanyWorkspace
      initial={profile}
      companyName="AquaOasis-Web"
      actuals={companyHealth.actuals}
      canEdit={canEdit}
      legalDocuments={listLegalDocuments(session.agencyId)}
    />
  </>;
}
