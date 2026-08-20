import "server-only";

import { RadarQuickLookButton } from "@/components/chrome/RadarQuickLookButton";
import { radarDigest } from "@/engines/data/radar/businessRadar";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";

export async function RadarQuickLookControl({ agencyId }: { agencyId: string }) {
  const radar = await getCachedBusinessIssueRadar(agencyId);
  return <RadarQuickLookButton initialRadar={radarDigest(radar)} />;
}
