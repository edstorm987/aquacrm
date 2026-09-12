import { SalesProspectWorkspacePage } from "@/app/portal/agency/_SalesProspectWorkspacePage";

export const dynamic = "force-dynamic";

/**
 * Scouting is the pre-lead Sales workspace. It deliberately reuses the same
 * ProspectService and qualification path as Journey: this route is a clearer
 * front door, not a second CRM or another source of truth.
 */
export default async function AgencyScoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string | string[] }>;
}) {
  const rawImport = (await searchParams).import;
  return <SalesProspectWorkspacePage workspaceMode="scouting" initialImportOpen={rawImport === "1"} />;
}
