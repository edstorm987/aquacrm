import "server-only";

import { cookies } from "next/headers";
import { getTradingCompany, listTradingCompanies } from "@/server/tradingCompanies";
import { getSession } from "@/lib/server/auth";
import { getUserById } from "@/server/users";

export const TRADING_COMPANY_COOKIE = "mm_company_context";

export async function getActiveTradingCompanyId(agencyId: string): Promise<string | null> {
  const companyId = (await cookies()).get(TRADING_COMPANY_COOKIE)?.value;
  const session = await getSession();
  const user = session?.agencyId === agencyId ? getUserById(session.userId) : null;
  const restrictedIds = user?.companyIds?.length ? user.companyIds : null;
  if (restrictedIds) {
    const allowed = listTradingCompanies(agencyId).filter(company => restrictedIds.includes(company.id));
    const requested = companyId && companyId !== "all"
      ? allowed.find(company => company.id === companyId)
      : null;
    return requested?.id ?? allowed[0]?.id ?? null;
  }
  if (!companyId || companyId === "all") return null;
  const company = getTradingCompany(agencyId, companyId);
  return company?.status === "active" ? company.id : null;
}
