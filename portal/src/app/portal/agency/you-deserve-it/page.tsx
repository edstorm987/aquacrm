import { requireRole } from "@/lib/server/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import type { MarketingAsset } from "@/built-ins/modules/agency-marketing/src/lib/domain";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listClientDelight } from "@/server/clientDelight";
import { listExperiencePackages } from "@/server/experiencePackages";
import { getInstall } from "@/server/pluginInstalls";
import { phaseLabel } from "@/server/phases";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { listUsersForAgency } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";
import { YouDeserveItWorkspace } from "./_YouDeserveItWorkspace";

const MARKETING_ASSETS_KEY = "milesymedia/channel-assets/v1";
const MARKETING_PLUGIN = "agency-marketing";

export default async function YouDeserveItPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId).filter(client => client.status === "active");
  const companies = listTradingCompanies(session.agencyId, true).filter(company => company.status !== "archived");
  const staff = listUsersForAgency(session.agencyId).filter(user => user.role.startsWith("agency-"));
  const settings = getAgencyWorkspaceSettings(session.agencyId);
  const marketingInstall = getInstall({ agencyId: session.agencyId }, MARKETING_PLUGIN);
  const marketingAssets = marketingInstall
    ? (await makePluginStorage(marketingInstall.id).get<MarketingAsset[]>(MARKETING_ASSETS_KEY)) ?? []
    : [];

  return (
    <YouDeserveItWorkspace
      initialRecords={listClientDelight(session.agencyId)}
      initialPackages={listExperiencePackages(session.agencyId, true)}
      currency={settings.defaultCurrency || "GBP"}
      staff={staff.map(user => ({ id: user.id, name: user.name, email: user.email, companyIds: user.companyIds ?? [] }))}
      companies={companies.map(company => ({
        id: company.id,
        name: company.name,
        slug: company.slug,
        colour: company.brand.primaryColor,
      }))}
      reputationProfiles={marketingAssets
        .filter(asset => asset.kind === "reputation")
        .map(asset => ({
          id: asset.id,
          companyIds: asset.companyIds,
          name: asset.name,
          platform: asset.platform,
          rating: asset.rating,
          reviewCount: asset.reviewCount,
          unansweredReviews: asset.unansweredReviews,
          status: asset.status,
        }))}
      clients={clients.map(client => {
        const metadata = client.metadata as { leadSource?: string; lastContactedAt?: number; niche?: string; customFields?: Record<string, unknown> } | undefined;
        const healthNotes = [
          !client.ownerEmail ? "Account email missing" : null,
          !metadata?.leadSource ? "Acquisition source missing" : null,
          metadata?.lastContactedAt && Date.now() - metadata.lastContactedAt > 1000 * 60 * 60 * 24 * 14 ? "No contact in 14+ days" : null,
        ].filter((note): note is string => Boolean(note));
        return {
          id: client.id,
          name: client.name,
          companyId: client.companyId,
          stageLabel: phaseLabel(client.stage),
          source: metadata?.leadSource ?? "Unknown",
          health: healthNotes.length ? "attention" as const : "healthy" as const,
          healthNotes,
        };
      })}
    />
  );
}
