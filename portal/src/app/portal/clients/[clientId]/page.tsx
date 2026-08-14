// Per-client overview — /portal/clients/[clientId].
//
// One canonical client record with contextual lenses for relationship,
// delivery, technical operations, finance, communications, and portal work.
//
// Server-rendered: every tab's content is computed here so deep-links
// (e.g. `?tab=systems`) hydrate with full data. The "+ Add system"
// picker on the Systems tab is the only client-side mutating UI.

import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { ALL_ROLES, isAgencyRole, type ClientStage } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import { listInstalledFor } from "@/server/pluginInstalls";
import { listActivity } from "@/server/activity";
import { phaseLabel, listPhasesForAgency } from "@/server/phases";
import { listPlugins } from "@/built-ins/runtime/_registry";
import type { TabId } from "./_tabs";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { toolCopy } from "./toolCopy";
import { BuildPortalWizard, type WizardPlugin } from "./_BuildPortalWizard";
import { ClientSopsTab } from "./_ClientSopsTab";
import { KanbanTabClient } from "./_KanbanTabClient";
import { CommsRow } from "./_CommsRow";
import { FilesTabClient, type FileCategory } from "./_FilesTabClient";
import { FinanceTabClient } from "./_FinanceTabClient";
import type { ClientContract, ClientContractTemplate } from "@/lib/clientContracts";
import { listContractTemplates } from "@/server/contractTemplates";
import { listAgencyProducts } from "@/server/agencyProducts";
import { PropertiesTabClient, type ClientProperty } from "./_PropertiesTabClient";
import { ClientSystemsWorkspace } from "./_ClientSystemsWorkspace";
import { FulfilmentPortalPreview, type CustomerPortalMode } from "./_FulfilmentPortalPreview";
import { PhaseTransitionButton } from "./_PhaseTransitionButton";
import { ClientRequestsPanel } from "./_ClientRequestsPanel";
import type { ClientRequest } from "@/app/api/tenants/client-requests/route";
import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import { assertSopsAccess, familiesForStage, SopsAccessError } from "@/lib/server/sopsAccess";
import { RequirePermission } from "@/lib/server/RequirePermission";
import { OnboardingDashboardPanel, type OnboardingPhase } from "./_OnboardingDashboardPanel";
import { loadCustomerPortalData } from "@/app/portal/customer/_portalData";
import { getTradingCompany } from "@/server/tradingCompanies";
import { isGitHubPublishingConfiguredForAgency } from "@/lib/server/githubProjectPublisher";
import { isVercelProjectDeploymentConfiguredForAgency } from "@/lib/server/vercelProjectDeployer";
import { cleanClientContacts, type ClientEntityType } from "@/lib/clientContacts";
import { ClientContactsPanel } from "./_ClientContactsPanel";
import { WebsiteBuilderLauncher } from "./_WebsiteBuilderLauncher";
import { OverviewTabs } from "./_OverviewTabs";
import { ClientSpineOverview } from "./_ClientSpineOverview";
import { ClientDeliveryOverview } from "./_ClientDeliveryOverview";
import { ClientNotesWorkspace } from "./_ClientNotesWorkspace";
import { calculateClientAquaHealth } from "@/lib/clientAquaHealth";
import { cleanPortalProducts } from "@/lib/portalProducts";
import { clientProductWorkspaces } from "@/server/productWorkspaces";
import { portalWorkspaceProgress } from "@/lib/portalProductWorkspaces";
import { listClientMilestones } from "@/server/clientMilestones";
import { getInstall } from "@/server/pluginInstalls";
import { clientWorkspaceHref, resolveClientWorkspaceTab } from "@/lib/clientWorkspace";
import { Boxes, Globe2, MonitorCog } from "lucide-react";
import { cleanClientMarketingService } from "@/lib/clientMarketingService";
import { ClientMarketingServiceWorkspace } from "@/components/marketing/ClientMarketingServiceWorkspace";
import {
  AQUA_PHASE_ORDER,
  AQUA_MILESTONES,
  isAquaStage,
  getMilestoneState,
  isPhaseComplete,
} from "@/lib/server/onboardingMilestones";

// Phases that materialise into a per-client custom portal (architecture
// extension ch.19b). `aqua-mastery` is the Aqua-flavoured Live; `live`
// is the legacy generic Live still kept for compatibility.
const LIVE_STAGES: ReadonlySet<ClientStage> = new Set(["aqua-mastery", "live"]);
function isLivePhase(stage: ClientStage): boolean {
  return LIVE_STAGES.has(stage);
}

// System set the operator typically pulls into a Live-stage custom
// portal (chapter 19b §5a). Surfaced as a one-click "Recommended for
// Live" action on the Systems tab and as the default-checked system set
// in the Build-custom-portal wizard.
const LIVE_RECOMMENDED_PLUGINS: readonly string[] = [
  "website-editor",
  "client-crm",
  "forms",
  "ecommerce",
  "memberships",
  "affiliates",
  "agency-marketing",
];

// Repo root → `04-the-final-portal/clients/<slug>/` lives two levels
// above `portal/`. We resolve from `process.cwd()` (= the portal app
// root in dev + Vercel build) and walk up.
function customPortalExists(slug: string): boolean {
  const root = process.cwd();
  const path = join(root, "..", "clients", slug);
  return existsSync(path);
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatMeeting(ts: number | undefined): string | undefined {
  if (!ts) return undefined;
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ClientHome({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureHydrated();
  const { clientId } = await params;
  const sp = await searchParams;
  const session = await requireRoleForClient([...ALL_ROLES], clientId);
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) notFound();

  const rawTabInput = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabId = resolveClientWorkspaceTab(rawTabInput);
  const rawSystemView = Array.isArray(sp.systemView) ? sp.systemView[0] : sp.systemView;
  const systemView = rawSystemView === "properties" || rawSystemView === "website" ? rawSystemView : "monitoring";

  const installs = listInstalledFor({ agencyId: client.agencyId, clientId: client.id });
  const installedIds = new Set(installs.map(i => i.pluginId));
  const recentActivity = listActivity({ agencyId: client.agencyId, clientId: client.id, limit: 8 });

  const phases = listPhasesForAgency(client.agencyId);
  const currentPhase = phases.find(p => p.stage === client.stage);
  const meta = (client.metadata ?? {}) as {
    planTier?: "foundational" | "expansion" | "mastery";
    whatsappLink?: string;
    clientEmail?: string;
    leadSource?: string;
    lastContactedAt?: number;
    stripeLink?: string;
    lockInPaid?: boolean;
    therapistName?: string;
    practiceName?: string;
    notes?: string;
    nextMeetingAt?: number;
    meetingLink?: string;
    meetingNotes?: string;
    salesPresentations?: Array<{ id: string; title: string; url: string }>;
    callRecordingUrl?: string;
    sessionNotes?: string;
    inspirationLinks?: string[];
    potentialProblems?: string;
    potentialSolutions?: string;
    pricePoints?: string;
    budgetRange?: string;
    designFeedback?: string;
    supportNotes?: string;
    portalLoginEmail?: string;
    portalMode?: CustomerPortalMode;
    portalContactName?: string;
    portalServicePlan?: string;
    portalPlanSummary?: string;
    portalPlanIncludes?: string[];
    portalProducts?: import("@/lib/portalProducts").PortalProductSelection[];
    portalExperienceHeadline?: string;
    portalBillingCadence?: string;
    portalWelcomeNote?: string;
    portalSupportEmail?: string;
    portalSupportPhone?: string;
    portalSupportWhatsappUrl?: string;
    portalLogoUrl?: string;
    portalAccentColor?: string;
    buyingJourney?: {
      source?: string;
      capturedAt?: number;
      meetingAt?: number;
      meetingLink?: string;
      salesPresentations?: Array<{ id: string; title: string; url: string }>;
      callRecordingUrl?: string;
      sessionNotes?: string;
      inspirationLinks?: string[];
      potentialProblems?: string;
      potentialSolutions?: string;
      pricePoints?: string;
      budgetRange?: string;
      notes?: string;
    };
    clientRequests?: ClientRequest[];
    properties?: ClientProperty[];
    portalBuiltAt?: number;
    portalAccessSentAt?: number;
    portalAccessPreparedAt?: number;
    files?: Array<{ id: string; category?: string }>;
    contracts?: ClientContract[];
    commercialPack?: {
      invoiceNumber?: string;
      invoiceStatus?: string;
      agreementStatus?: string;
      signedDocumentDataUrl?: string;
      payments?: Array<{ amountCents: number }>;
      totalCents?: number;
    };
    portalBrief?: {
      businessOverview?: string;
      primaryGoal?: string;
      idealCustomer?: string;
      mustHaves?: string;
      launchTiming?: string;
      additionalNotes?: string;
      submittedAt?: number;
      submittedBy?: string;
    };
    portalApprovals?: ClientApproval[];
    clientEntityType?: ClientEntityType;
    linkedContacts?: unknown;
    clientMarketingService?: unknown;
  };
  const PLAN_LABELS: Record<NonNullable<typeof meta.planTier>, string> = {
    foundational: "Foundational Flow",
    expansion:    "Expansion Plan",
    mastery:      "Mastery Plan",
  };
  const planLabel = meta.planTier ? PLAN_LABELS[meta.planTier] : null;
  const servicePlanLabel = meta.portalServicePlan?.trim() || planLabel;
  const portalProviderName = client.companyId
    ? getTradingCompany(session.agencyId, client.companyId)?.name ?? "AquaOasis-Web"
    : "AquaOasis-Web";
  const customerPortalData = await loadCustomerPortalData(
    client,
    meta.portalContactName ?? client.name,
    portalProviderName,
    { audience: "agency" },
  );
  const contractTemplates: ClientContractTemplate[] = tab === "finance"
    ? [
        ...listContractTemplates(session.agencyId),
        ...listAgencyProducts(session.agencyId)
          .filter(product => Boolean(product.contractBody?.trim()))
          .map(product => ({
            id: `product:${product.id}`,
            agencyId: session.agencyId,
            title: product.contractTitle?.trim() || `${product.name} agreement`,
            summary: product.description,
            body: product.contractBody!.trim(),
            status: "active" as const,
            source: "product" as const,
            createdBy: "product-library",
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          })),
      ]
    : [];

  const live = isLivePhase(client.stage);
  const portalMaterialized = live && customPortalExists(client.slug);
  const liveRecommended = LIVE_RECOMMENDED_PLUGINS;
  const aquaHealth = calculateClientAquaHealth({
    financeConnected: Boolean(getInstall({ agencyId: session.agencyId }, "agency-finance")?.enabled),
    invoices: customerPortalData.invoices,
    lastContactedAt: meta.lastContactedAt,
    requestsObserved: Array.isArray(meta.clientRequests),
    requests: customerPortalData.requests,
    contracts: customerPortalData.contracts,
  });
  const selectedProducts = cleanPortalProducts(meta.portalProducts);
  const workspacesByProduct = new Map(clientProductWorkspaces(client).map(workspace => [workspace.productId, workspace]));
  const deliveryProducts = selectedProducts.map(product => {
    const workspace = workspacesByProduct.get(product.id);
    return {
      id: product.id,
      name: product.name,
      stage: workspace?.stage ? workspace.stage.replaceAll("-", " ") : meta.portalMode?.replaceAll("-", " ") || "onboarding",
      progress: workspace ? portalWorkspaceProgress(workspace) : 0,
    };
  });
  const clientMilestones = listClientMilestones(session.agencyId, client.id);
  const deliveryProgress = deliveryProducts.length
    ? Math.round(deliveryProducts.reduce((total, product) => total + product.progress, 0) / deliveryProducts.length)
    : null;
  const openMilestones = clientMilestones.filter(item => item.status !== "complete");
  const now = Date.now();
  const propertyRecords = Array.isArray(meta.properties) ? meta.properties : [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        {client.brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.brand.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-lg text-base font-semibold text-white"
            style={{ backgroundColor: client.brand.primaryColor }}
          >
            {client.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "·"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-black/90">{client.name}</h1>
          <div className="mt-2">
            <CommsRow
              clientId={client.id}
              initial={{
                whatsappLink: meta.whatsappLink ?? "",
                clientEmail: meta.clientEmail ?? "",
                lastContactedAt: meta.lastContactedAt ?? 0,
              }}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-black/60">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white"
              style={{ backgroundColor: client.brand.primaryColor }}
            >
              {phaseLabel(client.stage)}
            </span>
            {live && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Live
              </span>
            )}
            <PhaseTransitionButton
              clientId={client.id}
              currentStage={client.stage}
              isFounder={session.role === "agency-owner"}
            />
            {servicePlanLabel && (
              <span className="text-[11px] text-black/55">Plan: <span className="font-medium text-black/75">{servicePlanLabel}</span></span>
            )}
            <span className="text-[11px] text-black/55">Source: <span className="font-medium text-black/75">{meta.leadSource?.replace(/[-_]+/g, " ") || "Not recorded"}</span></span>
            {meta.lockInPaid && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                Deposit paid
              </span>
            )}
            {client.websiteUrl && (
              <a href={client.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {client.websiteUrl}
              </a>
            )}
            <Link href={`/portal/clients/${client.id}/settings`} className="font-medium text-brand hover:underline">
              {client.websiteUrl ? "Change domain" : "Add domain"}
            </Link>
          </div>
        </div>
        {live && (
          <div className="flex shrink-0 items-center">
            {portalMaterialized ? (
              <a
                href={`/clients/${client.slug}/`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
              >
                Open custom portal ↗
              </a>
            ) : (
              <BuildPortalWizard
                clientId={client.id}
                clientName={client.name}
                slug={client.slug}
                plugins={listPlugins().map<WizardPlugin>(plugin => {
                  const copy = toolCopy({
                    id: plugin.id,
                    name: plugin.name ?? plugin.id,
                    description: plugin.description,
                  });
                  return {
                    id: plugin.id,
                    name: copy.name,
                    description: copy.description,
                    installed: installedIds.has(plugin.id),
                    recommended: liveRecommended.includes(plugin.id),
                  };
                })}
              />
            )}
          </div>
        )}
      </header>

      <OverviewTabs clientId={client.id} active={tab} />

      {(() => {
        const pack = meta.commercialPack;
        const paidCents = pack?.payments?.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
        const gaps = [
          !pack?.invoiceNumber ? "Invoice missing" : null,
          !pack || (pack.agreementStatus !== "accepted" && !pack.signedDocumentDataUrl) ? "Signed agreement missing" : null,
          pack?.totalCents && paidCents < pack.totalCents ? `Payment outstanding (${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((pack.totalCents - paidCents) / 100)})` : null,
        ].filter((gap): gap is string => Boolean(gap));
        if (!gaps.length) return null;
        return (
          <section className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div><strong>Commercial records need attention</strong><span className="ml-2">{gaps.join(" · ")}</span></div>
            <Link href={`/portal/clients/${client.id}?tab=finance`} className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-red-200">Open finance</Link>
          </section>
        );
      })()}

      {tab === "overview" && (
        <ClientSpineOverview
          clientId={client.id}
          relationship={{
            score: aquaHealth.score,
            confidence: aquaHealth.confidence,
            state: aquaHealth.state,
            summary: aquaHealth.summary,
            openRequests: customerPortalData.requests.filter(request => request.status === "open").length,
          }}
          delivery={{
            progress: deliveryProgress,
            assignedProducts: deliveryProducts.length,
            openMilestones: openMilestones.length,
            blockedMilestones: openMilestones.filter(item => item.status === "blocked").length,
            overdueMilestones: openMilestones.filter(item => item.status !== "blocked" && Boolean(item.targetAt && item.targetAt < now)).length,
          }}
          systems={{
            properties: propertyRecords.length,
            tagsInstalled: propertyRecords.filter(property => property.tagStatus === "installed").length,
            tagsNeedingAttention: propertyRecords.filter(property => property.tagStatus === "missing" || property.tagStatus === "broken").length,
            websiteConnected: Boolean(client.websiteUrl),
          }}
          portalReady={Boolean(meta.portalBuiltAt)}
        />
      )}

      {tab === "relationship" && isAquaStage(client.stage) && (() => {
        const aquaPhases = phases.filter(p => AQUA_PHASE_ORDER.includes(p.stage));
        aquaPhases.sort((a, b) => AQUA_PHASE_ORDER.indexOf(a.stage) - AQUA_PHASE_ORDER.indexOf(b.stage));
        const currentIdx = AQUA_PHASE_ORDER.indexOf(client.stage);
        const onboardingPhases: OnboardingPhase[] = aquaPhases.map(p => {
          const idx = AQUA_PHASE_ORDER.indexOf(p.stage);
          const state: OnboardingPhase["state"] =
            idx < currentIdx ? "complete" : idx === currentIdx ? "active" : "future";
          const seeds = AQUA_MILESTONES[p.stage] ?? [];
          const milestones = getMilestoneState(client, p.stage).map(m => ({
            id: m.id,
            label: seeds.find(s => s.id === m.id)?.label ?? m.id,
            done: m.done,
          }));
          return {
            id: p.id,
            stage: p.stage,
            label: p.label,
            order: p.order,
            state,
            milestones,
            allComplete: isPhaseComplete(client, p.stage),
          };
        });
        return (
          <OnboardingDashboardPanel
            clientId={client.id}
            phases={onboardingPhases}
            currentStage={client.stage}
          />
        );
      })()}

      {tab === "relationship" && (
        <section className="grid gap-4 md:grid-cols-2">
          <ClientContactsPanel
            clientId={client.id}
            initialEntityType={meta.clientEntityType === "person" ? "person" : "company"}
            initialContacts={cleanClientContacts(meta.linkedContacts)}
            canEdit={isAgencyRole(session.role)}
          />
          <div className="md:col-span-2">
            <CollapsibleSection
              title="Client context"
              description="Sales notes, goals, recordings, budget, and useful links."
              badge={meta.portalLoginEmail ? "Portal ready" : undefined}
            >
            <div className="grid gap-3 lg:grid-cols-3">
              <ContextItem label="Budget" value={meta.budgetRange ?? meta.buyingJourney?.budgetRange} />
              <ContextItem label="Price points" value={meta.pricePoints ?? meta.buyingJourney?.pricePoints} />
              <ContextItem label="Next meeting" value={formatMeeting(meta.nextMeetingAt ?? meta.buyingJourney?.meetingAt)} />
              <ContextItem label="Problems to solve" value={meta.potentialProblems ?? meta.buyingJourney?.potentialProblems} wide />
              <ContextItem label="Potential solutions" value={meta.potentialSolutions ?? meta.buyingJourney?.potentialSolutions} wide />
              <ContextItem label="Session notes" value={meta.sessionNotes ?? meta.buyingJourney?.sessionNotes ?? meta.meetingNotes ?? meta.notes} wide />
              <ContextItem label="Design feedback" value={meta.designFeedback} wide />
              <ContextItem label="Support notes" value={meta.supportNotes} wide />
              <ContextItem label="Business overview" value={meta.portalBrief?.businessOverview} wide />
              <ContextItem label="Customer's goal" value={meta.portalBrief?.primaryGoal} wide />
              <ContextItem label="Ideal customer" value={meta.portalBrief?.idealCustomer} />
              <ContextItem label="Must-haves" value={meta.portalBrief?.mustHaves} wide />
              <ContextItem label="Launch timing" value={meta.portalBrief?.launchTiming} />
              <ContextItem label="Additional brief notes" value={meta.portalBrief?.additionalNotes} wide />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {meta.meetingLink && <ExternalPill href={meta.meetingLink} label="Meeting link" />}
              {meta.buyingJourney?.meetingLink && !meta.meetingLink && <ExternalPill href={meta.buyingJourney.meetingLink} label="Meeting link" />}
              {meta.callRecordingUrl && <ExternalPill href={meta.callRecordingUrl} label="Call recording" />}
              {meta.buyingJourney?.callRecordingUrl && !meta.callRecordingUrl && <ExternalPill href={meta.buyingJourney.callRecordingUrl} label="Call recording" />}
              {(meta.salesPresentations ?? meta.buyingJourney?.salesPresentations ?? []).map(presentation => (
                <ExternalPill key={presentation.id} href={presentation.url} label={presentation.title} />
              ))}
              {(meta.inspirationLinks ?? meta.buyingJourney?.inspirationLinks ?? []).map((href, index) => (
                <ExternalPill key={`${href}:${index}`} href={href} label={`Inspiration ${index + 1}`} />
              ))}
              <Link href={`/portal/clients/${client.id}?tab=files`} className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]">
                Add files / screenshots
              </Link>
            </div>
            </CollapsibleSection>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Phase</h2>
            <div className="mt-2 text-base font-semibold text-black/90">{phaseLabel(client.stage)}</div>
            {currentPhase?.description && (
              <p className="mt-1 text-sm text-black/60">{phaseDescription(currentPhase.description)}</p>
            )}
            <div className="mt-3 text-xs text-black/55">
              {Array.isArray(meta.properties) ? meta.properties.length : 0} connected propert{Array.isArray(meta.properties) && meta.properties.length === 1 ? "y" : "ies"} ·{" "}
              {Array.isArray(meta.properties) ? meta.properties.filter(property => property.tagStatus === "installed").length : 0} monitored
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Quick actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={clientWorkspaceHref(client.id, "systems", { systemView: "website" })} className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white shadow hover:opacity-90">
                Edit website
              </Link>
              <Link href={clientWorkspaceHref(client.id, "portal")} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                {meta.portalBuiltAt ? "Portal preview" : "Create client portal"}
              </Link>
              <Link href={clientWorkspaceHref(client.id, "systems")} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                + Add system
              </Link>
              {meta.whatsappLink && (
                <a
                  href={meta.whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Open WhatsApp group ↗
                </a>
              )}
              {meta.stripeLink && (
                <a
                  href={meta.stripeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5"
                >
                  Stripe / invoice ↗
                </a>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <CollapsibleSection title="Recent activity" description="The latest changes to this client." badge={String(recentActivity.length)}>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-black/55">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {recentActivity.map(a => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-1.5 last:border-0">
                    <span className="text-black/80">{a.message}</span>
                    <span className="shrink-0 text-[11px] text-black/45">{formatRelative(a.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
            </CollapsibleSection>
          </div>
        </section>
      )}

      {tab === "delivery" && (
        <div className="grid gap-7">
          <ClientDeliveryOverview
            clientId={client.id}
            products={deliveryProducts}
            milestones={clientMilestones.map(item => ({ id: item.id, title: item.title, status: item.status, targetAt: item.targetAt }))}
            portalReady={Boolean(meta.portalBuiltAt)}
          />
          <KanbanTabClient clientId={client.id} clientName={client.name} />
          {(() => {
            try {
              assertSopsAccess(session, undefined);
            } catch (err) {
              if (err instanceof SopsAccessError) return null;
              throw err;
            }
            return <ClientSopsTab families={familiesForStage(client.stage)} phaseLabel={phaseLabel(client.stage)} />;
          })()}
        </div>
      )}

      {tab === "marketing" && (
        <ClientMarketingServiceWorkspace
          clientId={client.id}
          clientName={client.name}
          initial={cleanClientMarketingService(meta.clientMarketingService)}
          canManage={isAgencyRole(session.role)}
          canApprove={!isAgencyRole(session.role)}
        />
      )}

      {tab === "portal" && (
        <FulfilmentPortalPreview
          clientId={client.id}
          clientName={client.name}
          initial={{
            mode: meta.portalMode,
            loginEmail: meta.portalLoginEmail ?? meta.clientEmail ?? client.ownerEmail ?? "",
            contactName: meta.portalContactName ?? meta.therapistName ?? "",
            servicePlan: servicePlanLabel ?? "",
            planSummary: meta.portalPlanSummary ?? "",
            planIncludes: meta.portalPlanIncludes ?? [],
            products: meta.portalProducts ?? [],
            experienceHeadline: meta.portalExperienceHeadline ?? "",
            billingCadence: meta.portalBillingCadence ?? "As agreed",
            welcomeNote: meta.portalWelcomeNote ?? "",
            supportEmail: meta.portalSupportEmail ?? customerPortalData.support.email ?? "",
            supportPhone: meta.portalSupportPhone ?? customerPortalData.support.phone ?? "",
            supportWhatsappUrl: meta.portalSupportWhatsappUrl ?? customerPortalData.support.whatsappUrl ?? "",
            logoUrl: meta.portalLogoUrl ?? "",
            accentColor: meta.portalAccentColor ?? "#8b6c33",
            billingUrl: meta.stripeLink ?? "",
            websiteUrl: client.websiteUrl,
            stageLabel: phaseLabel(client.stage),
            portalBuiltAt: meta.portalBuiltAt,
            accessSentAt: meta.portalAccessSentAt,
            accessPreparedAt: meta.portalAccessPreparedAt,
            fileCount: customerPortalData.files.length,
            invoiceCount: customerPortalData.invoices.length,
            outstandingInvoiceCount: customerPortalData.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue").length,
            contractCount: customerPortalData.contracts.filter(contract => contract.status === "accepted").length,
            propertyCount: customerPortalData.properties.length,
            tagInstalledCount: customerPortalData.properties.filter(property => property.tagStatus === "installed").length,
            approvals: customerPortalData.approvals,
          }}
        />
      )}

      {tab === "systems" && (
        <RequirePermission session={session} requires={["clients.view"]}>
          <div className="grid gap-6">
            <nav aria-label="Technical workspace views" className="grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-3">
              <Link href={clientWorkspaceHref(client.id, "systems")} className={`flex min-h-16 items-center gap-3 bg-white px-4 text-sm font-semibold ${systemView === "monitoring" ? "text-brand" : "text-black/58"}`}><MonitorCog size={17} /> Monitoring</Link>
              <Link href={clientWorkspaceHref(client.id, "systems", { systemView: "properties" })} className={`flex min-h-16 items-center gap-3 bg-white px-4 text-sm font-semibold ${systemView === "properties" ? "text-brand" : "text-black/58"}`}><Boxes size={17} /> Properties and deployments</Link>
              <Link href={clientWorkspaceHref(client.id, "systems", { systemView: "website" })} className={`flex min-h-16 items-center gap-3 bg-white px-4 text-sm font-semibold ${systemView === "website" ? "text-brand" : "text-black/58"}`}><Globe2 size={17} /> Website editor</Link>
            </nav>
            {systemView === "monitoring" ? (
              <ClientSystemsWorkspace clientId={client.id} clientName={client.name} properties={propertyRecords} />
            ) : systemView === "properties" ? (
              <PropertiesTabClient
                clientId={client.id}
                clientName={client.name}
                initialProperties={propertyRecords}
                githubPublishingConfigured={isGitHubPublishingConfiguredForAgency(session.agencyId, client.id)}
                vercelDeploymentConfigured={isVercelProjectDeploymentConfiguredForAgency(session.agencyId, client.id)}
              />
            ) : (
              <section className="border-y border-black/10 bg-white py-6">
                <h2 className="text-lg font-medium text-black/90">Website editor</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-black/60">Visually build pages and responsive sections, add custom code, preview every device, and publish when {client.name} is ready.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <WebsiteBuilderLauncher clientId={client.id} ready={installs.some(install => install.pluginId === "website-editor" && install.enabled)} />
                  {client.websiteUrl ? <a href={client.websiteUrl} target="_blank" rel="noreferrer" className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">Open live site ↗</a> : null}
                </div>
              </section>
            )}
          </div>
        </RequirePermission>
      )}

      {tab === "finance" && (
        <RequirePermission session={session} requires={["finance.view"]}>
          <FinanceTabClient
            clientId={client.id}
            clientName={client.name}
            recipientEmail={meta.portalLoginEmail ?? meta.clientEmail ?? client.ownerEmail}
            initialContracts={Array.isArray(meta.contracts) ? meta.contracts : []}
            initialContractTemplates={contractTemplates}
            initial={{
              planTier: meta.planTier,
              servicePlan: servicePlanLabel ?? undefined,
              lockInPaid: meta.lockInPaid,
              stripeLink: meta.stripeLink,
            }}
          />
        </RequirePermission>
      )}

      {tab === "communications" && (
        <div className="grid gap-5">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Relationship communications</p><h2 className="mt-2 text-2xl font-semibold text-black/88">Messages and requests</h2><p className="mt-1 text-sm text-black/55">Support history, customer requests, replies, and the handoff into the unified Master Inbox.</p></div>
            <Link href={`/portal/agency/inbox?view=all&thread=profile:${encodeURIComponent(client.id)}`} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white">Open unified inbox</Link>
          </header>
          <ClientRequestsPanel clientId={client.id} initialRequests={meta.clientRequests ?? []} />
        </div>
      )}

      {tab === "files" && (
        <div className="grid gap-5">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/38">Shared evidence</p><h2 className="mt-2 text-2xl font-semibold text-black/88">Files and assets</h2><p className="mt-1 text-sm text-black/55">Working files, customer uploads, screenshots, brand assets, and delivery evidence in one lens.</p></div><Link href={`/portal/clients/${client.id}/assets`} className="rounded-md border border-black/12 bg-white px-4 py-2 text-sm font-semibold text-black/65">Open asset library</Link></header>
          <FilesTabClient
            clientId={client.id}
            initialFiles={(((client.metadata ?? {}) as { files?: Array<{
              id: string; name: string; url: string;
              category: FileCategory; uploadedBy?: string; uploadedAt: number;
            }> }).files) ?? []}
          />
        </div>
      )}

      {tab === "notes" && (
        <ClientNotesWorkspace
          clientId={client.id}
          initial={{
            notes: meta.notes ?? meta.buyingJourney?.notes ?? "",
            sessionNotes: meta.sessionNotes ?? meta.buyingJourney?.sessionNotes ?? "",
            meetingNotes: meta.meetingNotes ?? "",
            supportNotes: meta.supportNotes ?? "",
          }}
        />
      )}
    </div>
  );
}

function ContextItem({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-black/10 bg-black/[0.02] p-3 ${wide ? "lg:col-span-3" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/75">{value || "Not captured yet."}</p>
    </div>
  );
}

function ExternalPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
    >
      {label} ↗
    </a>
  );
}

function phaseDescription(description: string): string {
  return description
    .replace(
      /\bOnboarding form \+ welcome scroll\. No plugin installs yet\./gi,
      "Collect the brief, contacts, content, and access needed to begin.",
    )
    .replace(/\bNo plugin installs yet\./gi, "Everything needed for this phase is built in.")
    .replace(/\bAll plugins disabled, config preserved\./gi, "Engagement ended; history and settings are preserved.")
    .replace(/\bplugin installs\b/gi, "system setup")
    .replace(/\bplugins\b/gi, "systems");
}
