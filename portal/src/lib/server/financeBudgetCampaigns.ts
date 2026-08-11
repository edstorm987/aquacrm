import "server-only";

import type { CampaignBudgetRecord } from "@/built-ins/modules/agency-finance/src/lib/budgetHealth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";

const CAMPAIGN_INDEX_KEY = "campaigns/index";

export async function listAgencyCampaignBudgetRecords(agencyId: string): Promise<CampaignBudgetRecord[]> {
  const install = getInstall({ agencyId }, "leads-pipeline");
  if (!install?.enabled) return [];
  const storage = makePluginStorage(install.id);
  const ids = (await storage.get<string[]>(CAMPAIGN_INDEX_KEY)) ?? [];
  const rows = await Promise.all(ids.map(id => storage.get<CampaignBudgetRecord>(`campaign:${id}`)));
  return rows.filter((row): row is CampaignBudgetRecord => Boolean(row));
}
