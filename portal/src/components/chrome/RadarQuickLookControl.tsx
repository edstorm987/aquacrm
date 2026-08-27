import "server-only";

import { RadarQuickLookButton } from "@/components/chrome/RadarQuickLookButton";
import { radarDigest } from "@/engines/data/radar/businessRadar";
import { buildPausedBusinessRadar } from "@/app/portal/agency/commandPerformance";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";

export async function RadarQuickLookControl({ agencyId, lightweight = false }: { agencyId: string; lightweight?: boolean }) {
  const radar = lightweight
    ? buildPausedBusinessRadar(getAgencyWorkspaceSettings(agencyId).advisor.radarPolicy, Date.now())
    : await import("@/engines/data/server/radar/businessIssueRadar")
        .then(({ getCachedBusinessIssueRadar }) => getCachedBusinessIssueRadar(agencyId));
  return <RadarQuickLookButton initialRadar={radarDigest(radar)} paused={lightweight} />;
}
