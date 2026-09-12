import { SalesProspectWorkspacePage } from "@/app/portal/agency/_SalesProspectWorkspacePage";

export const dynamic = "force-dynamic";

export default async function AgencyProspectingPage({
  searchParams,
}: {
  searchParams: Promise<{ prospect?: string | string[]; lead?: string | string[]; mode?: string | string[] }>;
}) {
  const resolved = await searchParams;
  const raw = resolved.prospect;
  const focusedProspectId = typeof raw === "string" ? raw.slice(0, 160) : undefined;
  const focusedLeadId = typeof resolved.lead === "string" ? resolved.lead.slice(0, 160) : undefined;
  const initialOutreachView = resolved.mode === "email" || resolved.mode === "pipeline" || resolved.mode === "power-dialler"
    ? resolved.mode
    : undefined;
  return <SalesProspectWorkspacePage workspaceMode="prospecting" focusedProspectId={focusedProspectId} focusedLeadId={focusedLeadId} initialOutreachView={initialOutreachView} />;
}
