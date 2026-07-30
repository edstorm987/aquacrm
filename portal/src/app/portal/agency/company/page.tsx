import { requireRole } from "@/lib/server/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { containerFor as financeContainerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { getCompanyProfile } from "@/server/company";
import { listLegalDocuments } from "@/server/legalDocuments";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { CompanyWorkspace } from "./_CompanyWorkspace";
import { TradingCompaniesPanel } from "./_TradingCompaniesPanel";
import { listTradingCompanies, recordBelongsToCompany } from "@/server/tradingCompanies";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { listAgencyProducts } from "@/server/agencyProducts";
import { listUsersForAgency } from "@/server/users";

export default async function CompanyPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId);
  const activeCompanyId = await getActiveTradingCompanyId(session.agencyId);
  const profile = getCompanyProfile(session.agencyId, activeCompanyId);
  const products = listAgencyProducts(session.agencyId, true);
  const users = listUsersForAgency(session.agencyId).filter(user => user.role.startsWith("agency-"));
  const companies = listTradingCompanies(session.agencyId, true).map(company => ({
    ...company,
    clientCount: clients.filter(client => client.companyId === company.id).length,
    productCount: products.filter(product => product.companyIds?.includes(company.id)).length,
    staffCount: users.filter(user => user.companyIds?.includes(company.id)).length,
  }));
  const activeCompany = activeCompanyId ? companies.find(company => company.id === activeCompanyId) ?? null : null;
  let monthRevenueCents = 0;
  let mrrCents = 0;
  let currency = "gbp";
  let leadCount = 0;
  let meetingsThisMonth = 0;
  let completedSalesCalls = 0;

  const financeInstall = getInstall({ agencyId: session.agencyId }, "agency-finance");
  if (financeInstall?.enabled) {
    try {
      ensureAgencyFinanceFoundationRegistered();
      const finance = financeContainerFor({
        agencyId: session.agencyId,
        storage: makePluginStorage(financeInstall.id) as never,
        install: financeInstall,
      });
      const snapshot = await finance.pnl.founderSnapshot(Date.now());
      monthRevenueCents = snapshot.trailingMonths.at(-1)?.revenueCents ?? 0;
      mrrCents = snapshot.mrrCents;
      currency = snapshot.currency;
    } catch {
      // Company remains usable while finance is being configured.
    }
  }

  const leadsInstall = getInstall({ agencyId: session.agencyId }, "leads-pipeline");
  if (leadsInstall?.enabled) {
    try {
      const leads = await leadsContainerFor({
        agencyId: session.agencyId,
        storage: makePluginStorage(leadsInstall.id) as never,
      }).leads.list();
      leadCount = leads.length;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      meetingsThisMonth = leads.filter(lead => lead.nextMeetingAt && lead.nextMeetingAt >= start && lead.nextMeetingAt < end).length;
      completedSalesCalls = leads.filter(lead =>
        lead.meetingStatus === "completed" &&
        (lead.nextMeetingAt ?? 0) >= start &&
        (lead.nextMeetingAt ?? 0) < end,
      ).length;
    } catch {
      // Sales metrics show zero until the leads workspace is ready.
    }
  }

  const canEdit = session.role === "agency-owner" || session.role === "agency-manager";
  return <>
    <TradingCompaniesPanel companies={companies} activeCompanyId={activeCompanyId} canEdit={canEdit} />
    <CompanyWorkspace
      initial={profile}
      companyName={activeCompany?.name ?? "Milesymedia"}
      actuals={{
        monthRevenueCents,
        mrrCents,
        currency,
        activeClients: clients.filter(client => client.status === "active" && (!activeCompanyId || !client.companyId || client.companyId === activeCompanyId)).length,
        leadCount,
        meetingsThisMonth,
        completedSalesCalls,
      }}
      canEdit={canEdit}
      legalDocuments={listLegalDocuments(session.agencyId).filter(document => recordBelongsToCompany(document.companyIds, activeCompanyId))}
    />
  </>;
}
