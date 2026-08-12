import { requireRole } from "@/lib/server/auth";
import { getCachedBusinessIssueRadar } from "@/lib/server/businessIssueRadar";
import { inspectRadarEvidence } from "@/lib/server/radarEvidenceVault";
import { ensureHydrated } from "@/server/storage";
import { RadarInspectionWorkspace } from "./RadarInspectionWorkspace";

const INSPECTION_VIEWS = ["checks", "evidence", "records", "sources", "incidents", "raw"] as const;

export default async function RadarInspectionPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager"]);
  const requestedView = (await searchParams).view;
  const initialTab = INSPECTION_VIEWS.find(view => view === requestedView) ?? "records";
  const radar = await getCachedBusinessIssueRadar(session.agencyId);
  const evidence = inspectRadarEvidence(session.agencyId);
  return <RadarInspectionWorkspace initialRadar={radar} initialEvidence={evidence} initialTab={initialTab} />;
}
