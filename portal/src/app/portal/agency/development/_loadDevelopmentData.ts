import "server-only";

import {
  FULFILMENT_TECHNICAL_ELEMENT_KEY,
  requireCurrentFulfilmentTechnicalAccess,
} from "@/lib/server/access/fulfilmentTechnicalAccess";
import { workspaceElementLevel } from "@/lib/server/access/workspaceElementAccess";
import {
  ensureDefaultDevelopmentWorkflow,
  listDevelopmentWorkflows,
  listVisibleDevelopmentResourcesWithPendingDeletion,
  publicDevelopmentResource,
} from "@/server/developmentToolkit";
import { listSops } from "@/engines/sop/server/sops";
import { ensureHydrated } from "@/server/storage";

export async function loadDevelopmentData(mode?: "toolkit" | "vault" | "workflow") {
  await ensureHydrated();
  const { actor, access } = await requireCurrentFulfilmentTechnicalAccess("view");
  const session = actor.session;
  const agencyId = actor.resourceAgencyId;
  // NO SEED OR MIGRATION HERE (issue #21, 2026-08-27).
  //
  // This called `ensureDefaultDevelopmentWorkflow(...)` and DISCARDED the
  // result — it was here purely for the side effect, which both creates the
  // default workflow and runs `migrateLegacyStageRefs`, a data migration, while
  // rendering. The seed moved to `bootstrapAgency`; the migration is
  // self-extinguishing and still runs from the write paths.
  const visible = listVisibleDevelopmentResourcesWithPendingDeletion(agencyId, session.userId, session.role);
  const resources = mode === "vault"
    ? visible.filter(resource => ["course", "knowledge", "credential", "sop"].includes(resource.kind))
    : mode === "toolkit"
      ? visible.filter(resource => !["course", "knowledge", "credential", "sop"].includes(resource.kind))
      : visible;
  return {
    technicalAccessLevel: workspaceElementLevel(access, FULFILMENT_TECHNICAL_ELEMENT_KEY),
    resources: (mode === "workflow" ? resources : resources.slice(0, 36)).map(publicDevelopmentResource),
    total: resources.length,
    categories: [...new Set(resources.map(resource => resource.category).filter((value): value is string => Boolean(value)))].sort(),
    workflows: listDevelopmentWorkflows(agencyId),
    sops: listSops(agencyId).map(sop => ({ id: sop.id, title: sop.title, category: sop.category })),
  };
}
