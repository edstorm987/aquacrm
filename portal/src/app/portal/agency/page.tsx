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
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { listPipelines, pipelineCardCounts, seedDefaultPipelines } from "@/server/pipelines";
import { NewClientButton } from "./_NewClientButton";
import { FounderDashboardKpis } from "./_FounderDashboardKpis";
import { getUser } from "@/server/users";
import { listAgencyTasks } from "@/server/tasks";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { getTradingCompany, recordBelongsToCompany } from "@/server/tradingCompanies";

export default async function AgencyHome() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId)!;
  const activeCompanyId = await getActiveTradingCompanyId(agency.id);
  const activeCompany = activeCompanyId ? getTradingCompany(agency.id, activeCompanyId) : null;
  const clients = listClients(agency.id).filter(client => !activeCompanyId || !client.companyId || client.companyId === activeCompanyId);
  const openTaskCount = listAgencyTasks(agency.id).filter(task => task.status !== "done").length;
  ensureDefaultAgencyProducts(agency.id);
  const products = listAgencyProducts(agency.id).filter(product => recordBelongsToCompany(product.companyIds, activeCompanyId));
  const workspaceSettings = getAgencyWorkspaceSettings(agency.id);

  // Idempotent — guarantees a fresh agency lands on default pipelines
  // even if it pre-dates the R034 seed in `bootstrapAgency`.
  seedDefaultPipelines(agency.id);

  const pipelines = listPipelines(agency.id);
  const counts = pipelineCardCounts(agency.id);
  const leadsPipeline = pipelines.find(p => p.kind === "leads" || p.slug === "leads");
  const leadsCardCount = leadsPipeline ? counts[leadsPipeline.id] ?? 0 : 0;
  const fulfilmentPipeline = pipelines.find(p => p.kind === "fulfilment" || p.slug === "fulfilment");
  const fulfilmentCardCount = fulfilmentPipeline ? counts[fulfilmentPipeline.id] ?? 0 : 0;

  const account = getUser(session.email);
  const firstName = account?.name?.trim().split(/\s+/)[0] ?? (session.email.split("@")[0] || "there").replace(/[^a-z]/gi, "");
  const greet = firstName ? firstName[0]!.toUpperCase() + firstName.slice(1) : "there";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-7" data-testid="agency-pipelines-hub">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {activeCompany?.name ?? "Milesymedia"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">
            Welcome back, {greet}.
          </h1>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Sales, clients, project work, support, and money in one clear place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/portal/agency/pipelines/leads#new-lead"
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/75 shadow-sm hover:bg-black/[0.03]"
          >
            Add lead
          </Link>
          <NewClientButton defaults={workspaceSettings} products={products.map(product => ({
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
            sopCategories: product.sopCategories,
          }))} />
        </div>
      </section>

      <FounderDashboardKpis
        activeClients={clients.filter(c => c.stage !== "churned").length}
        lockInCollected={clients.filter(c => {
          const m = (c.metadata ?? {}) as { lockInPaid?: boolean };
          return m.lockInPaid === true;
        }).length}
        openWorkItems={fulfilmentCardCount}
        staleClients={clients.filter(c => {
          const m = (c.metadata ?? {}) as { lastContactedAt?: number };
          if (!m.lastContactedAt) return true;
          return Date.now() - m.lastContactedAt > 7 * 24 * 60 * 60 * 1000;
        }).length}
      />

      <OperatingLoop
        leadCount={leadsCardCount}
        clientCount={clients.length}
        deliveryCount={fulfilmentCardCount}
        openTaskCount={openTaskCount}
      />

    </div>
  );
}

function OperatingLoop({
  leadCount,
  clientCount,
  deliveryCount,
  openTaskCount,
}: {
  leadCount: number;
  clientCount: number;
  deliveryCount: number;
  openTaskCount: number;
}) {
  const steps = [
    {
      label: "Capture a lead",
      detail: leadCount ? `${leadCount} lead${leadCount === 1 ? "" : "s"} in sales` : "Add the first person or business you want to work with.",
      href: "/portal/agency/pipelines/leads",
      done: leadCount > 0,
      action: "Open sales",
    },
    {
      label: "Create the client",
      detail: clientCount ? `${clientCount} client${clientCount === 1 ? "" : "s"} ready` : "Create the client once the opportunity is agreed.",
      href: "/portal/clients",
      done: clientCount > 0,
      action: "Open clients",
    },
    {
      label: "Start delivery",
      detail: deliveryCount ? `${deliveryCount} active delivery item${deliveryCount === 1 ? "" : "s"}` : "Confirm what they bought and move the work into fulfilment.",
      href: "/portal/agency/pipelines/fulfilment",
      done: deliveryCount > 0,
      action: "Open fulfilment",
    },
    {
      label: "Run the work",
      detail: openTaskCount ? `${openTaskCount} open action${openTaskCount === 1 ? "" : "s"}` : "Track actions, money, support, and the next client decision.",
      href: openTaskCount ? "/portal/agency/actions" : "/portal/agency/agency-finance",
      done: deliveryCount > 0 && openTaskCount === 0,
      action: openTaskCount ? "Open actions" : "Open finance",
    },
  ];
  const nextIndex = Math.max(0, steps.findIndex(step => !step.done));

  return (
    <section aria-labelledby="operating-loop-heading" className="border-y border-black/10">
      <div className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Do next</p>
          <h2 id="operating-loop-heading" className="mt-1 text-lg font-semibold text-black/85">One customer journey</h2>
          <p className="mt-1 text-sm text-black/50">Move from opportunity to paid, delivered work without losing the next step.</p>
        </div>
        <span className="text-xs text-black/40">{steps.filter(step => step.done).length} of {steps.length} clear</span>
      </div>
      <ol className="divide-y divide-black/[0.07] border-t border-black/10">
        {steps.map((step, index) => {
          const isNext = index === nextIndex && !step.done;
          return <li key={step.label} className={`grid gap-3 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center ${isNext ? "bg-[#faf7ef]" : ""}`}>
            <span className={`grid size-7 place-items-center rounded-full text-xs font-semibold ${step.done ? "bg-emerald-50 text-emerald-700" : isNext ? "bg-black text-white" : "bg-black/[0.04] text-black/35"}`}>{step.done ? "✓" : index + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black/80">{step.label}{isNext ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Next</span> : null}</p>
              <p className="mt-0.5 text-xs text-black/45">{step.detail}</p>
            </div>
            <Link href={step.href} className="w-fit rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65 hover:border-black/20">{step.action}</Link>
          </li>;
        })}
      </ol>
    </section>
  );
}
