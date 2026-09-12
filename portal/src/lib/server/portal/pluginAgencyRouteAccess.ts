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
const leadsView = [{ workspace: "growth", element: "growth.leads", level: "view" }] as const;
const leadsUse = [{ workspace: "growth", element: "growth.leads", level: "use" }] as const;
const leadsManage = [{ workspace: "growth", element: "growth.leads", level: "manage" }] as const;
const contactsView = [{ workspace: "growth", element: "growth.contacts", level: "view" }] as const;
const contactsUse = [{ workspace: "growth", element: "growth.contacts", level: "use" }] as const;
const contactsManage = [{ workspace: "growth", element: "growth.contacts", level: "manage" }] as const;
const campaignsView = [{ workspace: "growth", element: "growth.campaigns", level: "view" }] as const;
const campaignsUse = [{ workspace: "growth", element: "growth.campaigns", level: "use" }] as const;
const campaignsManage = [{ workspace: "growth", element: "growth.campaigns", level: "manage" }] as const;
const campaignAudienceView = [
  { workspace: "growth", element: "growth.campaigns", level: "use" },
  { workspace: "growth", element: "growth.leads", level: "view" },
] as const;
const campaignAudienceSend = [
  { workspace: "growth", element: "growth.campaigns", level: "manage" },
  { workspace: "growth", element: "growth.leads", level: "use" },
] as const;
const qualifyProspect = [
  { workspace: "growth", element: "growth.outreach", level: "use" },
  { workspace: "growth", element: "growth.leads", level: "use" },
] as const;
const contactToBoard = [
  { workspace: "growth", element: "growth.contacts", level: "use" },
  { workspace: "growth", element: "growth.leads", level: "use" },
] as const;
const leadConversion = [
  { workspace: "growth", element: "growth.leads", level: "manage" },
  { workspace: "growth", element: "growth.contacts", level: "manage" },
] as const;
const commercialView = [
  { workspace: "growth", element: "growth.leads", level: "view" },
  { workspace: "growth", element: "growth.contacts", level: "view" },
] as const;
const commercialManage = [
  { workspace: "growth", element: "growth.leads", level: "manage" },
  { workspace: "growth", element: "growth.contacts", level: "manage" },
] as const;

/**
 * Every shipped leads-pipeline method is classified here. A contract test
 * walks the manifest so a future API route cannot silently bypass the
 * workspace-element boundary. The public Stripe webhook is deliberately
 * represented by an empty requirement list: its signature and tenant checks
 * are its control, but its exemption must remain visible during review.
 */
const LEADS_PIPELINE_ACCESS: Readonly<Record<string, RoutePolicy>> = {
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
  // This is a write to both sides of the acquisition relationship: it creates
  // a Prospect dossier for an existing Journey Lead. Require the same two
  // capabilities as qualification, not the broad plugin role alone.
  "prospects/start-dossier": { POST: qualifyProspect },
  "prospects/qualify": { POST: qualifyProspect },
  "prospects/dismiss": { POST: outreachManage },
  "prospects/restore": { POST: outreachManage },

  leads: { GET: leadsView, POST: leadsUse, PATCH: leadsUse },
  "leads/status": { POST: leadsUse },
  "leads/meeting": { POST: leadsUse },
  "leads/contacted": { POST: leadsUse },
  "leads/convert-to-client": { POST: leadConversion },
  "leads/archive": { POST: leadsManage },
  "leads/restore": { POST: leadsManage },
  "leads/purge": { POST: leadsManage },

  "import-csv": { POST: contactsManage },
  "import-csv/preview": { POST: contactsUse },
  "contact-configuration": { GET: contactsView, POST: contactsManage },

  contacts: { GET: contactsView, POST: contactsUse, PATCH: contactsUse },
  "contacts/meeting": { POST: contactsUse },
  "contacts/contacted": { POST: contactsUse },
  "contacts/add-to-board": { POST: contactToBoard },
  "contacts/convert-to-client": { POST: contactsManage },

  commercial: { GET: commercialView, PUT: commercialManage },
  "commercial/send": { POST: commercialManage },
  "commercial/payment": { POST: commercialManage },
  "commercial/stripe-checkout": { POST: commercialManage },
  "commercial/stripe-webhook": { POST: [] },

  campaigns: { GET: campaignsView, POST: campaignsManage, PATCH: campaignsManage },
  "campaigns/send": { POST: campaignAudienceSend },
  "campaigns/preview-audience": { POST: campaignAudienceView },
};

const NO_REQUIREMENTS: readonly AgencyPluginApiAccessRequirement[] = [];

/**
 * The agency workspace-element floor for one resolved plugin API method.
 *
 * An unclassified module/path returns no requirements so this addition cannot
 * change unrelated plugins. The dispatcher separately asks whether a
 * leads-pipeline path/method is classified and fails closed when it is not.
 */
export function agencyPluginApiAccessRequirements(
  moduleId: string,
  rest: readonly string[],
  method: string,
): readonly AgencyPluginApiAccessRequirement[] {
  if (moduleId !== "leads-pipeline") return NO_REQUIREMENTS;
  const policy = LEADS_PIPELINE_ACCESS[rest.join("/")];
  return policy?.[method as AgencyPluginApiMethod] ?? NO_REQUIREMENTS;
}

export function isAgencyPluginApiRouteClassified(
  moduleId: string,
  rest: readonly string[],
  method: string,
): boolean {
  if (moduleId !== "leads-pipeline") return false;
  const policy = LEADS_PIPELINE_ACCESS[rest.join("/")];
  return Boolean(policy && Object.prototype.hasOwnProperty.call(policy, method));
}
