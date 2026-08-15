import "server-only";

import type { Client, TradingCompany } from "@/server/types";
import { getTradingCompany } from "@/server/tradingCompanies";

export interface ClientPortalProviderIdentity {
  company: TradingCompany | null;
  name: string;
  mark: string;
}

export function resolveClientPortalProvider(
  client: Client,
  fallback: { name: string; mark?: string } = { name: "AquaOasis-Web", mark: "A" },
): ClientPortalProviderIdentity {
  const company = client.companyId ? getTradingCompany(client.agencyId, client.companyId) : null;
  const name = company?.name?.trim() || fallback.name.trim() || "AquaOasis-Web";
  const mark = company
    ? company.name.trim().charAt(0).toUpperCase() || "A"
    : fallback.mark?.trim().charAt(0).toUpperCase() || name.charAt(0).toUpperCase() || "A";
  return { company, name, mark };
}
