import { notFound } from "next/navigation";

import { requireRole } from "@/lib/server/auth";
import { isGitHubPublishingConfiguredForAgency } from "@/lib/server/githubProjectPublisher";
import { getFirstPartyDevelopmentProject } from "@/lib/firstPartyDevelopmentProjects";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { DevelopmentNav } from "../../_DevelopmentNav";
import { FirstPartyProjectWorkspace } from "./_FirstPartyProjectWorkspace";

export default async function FirstPartyDevelopmentProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const project = getFirstPartyDevelopmentProject((await params).projectId);
  if (!project) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-7">
      <DevelopmentNav active="systems" />
      <FirstPartyProjectWorkspace
        project={project}
        githubWriteConfigured={isGitHubPublishingConfiguredForAgency(session.agencyId)}
      />
    </div>
  );
}
