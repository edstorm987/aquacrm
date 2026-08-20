import { summarizeClientTelemetry, type ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { FIRST_PARTY_DEVELOPMENT_PROJECTS } from "@/lib/projects/firstPartyDevelopmentProjects";
import { requireRole } from "@/lib/server/auth/auth";
import { ensureAgencyWebsite } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { listInstalledFor } from "@/server/pluginInstalls";
import { ensureDefaultDevelopmentWorkflow, listDevelopmentWorkflows, listVisibleDevelopmentResources } from "@/server/developmentToolkit";
import { listSops } from "@/server/sops";
import { AGENCY_ROLES } from "@/server/types";
import { clientWorkspaceDisplayName, clientWorkspaceHref } from "@/lib/clients/clientWorkspace";
import {
  DevelopmentPortfolio,
  type DevelopmentProjectKind,
  type DevelopmentProjectRow,
  type DevelopmentProjectStatus,
} from "./_DevelopmentPortfolio";
import { DevelopmentNav } from "./_DevelopmentNav";
import { DevelopmentDashboard } from "./_DevelopmentDashboard";

type Product = {
  id?: string;
  kind?: DevelopmentProjectKind;
  name?: string;
  label?: string;
  status?: DevelopmentProjectStatus;
  localPath?: string;
  repoUrl?: string;
  liveUrl?: string;
  previewUrl?: string;
  tagStatus?: "planned" | "installed" | "missing" | "broken" | "not-needed";
};

type ClientMetadata = {
  properties?: Product[];
  clientRequests?: Array<{ status?: string }>;
  telemetryEvents?: ClientTelemetryEvent[];
  telemetryLastSeenAt?: number;
};

export default async function DevelopmentPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string }> }) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId).filter(client => client.status !== "archived");
  const ownWebsite = ensureAgencyWebsite(session.agencyId);
  const requested = await searchParams;
  const view = requested.view === "workspace" ? "workspace" : "overview";
  const initialStatus = ["active", "all", "planning", "building", "review", "live", "redirected", "archived"].includes(requested.status ?? "")
    ? requested.status
    : "active";

  const projects: DevelopmentProjectRow[] = FIRST_PARTY_DEVELOPMENT_PROJECTS.map(project => {
    const projectEvents = project.telemetryPropertyId
      ? ownWebsite.telemetryEvents.filter(event => event.propertyId === project.telemetryPropertyId)
      : [];
    const telemetry = summarizeClientTelemetry(projectEvents);
    const tagStatus = !project.telemetryPropertyId
      ? "not-needed"
      : telemetry.lastSeenAt || project.tagInstalled
        ? "installed"
        : "missing";
    const issue = telemetry.errors24h
      ? `${telemetry.errors24h} error${telemetry.errors24h === 1 ? "" : "s"} today`
      : tagStatus === "missing"
        ? "Monitoring tag missing"
        : undefined;

    return {
      id: project.id,
      name: project.name,
      kind: project.kind,
      status: project.status,
      owner: "Ecosystem",
      clientName: project.brand,
      managementHref: `/portal/agency/fulfilment/technical/projects/${project.id}`,
      previewUrl: project.previewUrl,
      liveUrl: project.publicUrl,
      repoUrl: project.repositoryUrl,
      localPath: project.sourcePath,
      folder: project.folder,
      tags: [...project.tags],
      telemetrySiteKey: project.telemetrySiteKey,
      telemetryPropertyId: project.telemetryPropertyId,
      tagStatus,
      lastSignalAt: telemetry.lastSeenAt,
      views24h: telemetry.pageviews24h,
      errors24h: telemetry.errors24h,
      issue,
      statusDetail: project.description,
    } satisfies DevelopmentProjectRow;
  });

  for (const client of clients) {
    const clientLabel = clientWorkspaceDisplayName(client);
    const metadata = (client.metadata ?? {}) as ClientMetadata;
    const allTelemetry = metadata.telemetryEvents ?? [];
    const openRequests = (metadata.clientRequests ?? []).filter(item => item.status === "open").length;
    const products = metadata.properties ?? [];
    const builderReady = listInstalledFor({ agencyId: session.agencyId, clientId: client.id })
      .some(install => install.pluginId === "website-editor" && install.enabled);

    for (const [index, product] of products.entries()) {
      const projectId = product.id ?? `${client.id}-${index}`;
      const projectEvents = allTelemetry.filter(event =>
        event.propertyId === projectId || (products.length === 1 && !event.propertyId),
      );
      const telemetry = summarizeClientTelemetry(projectEvents);
      const status = product.status ?? "planning";
      const issue =
        product.tagStatus === "broken" ? "Monitoring broken"
        : telemetry.errors24h ? `${telemetry.errors24h} errors today`
        : status === "review" ? "Ready for review"
        : openRequests ? `${openRequests} open request${openRequests === 1 ? "" : "s"}`
        : undefined;

      projects.push({
        id: projectId,
        name: product.label || product.name || prettyKind(product.kind),
        kind: product.kind ?? "website",
        status,
        owner: "Client",
        clientId: client.id,
        builderReady,
        clientName: clientLabel,
        managementHref: clientWorkspaceHref(client.id, "systems", { systemView: "properties" }),
        previewUrl: product.previewUrl,
        liveUrl: product.liveUrl,
        repoUrl: product.repoUrl,
        localPath: product.localPath,
        folder: `Clients/${clientLabel}`,
        tags: [product.kind ?? "website", status, "client"],
        telemetryPropertyId: projectId,
        tagStatus: product.tagStatus,
        lastSignalAt: telemetry.lastSeenAt ?? metadata.telemetryLastSeenAt,
        views24h: telemetry.pageviews24h,
        errors24h: telemetry.errors24h,
        issue,
        statusDetail: status === "live" && product.tagStatus === "installed"
          ? "Live and reporting"
          : product.repoUrl
            ? "Repository connected"
            : product.localPath
              ? "Local project connected"
              : undefined,
      });
    }
  }

  ensureDefaultDevelopmentWorkflow(session.agencyId, session.userId);
  const resources = listVisibleDevelopmentResources(session.agencyId, session.userId, session.role);
  const toolkitCount = resources.filter(resource => !["course", "knowledge", "credential", "sop"].includes(resource.kind)).length;
  const vaultCount = resources.length - toolkitCount;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <DevelopmentNav active={view === "workspace" ? "systems" : "overview"} />
      {view === "workspace" ? (
        <DevelopmentPortfolio initialProjects={projects} initialStatus={initialStatus} />
      ) : (
        <DevelopmentDashboard
          projects={projects}
          toolkitCount={toolkitCount}
          vaultCount={vaultCount}
          workflowCount={listDevelopmentWorkflows(session.agencyId).length}
          sopCount={listSops(session.agencyId).length}
        />
      )}
    </div>
  );
}

function prettyKind(kind?: DevelopmentProjectKind) {
  if (!kind) return "Untitled project";
  return kind
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
