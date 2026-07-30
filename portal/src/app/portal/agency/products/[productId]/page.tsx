import { notFound } from "next/navigation";

import { requireRole } from "@/lib/server/auth";
import { ensureDefaultAgencyProducts, getAgencyProduct, listAgencyProducts } from "@/server/agencyProducts";
import { listSops } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { ProductDetailWorkspace } from "./_ProductDetailWorkspace";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { listTradingCompanies, recordBelongsToCompany } from "@/server/tradingCompanies";

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  ensureDefaultAgencyProducts(session.agencyId);
  const { productId } = await params;
  const product = getAgencyProduct(session.agencyId, productId);
  const activeCompanyId = await getActiveTradingCompanyId(session.agencyId);
  if (!product || !recordBelongsToCompany(product.companyIds, activeCompanyId)) notFound();

  return (
    <ProductDetailWorkspace
      initialProduct={product}
      products={listAgencyProducts(session.agencyId, true)}
      sops={listSops(session.agencyId)}
      companies={listTradingCompanies(session.agencyId, true)}
    />
  );
}
