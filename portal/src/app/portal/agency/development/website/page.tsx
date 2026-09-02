import { requireCurrentFulfilmentTechnicalAccess } from "@/lib/server/access/fulfilmentTechnicalAccess";
import { agencyWebsiteForRead, summarizeAgencyWebsite } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { DevelopmentNav } from "../_DevelopmentNav";
import { WebsiteWorkspace } from "./_WebsiteWorkspace";

export default async function WebsiteDevelopmentPage() {
  await ensureHydrated();
  const { actor } = await requireCurrentFulfilmentTechnicalAccess("view");
  const session = actor.session;
  const website = agencyWebsiteForRead(actor.resourceAgencyId);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <DevelopmentNav active="website" />
      <WebsiteWorkspace
        initialWebsite={website}
        initialSummary={summarizeAgencyWebsite(website)}
        canManage={session.role === "agency-owner" || session.role === "agency-manager"}
      />
    </div>
  );
}
