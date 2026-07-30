import { requireRole } from "@/lib/server/auth";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { listSops } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { ProductsWorkspace } from "./_ProductsWorkspace";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { listTradingCompanies, recordBelongsToCompany } from "@/server/tradingCompanies";

export default async function ProductsPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  ensureDefaultAgencyProducts(session.agencyId);
  const activeCompanyId = await getActiveTradingCompanyId(session.agencyId);
  const settings = getAgencyWorkspaceSettings(session.agencyId);
  return <ProductsWorkspace
    initialProducts={listAgencyProducts(session.agencyId, true).filter(product => recordBelongsToCompany(product.companyIds, activeCompanyId))}
    sops={listSops(session.agencyId)}
    companies={listTradingCompanies(session.agencyId, true)}
    activeCompanyId={activeCompanyId}
    defaults={{ taxRatePercent: settings.defaultTaxRatePercent, paymentTermsDays: settings.defaultPaymentTermsDays }}
  />;
}
