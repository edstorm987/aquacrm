import { notFound } from "next/navigation";

import { requireCurrentFulfilmentTechnicalAccess } from "@/lib/server/access/fulfilmentTechnicalAccess";
import { isGitHubPublishingConfiguredForAgency } from "@/lib/server/integrations/githubProjectPublisher";
import { getFirstPartyDevelopmentProject } from "@/lib/projects/firstPartyDevelopmentProjects";
import { ensureHydrated } from "@/server/storage";
import { DevelopmentNav } from "../../_DevelopmentNav";
import { FirstPartyProjectWorkspace } from "./_FirstPartyProjectWorkspace";

export default async function FirstPartyDevelopmentProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await ensureHydrated();
  const { actor } = await requireCurrentFulfilmentTechnicalAccess("view");
  const project = getFirstPartyDevelopmentProject((await params).projectId);
  if (!project) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-7">
      <DevelopmentNav active="systems" />
      <FirstPartyProjectWorkspace
        project={project}
        githubWriteConfigured={isGitHubPublishingConfiguredForAgency(actor.resourceAgencyId)}
      />
    </div>
  );
}
