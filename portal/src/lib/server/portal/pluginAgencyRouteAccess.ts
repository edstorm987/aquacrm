import type { GovernedWorkspaceId, WorkspaceElementLevel } from "@/lib/server/access/workspaceElementAccess";
import type { AccessElementKey } from "@/server/types";

// Agency-scoped plugin routes need the same element floor as first-party API
// routes. This map is intentionally route-specific: one plugin can own several
// departments, so assigning a single element to all of `leads-pipeline` would
// either expose outreach to a contacts-only seat or block legitimate sales
// work.

export type AgencyPluginApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "HEAD";

export interface AgencyPluginApiAccessRequirement {
  workspace: GovernedWorkspaceId;
  element: AccessElementKey;
  level: Exclude<WorkspaceElementLevel, "hidden">;
}

type RoutePolicy = Readonly<Partial<Record<AgencyPluginApiMethod, readonly AgencyPluginApiAccessRequirement[]>>>;

const outreachView = [{ workspace: "growth", element: "growth.outreach", level: "view" }] as const;
const outreachUse = [{ workspace: "growth", element: "growth.outreach", level: "use" }] as const;
const outreachManage = [{ workspace: "growth", element: "growth.outreach", level: "manage" }] as const;
const qualifyProspect = [
  { workspace: "growth", element: "growth.outreach", level: "use" },
  { workspace: "growth", element: "growth.leads", level: "use" },
] as const;

/**
 * Every shipped Scouting method is classified here. A contract test walks the
 * manifest so a future prospect or provider-search route cannot silently
 * bypass the workspace-element boundary.
 */
const LEADS_PIPELINE_SCOUTING_ACCESS: Readonly<Record<string, RoutePolicy>> = {
  prospects: {
    GET: outreachView,
    POST: outreachUse,
    PATCH: outreachUse,
  },
  "google-places/search": { POST: outreachUse },
  "prospects/import": { POST: outreachManage },
  "prospects/outreach": { POST: outreachUse },
  "prospects/follow-ups": { POST: outreachUse, PATCH: outreachUse },
  "prospects/inspection": { POST: outreachUse },
  "prospects/notes": { POST: outreachUse },
  "prospects/qualify": { POST: qualifyProspect },
  "prospects/dismiss": { POST: outreachManage },
};

const NO_REQUIREMENTS: readonly AgencyPluginApiAccessRequirement[] = [];

/**
 * The agency workspace-element floor for one resolved plugin API method.
 *
 * An unclassified module/path returns no requirements so this addition cannot
   * change unrelated plugins. The manifest-coverage contract makes that
   * fall-through explicit and fail-closed for the Scouting surface in scope.
 */
export function agencyPluginApiAccessRequirements(
  moduleId: string,
  rest: readonly string[],
  method: string,
): readonly AgencyPluginApiAccessRequirement[] {
  if (moduleId !== "leads-pipeline") return NO_REQUIREMENTS;
  const policy = LEADS_PIPELINE_SCOUTING_ACCESS[rest.join("/")];
  return policy?.[method as AgencyPluginApiMethod] ?? NO_REQUIREMENTS;
}
