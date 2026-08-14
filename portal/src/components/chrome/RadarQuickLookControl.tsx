import "server-only";

import { RadarQuickLookButton } from "@/components/chrome/RadarQuickLookButton";
import { radarDigest } from "@/lib/businessRadar";
import { getCachedBusinessIssueRadar } from "@/lib/server/businessIssueRadar";

export async function RadarQuickLookControl({ agencyId }: { agencyId: string }) {
  const radar = await getCachedBusinessIssueRadar(agencyId);
  return <RadarQuickLookButton initialRadar={radarDigest(radar)} />;
}
