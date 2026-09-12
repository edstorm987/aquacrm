import { SalesProspectWorkspacePage } from "@/app/portal/agency/_SalesProspectWorkspacePage";

export const dynamic = "force-dynamic";

export default async function AgencyResearchingPage({
  searchParams,
}: {
  searchParams: Promise<{ prospect?: string | string[]; lead?: string | string[] }>;
}) {
  const resolved = await searchParams;
  const raw = resolved.prospect;
  const focusedProspectId = typeof raw === "string" ? raw.slice(0, 160) : undefined;
  const focusedLeadId = typeof resolved.lead === "string" ? resolved.lead.slice(0, 160) : undefined;
  return <SalesProspectWorkspacePage workspaceMode="researching" focusedProspectId={focusedProspectId} focusedLeadId={focusedLeadId} />;
}
