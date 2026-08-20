import "server-only";

import { ClientRadarQuickLookButton } from "@/components/chrome/ClientRadarQuickLookButton";
import { buildClientRadar } from "@/lib/server/radar/clientRadarService";

export async function ClientRadarQuickLookControl({ agencyId, clientId }: { agencyId: string; clientId: string }) {
  const radar = await buildClientRadar(agencyId, clientId);
  if (!radar) return null;
  return <ClientRadarQuickLookButton initialRadar={radar} />;
}
