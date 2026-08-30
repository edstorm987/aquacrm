// /portal/agency/settings — the one-page tabbed settings hub. Picks
// up the agency layout's sidebar + topbar; renders the gear header +
// SettingsTabs (client-side tab switcher) below.

import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { getUserById, listUsersForAgency } from "@/server/users";
import { listPhasesForAgency } from "@/server/phases";
import { listInstalledFor } from "@/server/pluginInstalls";
import { inspectProductionReadiness } from "@/lib/server/productionReadiness";
import { listManagedIntegrationProviders } from "@/lib/server/integrations/integrationConnections";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { SettingsTabs } from "./SettingsTabs";
import type { Role } from "@/server/types";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { listExternalAssistantApiKeys } from "@/lib/server/assistants/externalAssistantKeys";
import { Settings2 } from "lucide-react";
import { getAgencySettingsCapabilities } from "@/lib/agencySettingsCapabilities";
import {
  actorHasGovernanceCapability,
  requireCurrentAccessActor,
} from "@/server/accessControl";
import { listDevProjects } from "@/engines/editor/server/devProjects";
import { getFreelancerAccessConfig, listFreelancerJobsForConfig } from "@/server/freelancerWorkspace";
import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { AGENCY_SCOPED_SETTINGS_MODULE_IDS } from "@/lib/chrome/settingsModules";
import { getUserChromeLayout } from "@/lib/server/chrome/userChromeLayout";
import { agencyProductsForRead } from "@/server/agencyProducts";
import { calculateServiceBrandHealth } from "@/lib/performance/companyHealth";

type AgencyTeamRole = Extract<Role, "agency-owner" | "agency-manager" | "agency-staff">;

function isAgencyTeamRole(role: Role): role is AgencyTeamRole {
  return role === "agency-owner" || role === "agency-manager" || role === "agency-staff";
}

export default async function AgencySettingsPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (session.publicShowcase) redirect("/portal/agency");

  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  const user = getUserById(session.userId);
  const accessActor = await requireCurrentAccessActor().catch(() => null);
  const accessPeople = accessActor
    ? Object.values(accessActor.governanceState.users)
      .filter(candidate => {
        const memberships = candidate.agencyIds.length > 0
          ? candidate.agencyIds
          : candidate.agencyId ? [candidate.agencyId] : [];
        return memberships.includes(accessActor.agencyId)
          && candidate.role !== "lead"
          && candidate.role !== "end-customer";
      })
      .map(candidate => ({
        id: candidate.id,
        name: candidate.name || candidate.email,
        email: candidate.email,
        role: candidate.role,
      }))
    : [];
  const clients = listClients(agency.id);
  const activeClients = clients.filter(client => client.status === "active");
  const billingConfiguredClientCount = activeClients.filter(client => {
    const paymentLink = client.metadata?.stripeLink;
    return typeof paymentLink === "string" && paymentLink.trim().length > 0;
  }).length;

  // Ed, 2026-08-29: *"bring it all into settings rather than taking us out of
  // settings — so I can do it all inside."* Everything below is loaded so the
  // hub can EDIT it in place rather than link away.
  const freelancerAccess = getFreelancerAccessConfig(agency.id);
  const freelancerJobs = listFreelancerJobsForConfig(agency.id);

  // Only AGENCY-scoped modules. `client-crm`, `affiliates`, `ecommerce` and
  // `memberships` declare `scopePolicy: "client"` — their settings are per
  // client (a client's own Stripe keys, their own segments), so there is no
  // single agency value to edit and showing one here would be a lie about
  // whose credentials you were typing.
  const moduleSettings = AGENCY_SCOPED_SETTINGS_MODULE_IDS
    .map(pluginId => describePluginSettings(pluginId, { agencyId: agency.id }))
    .filter((settings): settings is NonNullable<typeof settings> => Boolean(settings));

  // Trading companies, with the same per-company counts the Company page
  // computes. All in-memory array work over the already-hydrated state — not a
  // sweep like Radar — so it can load with the page rather than on selection.
  const agencyProducts = agencyProductsForRead(agency.id, true);
  const agencyUsers = listUsersForAgency(agency.id).filter(person => person.role.startsWith("agency-"));
  const companySummaries = listTradingCompanies(agency.id, true).map(company => {
    const companyClients = clients.filter(client => client.companyId === company.id);
    const productCount = agencyProducts.filter(product => product.companyIds?.includes(company.id)).length;
    const staffCount = agencyUsers.filter(person => person.companyIds?.includes(company.id)).length;
    return {
      ...company,
      clientCount: companyClients.length,
      productCount,
      staffCount,
      healthScore: calculateServiceBrandHealth({
        status: company.status,
        hasWebsite: Boolean(company.website),
        hasDescription: Boolean(company.description),
        clientCount: companyClients.length,
        activeClientCount: companyClients.filter(client => client.status === "active").length,
        productCount,
        staffCount,
      }).overall,
    };
  });

  const chromeLayout = getUserChromeLayout(agency.id, session.userId);

  const ctx = {
    companySummaries,
    workspaceSummary: {
      clientCount: clients.length,
      productCount: agencyProducts.length,
      staffCount: agencyUsers.length,
      healthScore: 0,
    },
    customCss: chromeLayout.customCss ?? "",
    freelancerAccess,
    freelancerJobs,
    moduleSettings,
    user: {
      name: user?.name,
      email: session.email,
      role: session.role,
      avatarUrl: user?.avatarUrl,
    },
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      primaryColor: agency.brand?.primaryColor,
    },
    workspace: {
      clientCount: clients.length,
      phaseCount: listPhasesForAgency(agency.id).length,
      systemCount: listInstalledFor({ agencyId: agency.id }).length,
    },
    readiness: inspectProductionReadiness(process.env, {
      activeClientCount: activeClients.length,
      billingConfiguredClientCount,
      activeExternalAssistantKeyCount: listExternalAssistantApiKeys(agency.id)
        .filter(key => key.status === "active").length,
      managedIntegrationProviders: listManagedIntegrationProviders(agency.id),
    }),
    settings: getAgencyWorkspaceSettings(agency.id),
    capabilities: getAgencySettingsCapabilities(session.role),
    sandbox: session.sandbox,
    access: {
      agencyId: accessActor?.agencyId ?? agency.id,
      canManage: accessActor ? (["live", "sandbox"] as const).some(environment => (
        actorHasGovernanceCapability(accessActor, environment, "access.grant.manage")
      )) : false,
      people: accessPeople,
    },
    tradingCompanies: listTradingCompanies(agency.id).map(company => ({ id: company.id, name: company.name })),
    clients: clients.map(client => ({ id: client.id, name: client.name })),
    devProjects: session.role === "agency-owner"
      ? listDevProjects(agency.id).map(project => ({ id: project.id, name: project.name }))
      : [],
    team: listUsersForAgency(agency.id)
      .filter((teamUser): teamUser is typeof teamUser & { role: AgencyTeamRole } => isAgencyTeamRole(teamUser.role))
      .map(teamUser => ({
        id: teamUser.id,
        name: teamUser.name,
        email: teamUser.email,
        username: teamUser.username,
        role: teamUser.role,
        companyIds: teamUser.companyIds ?? [],
      })),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-start gap-4">
        <span aria-hidden className="mm-area-icon inline-flex h-14 w-14 items-center justify-center rounded-lg">
          <Settings2 size={29} strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-black/90">Settings</h1>
          <p className="mt-1 text-sm text-black/55">
            Manage the workspace, your team, and everything required for a safe launch.
          </p>
        </div>
      </header>

      <SettingsTabs ctx={ctx} />
    </div>
  );
}
