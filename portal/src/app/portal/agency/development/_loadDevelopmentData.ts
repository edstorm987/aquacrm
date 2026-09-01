import "server-only";

import { requireRole } from "@/lib/server/auth/auth";
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
  const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
  // NO SEED OR MIGRATION HERE (issue #21, 2026-08-27).
  //
  // This called `ensureDefaultDevelopmentWorkflow(...)` and DISCARDED the
  // result — it was here purely for the side effect, which both creates the
  // default workflow and runs `migrateLegacyStageRefs`, a data migration, while
  // rendering. The seed moved to `bootstrapAgency`; the migration is
  // self-extinguishing and still runs from the write paths.
  const visible = listVisibleDevelopmentResourcesWithPendingDeletion(session.agencyId, session.userId, session.role);
  const resources = mode === "vault"
    ? visible.filter(resource => ["course", "knowledge", "credential", "sop"].includes(resource.kind))
    : mode === "toolkit"
      ? visible.filter(resource => !["course", "knowledge", "credential", "sop"].includes(resource.kind))
      : visible;
  return {
    role: session.role,
    resources: (mode === "workflow" ? resources : resources.slice(0, 36)).map(publicDevelopmentResource),
    total: resources.length,
    categories: [...new Set(resources.map(resource => resource.category).filter((value): value is string => Boolean(value)))].sort(),
    workflows: listDevelopmentWorkflows(session.agencyId),
    sops: listSops(session.agencyId).map(sop => ({ id: sop.id, title: sop.title, category: sop.category })),
  };
}
