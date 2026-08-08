import { requireRole } from "@/lib/server/auth";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { listSops } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { ProductsWorkspace } from "./_ProductsWorkspace";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listTradingCompanies } from "@/server/tradingCompanies";

export default async function ProductsPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  ensureDefaultAgencyProducts(session.agencyId);
  const settings = getAgencyWorkspaceSettings(session.agencyId);
  return <ProductsWorkspace
    initialProducts={listAgencyProducts(session.agencyId, true)}
    sops={listSops(session.agencyId)}
    companies={listTradingCompanies(session.agencyId, true)}
    defaults={{ taxRatePercent: settings.defaultTaxRatePercent, paymentTermsDays: settings.defaultPaymentTermsDays }}
  />;
}
