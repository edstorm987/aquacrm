// Ed's home — /portal/agency.
//
// T1 R034 — Pipelines hub. The single "Clients grid" retired; this page
// now lists every pipeline (fulfilment / leads / sales / custom) as a
// clickable card. Each card → /portal/agency/pipelines/<slug>. Default
// landing for the foundation team is fulfilment; the kanban plugin
// (T2 R+1) renders the actual board behind each pipeline.
//
// Why a hub instead of redirect: Ed wants the dashboard tiles + activity
// feed + KPIs visible above the pipelines so the agency owner gets a
// glance at status before diving into a board.

import Link from "next/link";
import { CalendarDays, NotebookPen } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { listPipelines, pipelineCardCounts, seedDefaultPipelines } from "@/server/pipelines";
import { NewClientButton } from "./_NewClientButton";
import { getUser } from "@/server/users";
import { listAgencyTasks } from "@/server/tasks";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { INTERNAL_WORKSPACE_NAME } from "@/lib/internalWorkspace";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";
import { isAssistantConfigured } from "@/lib/server/openaiAssistant";
import { DashboardCommandCenter, type DashboardSignal } from "./_DashboardCommandCenter";
import { getCachedBusinessIssueRadar } from "@/lib/server/businessIssueRadar";
import { inspectRadarEvidence } from "@/lib/server/radarEvidenceVault";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { buildBusinessRecommendedActions } from "@/lib/businessRecommendedActions";

export default async function AgencyHome() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId)!;
  const clients = listClients(agency.id);
  const tasks = listAgencyTasks(agency.id);
  ensureDefaultAgencyProducts(agency.id);
  const products = listAgencyProducts(agency.id);
  const serviceBrands = listTradingCompanies(agency.id).filter(company => company.status !== "archived");
  const workspaceSettings = getAgencyWorkspaceSettings(agency.id);
  const recommendationTime = Date.now();
  const [businessRadar, operationalAlerts] = await Promise.all([
    getCachedBusinessIssueRadar(agency.id),
    listOperationalAlerts(agency.id, recommendationTime),
  ]);
  const radarEvidence = inspectRadarEvidence(agency.id);

  // Idempotent — guarantees a fresh agency lands on default pipelines
  // even if it pre-dates the R034 seed in `bootstrapAgency`.
  seedDefaultPipelines(agency.id);

  const pipelines = listPipelines(agency.id);
  const counts = pipelineCardCounts(agency.id);
  const leadsPipeline = pipelines.find(p => p.kind === "leads" || p.slug === "leads");
  const leadsCardCount = leadsPipeline ? counts[leadsPipeline.id] ?? 0 : 0;
  const fulfilmentPipeline = pipelines.find(p => p.kind === "fulfilment" || p.slug === "fulfilment");
  const fulfilmentCardCount = fulfilmentPipeline ? counts[fulfilmentPipeline.id] ?? 0 : 0;
  const activeClients = clients.filter(c => c.stage !== "churned");
  const staleClients = clients.filter(c => {
    const m = (c.metadata ?? {}) as { lastContactedAt?: number };
    if (!m.lastContactedAt) return true;
    return Date.now() - m.lastContactedAt > 7 * 24 * 60 * 60 * 1000;
  });
  const dashboardSignals = buildDashboardSignals({
    clients,
    staleClients,
    leadsCardCount,
    fulfilmentCardCount,
    productCount: products.length,
  });

  const account = getUser(session.email);
  const firstName = account?.name?.trim().split(/\s+/)[0] ?? (session.email.split("@")[0] || "there").replace(/[^a-z]/gi, "");
  const greet = firstName ? firstName[0]!.toUpperCase() + firstName.slice(1) : "there";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7" data-testid="agency-pipelines-hub">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {INTERNAL_WORKSPACE_NAME} · Command deck
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black/90 sm:text-3xl">
            Command center
          </h1>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Welcome aboard, {greet}. Your watch, business signals, and next moves are gathered here.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Link
            href="/portal/agency/calendar"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 shadow-sm hover:bg-black/[0.03]"
          >
            <CalendarDays size={15} /> Calendar
          </Link>
          <Link
            href="/portal/agency/notepad"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 shadow-sm hover:bg-black/[0.03]"
          >
            <NotebookPen size={15} /> Notepad
          </Link>
          <Link
            href="/portal/agency/pipelines/leads#new-lead"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 shadow-sm hover:bg-black/[0.03]"
          >
            Add lead
          </Link>
          <NewClientButton defaults={workspaceSettings} brands={serviceBrands.map(company => ({
            id: company.id,
            name: company.name,
            primaryColor: company.brand.primaryColor,
          }))} products={products.map(product => ({
            id: product.id, kind: product.kind, name: product.name, category: product.category,
            description: product.description ?? "", deliverables: product.deliverables,
            buyerHeadline: product.buyerHeadline, coverImageUrl: product.coverImageUrl,
            accentColor: product.accentColor, portalRequirement: product.portalRequirement,
            portalHeadline: product.portalHeadline, portalWelcomeNote: product.portalWelcomeNote,
            includedProductIds: product.includedProductIds, welcomePackItems: product.welcomePackItems,
            welcomePackNotes: product.welcomePackNotes, pricing: product.pricing,
            priceCents: product.priceCents, billingInterval: product.billingInterval,
            depositPercent: product.depositPercent, taxRatePercent: product.taxRatePercent,
            paymentTermsDays: product.paymentTermsDays, billingNotes: product.billingNotes,
            internalInfo: product.internalInfo, contractTitle: product.contractTitle,
            contractBody: product.contractBody, sopIds: product.sopIds,
            sopCategories: product.sopCategories, companyIds: product.companyIds,
          }))} />
        </div>
      </section>

      <DashboardCommandCenter
        planning={dashboardPlanningSnapshot(agency.id, session.userId)}
        tasks={tasks}
        signals={dashboardSignals}
        businessRadar={businessRadar}
        radarEvidence={radarEvidence}
        recommendedActions={buildBusinessRecommendedActions({
          radar: businessRadar,
          alerts: operationalAlerts,
          existingTaskTitles: tasks.filter(task => task.status !== "done").map(task => task.title),
          now: recommendationTime,
          limit: 5,
        })}
        advisorConfigured={isAssistantConfigured(agency.id)}
        counts={{
          activeClients: activeClients.length,
          leads: leadsCardCount,
          delivery: fulfilmentCardCount,
          products: products.length,
        }}
      />

    </div>
  );
}

function buildDashboardSignals({
  clients,
  staleClients,
  leadsCardCount,
  fulfilmentCardCount,
  productCount,
}: {
  clients: ReturnType<typeof listClients>;
  staleClients: ReturnType<typeof listClients>;
  leadsCardCount: number;
  fulfilmentCardCount: number;
  productCount: number;
}): DashboardSignal[] {
  const signals: DashboardSignal[] = [];
  if (leadsCardCount > 0) {
    signals.push({
      id: "sales:leads",
      title: "Clear the lead pipeline",
      detail: `${leadsCardCount} lead${leadsCardCount === 1 ? "" : "s"} need a next step, follow-up, quote, or meeting decision.`,
      href: "/portal/agency/pipelines/leads",
      kind: "Sales",
      priority: "high",
    });
  }
  if (fulfilmentCardCount > 0) {
    signals.push({
      id: "delivery:fulfilment",
      title: "Move fulfilment forward",
      detail: `${fulfilmentCardCount} delivery item${fulfilmentCardCount === 1 ? "" : "s"} are active. Pick the blocker and move it today.`,
      href: "/portal/agency/fulfilment",
      kind: "Delivery",
      priority: "high",
    });
  }
  for (const client of staleClients.slice(0, 3)) {
    signals.push({
      id: `client:${client.id}:health`,
      title: `Check in with ${client.name}`,
      detail: "Client health needs a touchpoint. Log the note, next decision, or risk after contact.",
      href: `/portal/clients/${client.id}`,
      kind: "Client health",
      priority: "urgent",
    });
  }
  if (clients.length > 0 && productCount === 0) {
    signals.push({
      id: "offers:products",
      title: "Define the sellable offers",
      detail: "Products are still empty, so projections and delivery planning have weak inputs.",
      href: "/portal/agency/company?view=products",
      kind: "Company",
      priority: "high",
    });
  }
  if (signals.length === 0) {
    signals.push({
      id: "growth:marketing",
      title: "Create one growth asset",
      detail: "Build a campaign step, social post, Google Business update, or funnel page that can create demand.",
      href: "/portal/agency/marketing",
      kind: "Growth",
      priority: "normal",
    });
  }
  return signals;
}
