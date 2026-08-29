import { requireRole } from "@/lib/server/auth/auth";
import { agencyWebsiteForRead, summarizeAgencyWebsite } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { DevelopmentNav } from "../_DevelopmentNav";
import { WebsiteWorkspace } from "./_WebsiteWorkspace";

export default async function WebsiteDevelopmentPage() {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
  const website = agencyWebsiteForRead(session.agencyId);
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
