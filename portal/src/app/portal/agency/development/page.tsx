import { summarizeClientTelemetry, type ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { FIRST_PARTY_DEVELOPMENT_PROJECTS } from "@/lib/firstPartyDevelopmentProjects";
import { requireRole } from "@/lib/server/auth";
import { ensureAgencyWebsite, summarizeAgencyWebsite } from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import {
  DevelopmentPortfolio,
  type DevelopmentProjectKind,
  type DevelopmentProjectRow,
  type DevelopmentProjectStatus,
} from "./_DevelopmentPortfolio";
import { DevelopmentNav } from "./_DevelopmentNav";

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

export default async function DevelopmentPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId).filter(client => client.status !== "archived");
  const ownWebsite = ensureAgencyWebsite(session.agencyId);
  const ownWebsiteSummary = summarizeAgencyWebsite(ownWebsite);

  const projects: DevelopmentProjectRow[] = FIRST_PARTY_DEVELOPMENT_PROJECTS.map(project => {
    const isWebsite = project.id === "milesymedia-website";
    return {
      id: project.id,
      name: project.name,
      kind: project.kind,
      status: isWebsite
        ? ownWebsite.status === "live" ? "live" : ownWebsite.status === "maintenance" ? "review" : "building"
        : project.status,
      owner: "Milesymedia",
      clientName: project.kind === "lead-magnet" ? "Milesymedia · Lead generation" : "Milesymedia",
      managementHref: isWebsite
        ? "/portal/agency/development/website"
        : `/portal/agency/development/projects/${project.id}`,
      previewUrl: project.previewUrl,
      liveUrl: project.publicUrl,
      repoUrl: project.repositoryUrl,
      localPath: project.sourcePath,
      tagStatus: isWebsite && ownWebsite.telemetryLastSeenAt ? "installed" : isWebsite ? "planned" : "not-needed",
      lastSignalAt: isWebsite ? ownWebsite.telemetryLastSeenAt : undefined,
      views24h: isWebsite ? ownWebsiteSummary.pageviews24h : 0,
      errors24h: isWebsite ? ownWebsiteSummary.errors24h : 0,
      issue: isWebsite && ownWebsiteSummary.errors24h ? `${ownWebsiteSummary.errors24h} errors today` : undefined,
      statusDetail: isWebsite
        ? ownWebsite.status === "gated" ? "Public gate · full private build preview available" : `Public mode: ${ownWebsite.status}`
        : project.description,
    } satisfies DevelopmentProjectRow;
  });

  for (const client of clients) {
    const metadata = (client.metadata ?? {}) as ClientMetadata;
    const telemetry = summarizeClientTelemetry(metadata.telemetryEvents ?? []);
    const openRequests = (metadata.clientRequests ?? []).filter(item => item.status === "open").length;

    for (const [index, product] of (metadata.properties ?? []).entries()) {
      const status = product.status ?? "planning";
      const issue =
        product.tagStatus === "broken" ? "Monitoring broken"
        : telemetry.errors24h ? `${telemetry.errors24h} errors today`
        : status === "review" ? "Ready for review"
        : openRequests ? `${openRequests} open request${openRequests === 1 ? "" : "s"}`
        : undefined;

      projects.push({
        id: product.id ?? `${client.id}-${index}`,
        name: product.label || product.name || prettyKind(product.kind),
        kind: product.kind ?? "website",
        status,
        owner: "Client",
        clientId: client.id,
        clientName: client.name,
        managementHref: `/portal/clients/${client.id}?tab=properties`,
        previewUrl: product.previewUrl,
        liveUrl: product.liveUrl,
        repoUrl: product.repoUrl,
        localPath: product.localPath,
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <DevelopmentNav active="systems" />
      <DevelopmentPortfolio initialProjects={projects} />
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
