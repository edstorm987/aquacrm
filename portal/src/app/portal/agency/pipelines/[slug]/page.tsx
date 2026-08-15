// /portal/agency/pipelines/<slug> — single pipeline kanban view.
//
// T1 R034 foundation surface. Foundation fetches the pipeline + its
// column shape + a virtual card list (from clients for fulfilment,
// from PipelineCard rows for everything else) and renders the column
// scaffold. T2's kanban plugin (R+1) replaces the body with the real
// drag-drop board; until then the columns + card snapshots ship a
// readable, accessible view of pipeline state.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import {
  getPipelineBySlug,
  listPipelines,
  listCards,
} from "@/server/pipelines";
import { phaseLabel } from "@/server/phases";
import { getInstall } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { LeadsPipelineWorkspace } from "./_LeadsPipelineWorkspace";
import { BoardSwitcher, PipelineBoard } from "./_PipelineBoard";
import { FulfilmentProductSwitcher } from "./_FulfilmentProductSwitcher";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { cleanPortalProducts, PORTAL_PRODUCT_CATALOG, type PortalProductKey } from "@/lib/portalProducts";
import { defaultProductPipelineStage, PRODUCT_PIPELINE_COLUMNS } from "@/lib/fulfilmentProductPipelines";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { isLeadJourneyEligible } from "@/lib/enquiryClassification";

interface RouteProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ product?: string }>;
}

export default async function PipelineView({ params, searchParams }: RouteProps) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const agency = getAgency(session.agencyId)!;
  const { slug } = await params;
  ensureDefaultAgencyProducts(agency.id);
  const agencyProducts = listAgencyProducts(agency.id);
  const activeBrands = listTradingCompanies(agency.id).filter(company => company.status !== "archived");

  const pipeline = getPipelineBySlug(agency.id, slug);
  if (!pipeline) notFound();
  if (pipeline.kind === "sales") redirect("/portal/agency/pipelines/leads");

  const allPipelines = listPipelines(agency.id);
  const boardLinks = allPipelines
    .filter(item => item.kind === "leads" || item.kind === "fulfilment")
    .sort((a, b) => {
      if (a.kind === b.kind) return 0;
      return a.kind === "leads" ? -1 : 1;
    })
    .map(item => ({
      slug: item.slug,
      label: item.kind === "leads" ? "Sales & leads" : "Fulfilment",
    }));

  if (pipeline.kind === "leads") {
    let install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    if (!install) {
      const result = await installPlugin("leads-pipeline", {
        scope: { agencyId: agency.id },
        installedBy: session.userId,
      });
      if (result.ok) install = result.install;
    } else if (!install.enabled) {
      await setPluginEnabled({ agencyId: agency.id }, "leads-pipeline", true);
      install = getInstall({ agencyId: agency.id }, "leads-pipeline");
    }
    if (install?.enabled) {
      const storage = makePluginStorage(install.id);
      const { leads, prospects } = leadsContainerFor({ agencyId: agency.id, storage: storage as never });
      const [leadList, prospectList] = await Promise.all([leads.list(), prospects.list()]);
      const journeyLeadList = leadList.filter(isLeadJourneyEligible);
      const clients = listClients(agency.id);
      const cards = listCards(pipeline.id);
      const columnByLeadId = new Map<string, string>();
      const cardUpdatedAtByLeadId = new Map<string, number>();
      for (const card of cards) {
        if (card.kind !== "lead") continue;
        const snapshot = card.lead as unknown as { leadId?: string; email?: string };
        const key = snapshot.leadId ?? journeyLeadList.find(lead => lead.email === snapshot.email)?.id;
        if (key) {
          columnByLeadId.set(key, card.columnId);
          cardUpdatedAtByLeadId.set(key, card.updatedAt);
        }
      }

      return (
        <LeadsPipelineWorkspace
          referenceNow={Date.now()}
          columns={pipeline.columns.map(col => ({ id: col.id, label: col.label, color: col.color }))}
          prospects={prospectList.filter(prospect => prospect.status === "scouting").map(prospect => ({
            id: prospect.id,
            name: prospect.name,
            company: prospect.company,
            email: prospect.email,
            phone: prospect.phone,
            website: prospect.website,
            address: prospect.address,
            googleMapsUrl: prospect.googleMapsUrl,
            instagramUrl: prospect.instagramUrl,
            facebookUrl: prospect.facebookUrl,
            linkedinUrl: prospect.linkedinUrl,
            niche: prospect.niche,
            tags: prospect.tags,
            source: prospect.source,
            foundAt: prospect.foundAt,
            opportunity: prospect.opportunity,
            researchNotes: prospect.researchNotes,
            nextStep: prospect.nextStep,
            qualificationState: prospect.qualificationState,
            fitScore: prospect.fitScore,
            preferredChannel: prospect.preferredChannel,
            doNotContact: prospect.doNotContact,
            nextContactAt: prospect.nextContactAt,
            nextContactReason: prospect.nextContactReason,
            lastContactedAt: prospect.lastContactedAt,
            inspectionChecks: prospect.inspectionChecks,
            inspectedAt: prospect.inspectedAt,
            followUps: prospect.followUps,
            outreachAttempts: prospect.outreachAttempts,
            notes: prospect.notes,
            capturedAt: prospect.capturedAt,
            updatedAt: prospect.updatedAt,
          }))}
          leads={journeyLeadList.map(lead => {
            const client = clients.find(candidate => {
              const sameLead = candidate.metadata?.leadId === lead.id;
              const sameEmail = candidate.ownerEmail?.trim().toLowerCase() === lead.email.trim().toLowerCase();
              return sameLead || sameEmail;
            });
            const clientMetadata = client?.metadata ?? {};
            const services = cleanPortalProducts(clientMetadata.portalProducts ?? clientMetadata.products);
            const canonicalServiceIds = (lead.serviceLines ?? []).map(value => agencyProducts.find(product => product.id === value || product.name.toLowerCase() === value.toLowerCase())?.id ?? value);
            const serviceIds = [...new Set([...services.map(service => service.id), ...canonicalServiceIds])];
            return {
              id: lead.id,
              clientId: client?.id,
              email: lead.email,
              name: lead.name,
              phone: lead.phone,
              company: lead.company,
              source: lead.source,
              tags: lead.tags,
              notes: lead.notes,
              capturedAt: lead.capturedAt,
              lastEnquiryAt: lead.lastEnquiryAt,
              lastEnquiryRespondedAt: lead.lastEnquiryRespondedAt,
              enquiryCount: lead.enquiryCount,
              firstContactedAt: lead.firstContactedAt,
              lastContactedAt: lead.lastContactedAt,
              currentStageId: columnByLeadId.get(lead.id) ?? lead.currentStageId ?? pipeline.columns[0]?.id ?? "new",
              stageEnteredAt: lead.currentStageId === (columnByLeadId.get(lead.id) ?? lead.currentStageId)
                ? lead.stageEnteredAt
                : cardUpdatedAtByLeadId.get(lead.id) ?? lead.stageEnteredAt,
              convertedAt: lead.convertedAt,
              journeyEvents: lead.journeyEvents,
              nextMeetingAt: lead.nextMeetingAt,
              meetingLink: lead.meetingLink,
              meetingNotes: lead.meetingNotes,
              meetingMode: lead.meetingMode,
              meetingLocation: lead.meetingLocation,
              meetingStatus: lead.meetingStatus,
              meetingConfirmedAt: lead.meetingConfirmedAt,
              meetingReminderAt: lead.meetingReminderAt,
              meetingReminderSentAt: lead.meetingReminderSentAt,
              meetingAttempts: lead.meetingAttempts,
              salesPresentations: lead.salesPresentations,
              callRecordingUrl: lead.callRecordingUrl,
              sessionNotes: lead.sessionNotes,
              inspirationLinks: lead.inspirationLinks,
              potentialProblems: lead.potentialProblems,
              potentialSolutions: lead.potentialSolutions,
              pricePoints: lead.pricePoints,
              budgetRange: lead.budgetRange,
              designFeedback: lead.designFeedback,
              supportNotes: lead.supportNotes,
              existingServicePlan: typeof clientMetadata.portalServicePlan === "string"
                ? clientMetadata.portalServicePlan
                : undefined,
              existingProductId: services[0]?.id,
              existingProjectValue: typeof clientMetadata.agreedProjectValue === "string"
                ? clientMetadata.agreedProjectValue
                : undefined,
              existingBillingCadence: typeof clientMetadata.portalBillingCadence === "string"
                ? clientMetadata.portalBillingCadence
                : undefined,
              niche: typeof lead.customFields?.niche === "string"
                ? lead.customFields.niche
                : lead.tags.find(tag => tag.startsWith("niche:"))?.slice("niche:".length).replace(/-/g, " "),
              sentCount: lead.sentCount,
              columnId: columnByLeadId.get(lead.id) ?? pipeline.columns[0]?.id ?? "new",
              brandId: client?.companyId ?? lead.companyId ?? lead.companyIds?.[0],
              brandName: activeBrands.find(brand => brand.id === (client?.companyId ?? lead.companyId ?? lead.companyIds?.[0]))?.name,
              serviceIds,
              serviceNames: serviceIds.map(id => services.find(service => service.id === id)?.name ?? agencyProducts.find(product => product.id === id)?.name ?? id),
              enquiryId: typeof lead.customFields?.enquiryId === "string" ? lead.customFields.enquiryId : undefined,
              enquiryClassification: lead.customFields?.enquiryClassification === "sales" ? "sales" : undefined,
            };
          })}
          importHref="/portal/agency/leads-pipeline/contacts"
          campaignsHref="/portal/agency/marketing"
          boards={boardLinks}
          brands={activeBrands.map(brand => ({ id: brand.id, name: brand.name }))}
          products={agencyProducts.map(product => ({
            id: product.id,
            kind: product.kind,
            name: product.name,
            category: product.category,
            description: product.description ?? "",
            buyerHeadline: product.buyerHeadline,
            portalRequirement: product.portalRequirement,
            includedProductIds: product.includedProductIds,
            pricing: product.pricing,
            priceCents: product.priceCents,
            billingInterval: product.billingInterval,
          }))}
        />
      );
    }
  }

  if (pipeline.kind === "fulfilment") {
    const clients = listClients(agency.id);
    const productViews = PORTAL_PRODUCT_CATALOG.map(product => ({
      key: product.catalogKey,
      label: product.name,
    }));
    const requestedProduct = (await searchParams).product;
    const selectedProduct = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === requestedProduct);

    if (!selectedProduct) {
      const productCounts = new Map<PortalProductKey, number>();
      const overviewRows = clients.map(client => {
        const products = cleanPortalProducts(client.metadata?.portalProducts);
        for (const product of products) {
          if (product.catalogKey) productCounts.set(product.catalogKey, (productCounts.get(product.catalogKey) ?? 0) + 1);
        }
        return { client, products };
      });

      return (
        <div className="flex flex-col gap-6" data-testid="fulfilment-overview">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Journey</p>
              <h1 className="mt-1 text-2xl font-semibold text-black/90">Fulfilment overview</h1>
              <p className="mt-1 max-w-2xl text-sm text-black/55">See every client and open the delivery board that matches what they bought.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BoardSwitcher boards={boardLinks} activeSlug={pipeline.slug} />
              <FulfilmentProductSwitcher products={productViews} />
            </div>
          </header>

          <section aria-labelledby="product-pipelines-heading">
            <div className="flex items-end justify-between border-b border-black/10 pb-3">
              <div>
                <h2 id="product-pipelines-heading" className="text-sm font-semibold text-black/75">Product pipelines</h2>
                <p className="mt-1 text-xs text-black/45">Each service keeps its own stages and progress.</p>
              </div>
              <span className="text-xs tabular-nums text-black/40">{clients.length} clients</span>
            </div>
            <div className="grid gap-x-6 border-b border-black/10 sm:grid-cols-2 lg:grid-cols-3">
              {PORTAL_PRODUCT_CATALOG.map(product => (
                <Link
                  key={product.catalogKey}
                  href={`/portal/agency/pipelines/fulfilment?product=${product.catalogKey}`}
                  className="flex min-h-16 items-center justify-between gap-3 border-b border-black/[0.07] py-3 text-sm hover:text-brand"
                >
                  <span>
                    <span className="block font-medium text-black/75">{product.name}</span>
                    <span className="mt-0.5 block text-xs text-black/40">{product.projectLabel} delivery</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-black/45">{productCounts.get(product.catalogKey) ?? 0}</span>
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="client-delivery-heading">
            <div className="flex items-end justify-between border-b border-black/10 pb-3">
              <div>
                <h2 id="client-delivery-heading" className="text-sm font-semibold text-black/75">Clients and services</h2>
                <p className="mt-1 text-xs text-black/45">A client can appear in more than one product pipeline.</p>
              </div>
            </div>
            <div className="divide-y divide-black/[0.08]">
              {overviewRows.map(({ client, products }) => (
                <div key={client.id} className="grid min-h-20 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1.5fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <Link href={`/portal/clients/${client.id}?tab=delivery`} className="truncate text-sm font-semibold text-black/80 hover:underline">{client.name}</Link>
                    <p className="mt-0.5 text-xs text-black/40">{phaseLabel(client.stage)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {products.map(product => product.catalogKey ? (
                      <Link key={product.id} href={`/portal/agency/pipelines/fulfilment?product=${product.catalogKey}`} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-medium text-black/55 hover:bg-black/[0.09]">
                        {product.name}
                      </Link>
                    ) : (
                      <span key={product.id} className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] text-black/50">{product.name}</span>
                    ))}
                    {products.length === 0 ? <span className="text-xs text-amber-700">No services assigned</span> : null}
                  </div>
                  <Link href={`/portal/clients/${client.id}?tab=delivery`} className="text-xs font-medium text-black/55 hover:text-black">Manage</Link>
                </div>
              ))}
              {overviewRows.length === 0 ? <p className="py-12 text-center text-sm text-black/40">No clients yet.</p> : null}
            </div>
          </section>
        </div>
      );
    }

    const productKey = selectedProduct.catalogKey;
    const columns = PRODUCT_PIPELINE_COLUMNS[productKey];
    const cards = clients.flatMap(client => {
      const products = cleanPortalProducts(client.metadata?.portalProducts);
      if (!products.some(product => product.catalogKey === productKey)) return [];
      const storedStages = client.metadata?.productPipelineStages;
      const productStages = storedStages && typeof storedStages === "object"
        ? storedStages as Record<string, unknown>
        : {};
      const storedStage = typeof productStages[productKey] === "string" ? productStages[productKey] : "";
      const columnId = columns.some(column => column.id === storedStage)
        ? storedStage
        : defaultProductPipelineStage(productKey, client.stage);
      return [{
        id: client.id,
        label: client.name,
        sub: selectedProduct.name,
        href: `/portal/clients/${client.id}?tab=delivery`,
        columnId,
      }];
    });

    return (
      <PipelineBoard
        title={`${selectedProduct.name} delivery`}
        eyebrow="Fulfilment"
        description={`Track ${selectedProduct.name.toLowerCase()} work through stages designed for this service.`}
        activeSlug={pipeline.slug}
        boards={boardLinks}
        columns={columns}
        cards={cards}
        productKey={productKey}
        productViews={productViews}
      />
    );
  }

  // Card source: fulfilment projects from Client rows when no migration
  // has run yet (returns the canonical client snapshots). All other
  // pipelines read from PipelineCard storage directly.
  let columnCards: Record<string, Array<{ id: string; label: string; sub?: string; href?: string }>> = {};
  for (const col of pipeline.columns) columnCards[col.id] = [];

  for (const card of listCards(pipeline.id)) {
    const bucket = columnCards[card.columnId] ?? (columnCards[card.columnId] = []);
    if (card.kind === "lead") {
      bucket.push({ id: card.id, label: card.lead.name ?? card.lead.email, sub: card.lead.source });
    } else if (card.kind === "deal") {
      bucket.push({
        id: card.id,
        label: card.deal.title,
        sub: card.deal.amount ? `$${card.deal.amount}` : undefined,
      });
    } else if (card.kind === "client") {
      const c = listClients(agency.id).find(c => c.id === card.clientId);
      bucket.push({ id: card.id, label: c?.name ?? card.clientId });
    } else {
      bucket.push({ id: card.id, label: "Custom card" });
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="pipeline-view" data-pipeline-slug={pipeline.slug}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-black/45">{pipelineKindLabel(pipeline.kind)}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-black/90">{pipelineName(pipeline.name, pipeline.kind)}</h1>
        </div>
        <nav aria-label="Work boards" className="flex flex-wrap gap-2">
          {boardLinks.map(item => (
            <Link
              key={item.slug}
              href={`/portal/agency/pipelines/${item.slug}`}
              aria-current={item.slug === pipeline.slug ? "page" : undefined}
              className={[
                "inline-flex min-h-10 items-center rounded-md border px-3 text-xs font-medium",
                item.slug === pipeline.slug
                  ? "border-black bg-black text-white"
                  : "border-black/10 bg-white text-black/65 hover:border-black/20",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-3 overflow-x-auto lg:w-max lg:grid-flow-col lg:auto-cols-[240px]" data-testid="pipeline-columns">
        {pipeline.columns.map(col => {
          const cards = columnCards[col.id] ?? [];
          return (
            <section
              key={col.id}
              data-testid={`column-${col.id}`}
              className="flex flex-col rounded-lg border border-black/10 bg-white/70 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-black/85">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: col.color ?? "#0EA5A4" }}
                    aria-hidden="true"
                  />
                  {col.label}
                </h2>
                <span className="rounded-full bg-black/5 px-1.5 py-px text-[11px] text-black/55">{cards.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {cards.map(card => (
                  <li
                    key={card.id}
                    data-testid={`pipeline-card-${card.id}`}
                    className="rounded-md border border-black/5 bg-white p-2 text-sm shadow-sm"
                  >
                    {card.href ? (
                      <Link href={card.href} className="block hover:underline">{card.label}</Link>
                    ) : (
                      <span>{card.label}</span>
                    )}
                    {card.sub && <div className="text-[11px] text-black/55">{card.sub}</div>}
                  </li>
                ))}
                {cards.length === 0 && (
                  <li className="rounded-md border border-dashed border-black/10 p-2 text-[11px] text-black/40">
                    Empty
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function pipelineName(name: string, kind: string): string {
  if (kind === "fulfilment" || name.toLowerCase() === "fulfilment") return "Project pipeline";
  return name;
}

function pipelineKindLabel(kind: string): string {
  if (kind === "fulfilment") return "project work";
  return kind.replace(/-/g, " ");
}
